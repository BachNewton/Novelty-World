import { fitElo, pairsFromFinishes, pairsFromWinner, topRated, type PairResult } from "@/shared/lib/bot-lab/elo";
import {
  crownGate,
  runSprtPairing,
  type CrownGate,
  type SprtPairingRun,
} from "@/shared/lib/bot-lab/gauntlet";
import type { GameRunner } from "@/shared/lib/bot-lab/pool";
import { luceWinProb } from "@/shared/lib/bot-lab/sprt";
import { wilsonInterval, type ShareInterval } from "@/shared/lib/bot-lab/stats";
import { candidateSeats, finishesOf, outcomeFor, tableSpecs, type Format } from "./parallel";
import { playLadder } from "./ratings";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// Risk's gauntlet on the shared bot-lab core: a candidate plays every field member
// at each chosen table size, in both mixtures, each pairing decided by an SPRT on
// the candidate side's win share against its par; then field-internal games anchor
// an Elo across the field, and the crown gate gives the verdict. The
// statistic and why are in the project's CLAUDE.md, "Measuring bots".

export type RiskPool = GameRunner<RiskGameSpec, RiskGameResult>;

/** One table: a candidate against one opponent at a player count, in a mixture. */
export interface Table {
  opponent: string;
  players: number;
  format: Format;
}

export interface RiskPairingRun extends SprtPairingRun, Table {
  /** The candidate side's share of the decisive games to the stop point, with its
   *  95% interval, against `par` (its seats' share at equal strength). */
  winShare: ShareInterval;
  par: number;
  /** The lone seat's bot (the candidate in one-in, the opponent in one-out) and its
   *  mean finishing place, 1 = won; (N + 1) / 2 at equal strength. */
  lone: string;
  lonePlace: number;
  /** Mean player-turns per game, and the share of games the cap drew. */
  meanTurns: number;
  capRate: number;
}

export interface RiskGauntletOptions {
  candidate: string;
  /** The bot the candidate must beat to be promoted; one of `field`. */
  base: string;
  field: readonly string[];
  /** Table sizes to test at, 3 to 6. */
  players: readonly number[];
  formats: readonly Format[];
  /** Seed-stream namespace: "train" while working, "holdout" to confirm. */
  prefix: string;
  /** SPRT indifference margin E (Elo per seat). */
  margin: number;
  alpha: number;
  beta: number;
  /** Decisive-game cap per pairing before it is inconclusive. */
  maxDecisive: number;
  /** Seed groups per field-internal table, played only to anchor the Elo fit. */
  fieldGroups: number;
  maxTurns: number;
  /** Games per SPRT round, rounded up to whole groups; a few per worker by default. */
  batchGames?: number;
  pool: RiskPool;
  /** Fired after every SPRT round and when each pairing resolves: cosmetic only. */
  onProgress?: (p: RiskGauntletProgress) => void;
}

export interface RiskGauntletProgress {
  table: Table;
  index: number;
  total: number;
  wins: number;
  losses: number;
  draws: number;
  maxDecisive: number;
  llrImprove: number;
  llrRegress: number;
  done: boolean;
}

export interface RiskGauntletReport extends CrownGate {
  candidate: string;
  base: string;
  field: readonly string[];
  pairings: readonly RiskPairingRun[];
  /** Win Elo across [candidate, ...field], the base at 0: the Luce strengths
   *  behind who wins, the model the SPRT tests. The champion is its top. */
  elo: Record<string, number>;
  /** Finishing-order Elo, the same fit over every pair of places: more evidence
   *  per game, but it rewards outlasting as well as winning. Reported alongside. */
  finishElo: Record<string, number>;
  champion: string;
  /** Games that threw, across every table: always 0 in a healthy run. */
  errors: number;
}

