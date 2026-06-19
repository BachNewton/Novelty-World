import { simulateGame, type Contender, type SimResult } from "./simulate";

// ---------------------------------------------------------------------------
// Head-to-head A/B between two specific bot versions, the measurement half of
// the evolution loop (see EVOLUTION.md). Each game seats 2 of one version and 2
// of the other; seatings are cycled through all six distinct 2+2 arrangements so
// neither version gets a seat-order edge, and the RNG seed varies per game so
// dice luck averages out. The metric is the null hypothesis from EVOLUTION.md:
// with 2 candidate seats out of 4, a neutral candidate wins a 50% SHARE of the
// decisive games. Capped (no-winner) games are draws — reported as a health
// metric (a high cap rate means the table still can't close out), never counted
// as a win, per the "winning is bankruptcy" decision.
// ---------------------------------------------------------------------------

/** The six distinct ways to seat 2 of contender A among 4 seats (the rest go to
 *  B). Cycling these across the seed list spreads each version evenly over every
 *  seat, so first-mover or turn-order effects can't bias the result. */
const A_SEATINGS: readonly (readonly number[])[] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

export interface HeadToHeadOptions {
  /** The candidate under test (e.g. v2) — the version whose win share we judge. */
  a: Contender;
  /** The incumbent / baseline it's measured against (e.g. the v1 champion). */
  b: Contender;
  /** One game per seed. Seatings cycle independently, so use many seeds for
   *  sample variety (deterministic bots make a given seed+seating a fixed game). */
  seeds: readonly string[];
  maxTurns?: number;
}

/** One game's outcome, tagged with which version sat where. */
export interface GameOutcome {
  seed: string;
  /** Labels by seat index — the seating this game used. */
  seating: string[];
  /** The winning version's label, or null for a capped (drawn) game. */
  winnerLabel: string | null;
  /** True iff a bankruptcy decided it (not the turn cap). */
  terminated: boolean;
  turns: number;
  trades: number;
  declines: number;
  bankruptcies: number;
  /** Set only when the game threw (a rejected intent / engine error) — the seed
   *  produced no result and is excluded from the win tally. */
  error?: string;
}

export interface HeadToHeadResult {
  a: string;
  b: string;
  games: number;
  aWins: number;
  bWins: number;
  /** Capped games — nobody bankrupted out. A draw, never a win. */
  draws: number;
  /** Games that threw (excluded from the tally) — should be 0; a red flag if not. */
  errors: number;
  /** Games with a winner (aWins + bWins). */
  decisive: number;
  /** A's share of the DECISIVE games — the figure tested against the 50% null. */
  aWinShare: number;
  bWinShare: number;
  /** Fraction of ALL games that hit the cap — the deadlock health metric. */
  capRate: number;
  /** Trades executed across all games — the mechanism we're trying to unstick. */
  totalTrades: number;
  totalDeclines: number;
  outcomes: GameOutcome[];
}

function tradesIn(r: SimResult): number {
  return r.eventCounts["trade"] ?? 0;
}
function declinesIn(r: SimResult): number {
  return r.eventCounts["trade-declined"] ?? 0;
}
function bankruptciesIn(r: SimResult): number {
  return r.eventCounts["bankrupt"] ?? 0;
}

/** Play `a` against `b` across the seed list and tally the win share. Wins are
 *  attributed by the winning seat's `label`, so the two contenders MUST carry
 *  distinct labels — for a self-play sanity check (same bot both sides), pass the
 *  same `bot` under two different labels (e.g. "v1-a" / "v1-b"). */
export function runHeadToHead(opts: HeadToHeadOptions): HeadToHeadResult {
  if (opts.a.label === opts.b.label) {
    throw new Error(
      `contenders need distinct labels to tally wins (both are "${opts.a.label}"); ` +
        `for self-play, give the same bot two labels`,
    );
  }
  const outcomes: GameOutcome[] = [];
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let totalTrades = 0;
  let totalDeclines = 0;

  let errors = 0;
  opts.seeds.forEach((seed, i) => {
    const aSeats = new Set(A_SEATINGS[i % A_SEATINGS.length]);
    const seats: Contender[] = [0, 1, 2, 3].map((s) => (aSeats.has(s) ? opts.a : opts.b));
    // A single pathological game (a policy that emits an intent the engine
    // rejects) must not abort the whole eval — record it as an error and move on,
    // so the run completes and the failure is reported, not swallowed silently.
    let r;
    try {
      r = simulateGame({ seed, seats, maxTurns: opts.maxTurns });
    } catch (e) {
      errors++;
      outcomes.push({
        seed,
        seating: seats.map((c) => c.label),
        winnerLabel: null,
        terminated: false,
        turns: 0,
        trades: 0,
        declines: 0,
        bankruptcies: 0,
        error: (e as Error).message,
      });
      return;
    }
    const winnerLabel =
      r.winnerId === null
        ? null
        : (r.standings.find((s) => s.id === r.winnerId)?.label ?? null);

    if (winnerLabel === opts.a.label) aWins++;
    else if (winnerLabel === opts.b.label) bWins++;
    else draws++;

    const trades = tradesIn(r);
    const declines = declinesIn(r);
    totalTrades += trades;
    totalDeclines += declines;
    outcomes.push({
      seed,
      seating: seats.map((c) => c.label),
      winnerLabel,
      terminated: r.terminated,
      turns: r.turns,
      trades,
      declines,
      bankruptcies: bankruptciesIn(r),
    });
  });

  const games = opts.seeds.length;
  const decisive = aWins + bWins;
  return {
    a: opts.a.label,
    b: opts.b.label,
    games,
    aWins,
    bWins,
    draws,
    errors,
    decisive,
    aWinShare: decisive === 0 ? 0 : aWins / decisive,
    bWinShare: decisive === 0 ? 0 : bWins / decisive,
    capRate: games === 0 ? 0 : draws / games,
    totalTrades,
    totalDeclines,
    outcomes,
  };
}

/** A compact console summary of a head-to-head run. */
export function formatHeadToHead(r: HeadToHeadResult): string {
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`Head-to-head: ${r.a} (candidate) vs ${r.b} (baseline) — ${r.games} games`);
  lines.push(
    `  Decisive: ${r.decisive}/${r.games}   Draws (capped): ${r.draws} (${pct(r.capRate)})` +
      (r.errors > 0 ? `   ⚠ Errored: ${r.errors}` : ""),
  );
  lines.push(
    `  ${r.a} wins: ${r.aWins}   ${r.b} wins: ${r.bWins}   ` +
      `→ ${r.a} win share of decisive games: ${pct(r.aWinShare)} (null = 50%)`,
  );
  lines.push(
    `  Trades executed: ${r.totalTrades} (declined: ${r.totalDeclines}) across all games`,
  );
  return lines.join("\n");
}
