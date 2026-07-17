import { fitElo, type PairResult } from "./elo";
import { pairingSpecs, type WorkerPool } from "./parallel";
import { walkGauntletSprt, type GauntletSprtConfig, type GauntletVerdict } from "./sprt";

// ---------------------------------------------------------------------------
// The gauntlet — the selection half of the evolution loop (see EVOLUTION.md
// "Measurement"). A candidate doesn't just face its predecessor; it plays the
// whole FIELD (the past champions — NEVER `dumb`, a null stub that measures
// nothing). v1 is the published floor but is excluded from the DEFAULT field as a
// dominated, slow pairing (METHOD.md Decision 8); the CLI re-adds it with
// `--with-v1`. When v1 is absent the Elo fit anchors at the base instead of v1=0.
// Each candidate-vs-opponent pairing is decided by SPRT, so
// strong edges resolve in dozens of games and marginal ones play long or are
// rejected. The bar to accept a candidate as the new champion:
//
//     IMPROVES vs its base   AND   REGRESSES against none.
//
// On top of accept/reject we fit an Elo rating across the whole field, so
// "champion" means HIGHEST Elo (robust to non-transitivity), not "beat the last
// guy". Games run on the parallel pool; the math here is pure.
// ---------------------------------------------------------------------------

/** A decision-ready reading of a single pairing's SPRT outcome. `even` is a
 *  CONFIDENT tie (both one-sided tests rejected ±E); `inconclusive` ran out of
 *  games. Both mean "not an improvement and not a regression". */
export type PairVerdict = "better" | "worse" | "even" | "inconclusive";

function classify(v: GauntletVerdict): PairVerdict {
  if (v === "better" || v === "worse" || v === "even") return v;
  return "inconclusive"; // inconclusive or (defensively) need-more
}

/** One candidate-vs-opponent SPRT pairing, fully resolved. */
export interface PairingRun {
  opponent: string;
  verdict: PairVerdict;
  /** Candidate wins / losses AT the SPRT stop point (the sample the verdict and
   *  the Elo estimate are built from). */
  wins: number;
  losses: number;
  decisive: number;
  /** Capped games seen across the whole run — discarded from the test, reported
   *  as the deadlock health metric. */
  draws: number;
  errors: number;
  /** Total games generated (including any past the stop point and any draws). */
  generated: number;
  /** LLRs of the improvement ([0,+E]) and regression ([0,−E]) tests at the stop. */
  llrImprove: number;
  llrRegress: number;
}

export interface GauntletOptions {
  candidate: string;
  /** The version the candidate must beat to be promoted (its predecessor / the
   *  current loop champion). Must be one of `field`. */
  base: string;
  /** Every opponent to test against — v1 … latest, excluding the candidate and
   *  `dumb`. */
  field: readonly string[];
  /** Seed-stream namespace; use a distinct prefix for the held-out set so a
   *  candidate is confirmed on seeds it wasn't tuned on (e.g. "train" / "holdout"). */
  prefix: string;
  /** SPRT indifference margin E (Elo): improvement test [0,+E], regression [0,−E]. */
  margin: number;
  alpha: number;
  beta: number;
  /** Decisive-game cap per candidate pairing before declaring it inconclusive. */
  maxDecisive: number;
  /** Fixed games per field-internal pairing, played only to anchor the Elo fit
   *  (those pairings aren't under test). */
  fieldGames: number;
  maxTurns: number;
  /** Games generated per SPRT round; bigger = fewer round-trips, more overshoot
   *  past the crossing. Defaults to a few per worker. */
  batchGames?: number;
  pool: WorkerPool;
  /** Optional live-progress hook, fired after every SPRT batch and when each
   *  pairing resolves — purely cosmetic (a CLI progress line), never affects the
   *  deterministic game stream or verdict. */
  onProgress?: (p: GauntletProgress) => void;
}

/** A live snapshot of one pairing mid-run, for a progress indicator. */
export interface GauntletProgress {
  /** `candidate` = a promotion pairing (SPRT, capped at `maxDecisive`); `field` =
   *  an Elo-anchoring field-internal pairing (fixed `maxDecisive` = its game count). */
  kind: "candidate" | "field";
  /** The opponent (candidate pairing) or "a-vs-b" (field pairing). */
  opponent: string;
  /** 1-based position and count WITHIN this phase (candidate pairings, or field). */
  pairIndex: number;
  pairTotal: number;
  decisive: number;
  wins: number;
  losses: number;
  draws: number;
  /** Decisive-game cap for this pairing (the denominator for a progress bar). */
  maxDecisive: number;
  llrImprove: number;
  llrRegress: number;
  /** True on the final emit for a pairing; `verdict` is then set. */
  done: boolean;
  verdict?: PairVerdict;
}