/** Summary figures of the games a pairing's verdict rests on. */
function summarize(
  results: readonly RiskGameResult[],
  candidate: string,
  run: SprtPairingRun,
  table: Table,
): RiskPairingRun {
  const k = candidateSeats(table.format, table.players);
  const lone = table.format === "one-in" ? candidate : table.opponent;
  let placeSum = 0;
  let placeCount = 0;
  let turns = 0;
  let caps = 0;
  let played = 0;
  for (const r of results) {
    if (r.error !== undefined) continue;
    played++;
    turns += r.turns;
    if (r.winner === null) caps++;
    r.labels.forEach((label, seat) => {
      if (label !== lone) return;
      placeSum += r.places[seat];
      placeCount++;
    });
  }
  return {
    ...run,
    ...table,
    winShare: wilsonInterval(run.wins, run.decisive),
    par: k / table.players,
    lone,
    lonePlace: placeCount === 0 ? 0 : placeSum / placeCount,
    meanTurns: played === 0 ? 0 : turns / played,
    capRate: played === 0 ? 0 : caps / played,
  };
}

export function gauntletTables(field: readonly string[], players: readonly number[], formats: readonly Format[]): Table[] {
  return field.flatMap((opponent) =>
    players.flatMap((n) => formats.map((format): Table => ({ opponent, players: n, format }))),
  );
}