export interface GauntletReport {
  candidate: string;
  base: string;
  field: readonly string[];
  pairings: readonly PairingRun[];
  /** Elo across [candidate, ...field], anchored so `anchor` = 0. */
  elo: Record<string, number>;
  /** The label pinned to 0 Elo: `claude-v1` (the published floor) when it's in the
   *  field, else the base — so a floor-less field stays interpretable (ratings are
   *  relative to the base). See METHOD.md Decision 8. */
  anchor: string;
  /** Highest-Elo label — the field's champion. */
  champion: string;
  improvesVsBase: boolean;
  /** Opponents the candidate significantly REGRESSED against (regression test). */
  regressions: readonly string[];
  /** The promotion verdict: improves vs base AND regresses against none. */
  accepted: boolean;
}

/** Run one candidate-vs-opponent pairing to an SPRT verdict, generating games in
 *  batches until the test crosses a boundary or hits the decisive cap. The stop
 *  point is a deterministic function of the (seeded) game stream, so the verdict
 *  reproduces regardless of `batchGames` or pool size. */
async function sprtPairing(
  pool: WorkerPool,
  candidate: string,
  opponent: string,
  cfg: GauntletSprtConfig,
  prefix: string,
  maxDecisive: number,
  maxTurns: number,
  batchGames: number,
  progress?: { emit: (p: GauntletProgress) => void; pairIndex: number; pairTotal: number },
): Promise<PairingRun> {
  const seedPrefix = `${prefix}:${candidate}-vs-${opponent}`;
  const aWon: boolean[] = [];
  let draws = 0;
  let errors = 0;
  let generated = 0;
  // Bound generation so an all-draws pathology can't loop forever; ~0% cap among
  // real bots means this is only a safety net.
  const hardCap = maxDecisive * 3 + 300;

  let walk = walkGauntletSprt(aWon, cfg, maxDecisive);
  while (walk.verdict === "need-more") {
    const specs = pairingSpecs(candidate, opponent, seedPrefix, generated, batchGames, maxTurns);
    generated += batchGames;
    const results = await pool.run(specs);
    for (const r of results) {
      if (r.error !== undefined) errors++;
      else if (r.winnerLabel === candidate) aWon.push(true);
      else if (r.winnerLabel === opponent) aWon.push(false);
      else draws++;
    }
    walk = walkGauntletSprt(aWon, cfg, maxDecisive);
    if (progress) {
      progress.emit({
        kind: "candidate",
        opponent,
        pairIndex: progress.pairIndex,
        pairTotal: progress.pairTotal,
        decisive: walk.decisive,
        wins: walk.wins,
        losses: walk.losses,
        draws,
        maxDecisive,
        llrImprove: walk.llrImprove,
        llrRegress: walk.llrRegress,
        done: false,
      });
    }
    if (walk.verdict === "need-more" && generated >= hardCap) break;
  }

  const run: PairingRun = {
    opponent,
    verdict: classify(walk.verdict),
    wins: walk.wins,
    losses: walk.losses,
    decisive: walk.decisive,
    draws,
    errors,
    generated,
    llrImprove: walk.llrImprove,
    llrRegress: walk.llrRegress,
  };
  if (progress) {
    progress.emit({
      kind: "candidate",
      opponent,
      pairIndex: progress.pairIndex,
      pairTotal: progress.pairTotal,
      decisive: run.decisive,
      wins: run.wins,
      losses: run.losses,
      draws,
      maxDecisive,
      llrImprove: run.llrImprove,
      llrRegress: run.llrRegress,
      done: true,
      verdict: run.verdict,
    });
  }
  return run;
}

/** Play a fixed number of games for a field-internal pairing — not under test,
 *  just enough to give the Elo fit a real edge between two field members. */
async function fixedPairing(
  pool: WorkerPool,
  a: string,
  b: string,
  prefix: string,
  games: number,
  maxTurns: number,
): Promise<PairResult> {
  const specs = pairingSpecs(a, b, `${prefix}:field:${a}-vs-${b}`, 0, games, maxTurns);
  const results = await pool.run(specs);
  let aWins = 0;
  let bWins = 0;
  for (const r of results) {
    if (r.error !== undefined) continue;
    if (r.winnerLabel === a) aWins++;
    else if (r.winnerLabel === b) bWins++;
  }
  return { a, b, aWins, bWins };
}

export async function runGauntlet(opts: GauntletOptions): Promise<GauntletReport> {
  const cfg: GauntletSprtConfig = {
    margin: opts.margin,
    alpha: opts.alpha,
    beta: opts.beta,
  };
  const batchGames = opts.batchGames ?? Math.max(8, opts.pool.size * 8);

  // 1. Candidate vs every field member — the tests that decide promotion.
  const pairings: PairingRun[] = [];
  for (let i = 0; i < opts.field.length; i++) {
    pairings.push(
      await sprtPairing(
        opts.pool,
        opts.candidate,
        opts.field[i],
        cfg,
        opts.prefix,
        opts.maxDecisive,
        opts.maxTurns,
        batchGames,
        opts.onProgress
          ? { emit: opts.onProgress, pairIndex: i + 1, pairTotal: opts.field.length }
          : undefined,
      ),
    );
  }

  // 2. Field-internal pairings, only to anchor the Elo fit (a star graph centred
  //    on the candidate would leave field members' relative ratings ill-pinned).
  const fieldResults: PairResult[] = [];
  const fieldTotal = (opts.field.length * (opts.field.length - 1)) / 2;
  let fieldIndex = 0;
  for (let i = 0; i < opts.field.length; i++) {
    for (let j = i + 1; j < opts.field.length; j++) {
      const res = await fixedPairing(
        opts.pool,
        opts.field[i],
        opts.field[j],
        opts.prefix,
        opts.fieldGames,
        opts.maxTurns,
      );
      fieldResults.push(res);
      fieldIndex++;
      opts.onProgress?.({
        kind: "field",
        opponent: `${opts.field[i]}-vs-${opts.field[j]}`,
        pairIndex: fieldIndex,
        pairTotal: fieldTotal,
        decisive: res.aWins + res.bWins,
        wins: res.aWins,
        losses: res.bWins,
        draws: 0,
        maxDecisive: opts.fieldGames,
        llrImprove: 0,
        llrRegress: 0,
        done: true,
      });
    }
  }

  // 3. Elo across the whole field, anchored at the floor (v1 if present).
  const labels = [opts.candidate, ...opts.field];
  const pairResults: PairResult[] = [
    ...pairings.map((p) => ({
      a: opts.candidate,
      b: p.opponent,
      aWins: p.wins,
      bWins: p.losses,
    })),
    ...fieldResults,
  ];
  const anchor = opts.field.includes("claude-v1") ? "claude-v1" : opts.base;
  const elo = fitElo(labels, pairResults, { anchor });
  const champion = labels.reduce((best, l) => (elo[l] > elo[best] ? l : best), labels[0]);

  // 4. The promotion bar.
  const baseRun = pairings.find((p) => p.opponent === opts.base);
  const improvesVsBase = baseRun?.verdict === "better";
  const regressions = pairings.filter((p) => p.verdict === "worse").map((p) => p.opponent);
  const accepted = improvesVsBase && regressions.length === 0;

  return {
    candidate: opts.candidate,
    base: opts.base,
    field: opts.field,
    pairings,
    elo,
    anchor,
    champion,
    improvesVsBase,
    regressions,
    accepted,
  };
}

/** A compact console summary of a gauntlet run. */
export function formatGauntlet(r: GauntletReport): string {
  const pct = (w: number, l: number): string =>
    w + l === 0 ? "—" : `${((100 * w) / (w + l)).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`Gauntlet: ${r.candidate} vs field [${r.field.join(", ")}]   base = ${r.base}`);
  lines.push("");
  const marks: Record<PairVerdict, string> = {
    better: "✓",
    worse: "✗",
    even: "=",
    inconclusive: "≈",
  };
  for (const p of r.pairings) {
    const isBase = p.opponent === r.base ? " (base)" : "";
    lines.push(
      `  ${marks[p.verdict]} vs ${p.opponent}${isBase}: ${p.verdict.toUpperCase()}` +
        `  win share ${pct(p.wins, p.losses)}  (${p.wins}–${p.losses}, ${p.decisive} decisive` +
        `, ${p.draws} draws, LLR impr ${p.llrImprove.toFixed(2)} regr ${p.llrRegress.toFixed(2)})`,
    );
  }
  lines.push("");
  const eloLine = Object.entries(r.elo)
    .sort((a, b) => b[1] - a[1])
    .map(([l, e]) => `${l} ${e >= 0 ? "+" : ""}${e.toFixed(1)}`)
    .join("   ");
  lines.push(`  Elo (${r.anchor} = 0):  ${eloLine}`);
  lines.push(`  Champion (highest Elo): ${r.champion}`);
  lines.push("");
  lines.push(
    `  Improves vs base (${r.base}): ${r.improvesVsBase ? "YES" : "no"}` +
      `   Regressions: ${r.regressions.length === 0 ? "none" : r.regressions.join(", ")}`,
  );
  lines.push(`  → ${r.accepted ? "✅ ACCEPT as new champion" : "❌ REJECT"}`);
  return lines.join("\n");
}