export async function runRiskGauntlet(opts: RiskGauntletOptions): Promise<RiskGauntletReport> {
  if (!opts.field.includes(opts.base)) throw new Error(`the base "${opts.base}" must be in the field`);
  if (opts.field.includes(opts.candidate)) throw new Error(`the candidate "${opts.candidate}" can't be in its own field`);
  const batchGames = opts.batchGames ?? Math.max(24, opts.pool.size * 4);
  const winPairs: PairResult[] = [];
  const finishPairs: PairResult[] = [];
  let errors = 0;
  const rate = (r: RiskGameResult) => {
    if (r.error !== undefined) {
      errors++;
      return;
    }
    winPairs.push(...pairsFromWinner(finishesOf(r)));
    finishPairs.push(...pairsFromFinishes(finishesOf(r)));
  };

  // 1. The candidate against every field member, in every table: the tests that
  //    decide. The pairings play at once, each its own SPRT over its own rounds, so
  //    the pool always has games; each is rated in table order once all are done, so
  //    the report is the same as playing them one after another.
  const tables = gauntletTables(opts.field, opts.players, opts.formats);
  const played = await Promise.all(
    tables.map(async (table, i) => {
      const prefix = `${opts.prefix}:${opts.candidate}-vs-${table.opponent}:${table.players}p:${table.format}`;
      const results: RiskGameResult[] = [];
      const progress = (walk: { wins: number; losses: number; llrImprove: number; llrRegress: number }, draws: number, done: boolean) =>
        opts.onProgress?.({
          table,
          index: i + 1,
          total: tables.length,
          wins: walk.wins,
          losses: walk.losses,
          draws,
          maxDecisive: opts.maxDecisive,
          llrImprove: walk.llrImprove,
          llrRegress: walk.llrRegress,
          done,
        });
      const run = await runSprtPairing({
        play: async (from, count) => {
          const batch = await opts.pool.run(
            tableSpecs(opts.candidate, table.opponent, table.format, table.players, prefix, from, count, opts.maxTurns),
          );
          results.push(...batch);
          return batch.map((r) => outcomeFor(r, opts.candidate));
        },
        sprt: {
          margin: opts.margin,
          alpha: opts.alpha,
          beta: opts.beta,
          winProb: luceWinProb(candidateSeats(table.format, table.players), table.players),
        },
        maxDecisive: opts.maxDecisive,
        batchGames,
        groupSize: table.players,
        onRound: (walk, draws) => progress(walk, draws, false),
      });
      progress(run, run.draws, true);
      // Only the games up to the stop point count, so the report doesn't depend on
      // how far the last round overshot it.
      return { table, run, counted: results.slice(0, run.games) };
    }),
  );
  const pairings = played.map(({ table, run, counted }) => {
    counted.forEach(rate);
    return summarize(counted, opts.candidate, run, table);
  });

  // 2. The field's own ladder, a fixed number of groups a table, only to anchor
  //    the Elo fit (a star centred on the candidate would leave the field's
  //    relative ratings unpinned).
  const ladder = await playLadder({
    pool: opts.pool,
    labels: opts.field,
    players: opts.players,
    groups: opts.fieldGroups,
    prefix: `${opts.prefix}:field`,
    maxTurns: opts.maxTurns,
  });
  winPairs.push(...ladder.winPairs);
  finishPairs.push(...ladder.finishPairs);
  errors += ladder.errors;

  // 3. Elo across the field, the base at 0, and the verdict.
  const labels = [opts.candidate, ...opts.field];
  const elo = fitElo(labels, winPairs, { anchor: opts.base });
  return {
    candidate: opts.candidate,
    base: opts.base,
    field: opts.field,
    pairings,
    elo,
    finishElo: fitElo(labels, finishPairs, { anchor: opts.base }),
    champion: topRated(elo, labels),
    errors,
    ...crownGate(pairings, opts.base),
  };
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;

/** Ratings, best first. A bot that never won (or never lost) has no finite Elo:
 *  the fit floors it, so it prints as a huge gap rather than a number to read. */
export function eloLine(elo: Readonly<Record<string, number>>): string {
  return Object.entries(elo)
    .sort((a, b) => b[1] - a[1])
    .map(([l, e]) => `${l} ${e >= 0 ? "+" : ""}${e.toFixed(1)}`)
    .join("   ");
}

export function formatTable(t: Table): string {
  return `${t.format === "one-in" ? "1" : String(t.players - 1)} cand vs ${t.format === "one-in" ? String(t.players - 1) : "1"} ${t.opponent} (${t.players}p)`;
}

/** A compact console summary of a gauntlet run. */
export function formatRiskGauntlet(r: RiskGauntletReport): string {
  const marks = { better: "✓", worse: "✗", even: "=", inconclusive: "≈" } as const;
  const lines: string[] = [];
  lines.push(`Gauntlet: ${r.candidate} vs field [${r.field.join(", ")}]   base = ${r.base}`, "");
  for (const p of r.pairings) {
    lines.push(
      `  ${marks[p.verdict]} ${formatTable(p)}: ${p.verdict.toUpperCase()}` +
        `  win share ${pct(p.winShare.share)} [${pct(p.winShare.low)}–${pct(p.winShare.high)}] vs par ${pct(p.par)}` +
        `  (${p.wins}–${p.losses}, ${p.games} games, lone ${p.lone} place ${p.lonePlace.toFixed(2)} vs ${((p.players + 1) / 2).toFixed(1)}` +
        `, ${p.meanTurns.toFixed(0)} turns, cap ${pct(p.capRate)}, LLR impr ${p.llrImprove.toFixed(2)} regr ${p.llrRegress.toFixed(2)})`,
    );
  }
  lines.push("");
  lines.push(`  Win Elo (${r.base} = 0):              ${eloLine(r.elo)}`);
  lines.push(`  Finishing-order Elo (${r.base} = 0):  ${eloLine(r.finishElo)}`);
  lines.push(`  Champion (highest Elo): ${r.champion}`);
  if (r.errors > 0) lines.push(`  ⚠ ${r.errors} games threw and were excluded: a bot or engine bug`);
  lines.push("");
  lines.push(
    `  Improves vs base (${r.base}): ${r.improvesVsBase ? "YES" : "no"}` +
      `   Regressions: ${r.regressions.length === 0 ? "none" : r.regressions.join(", ")}`,
  );
  lines.push(`  → ${r.accepted ? "✅ ACCEPT as new champion" : "❌ REJECT"}`);
  return lines.join("\n");
}
