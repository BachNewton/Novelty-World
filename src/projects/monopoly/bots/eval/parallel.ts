import { WorkerPool } from "@/shared/lib/bot-lab/pool";

// ---------------------------------------------------------------------------
// Monopoly on the shared worker pool (`src/shared/lib/bot-lab/pool.ts`, see
// METHOD.md "Measurement"). A simulated game is a PURE, deterministic function of
// (seed, seating) — see `simulate.ts` — so games are embarrassingly parallel and
// the result is bit-identical regardless of which worker ran which game. This is
// what turns the ~30-min single-core gauntlet into a ~2-min run and makes SPRT's
// game volume practical. This file holds what is Monopoly's own: the game spec and
// result, the pool on `worker.ts`, and the 2 + 2 seating scheme.
// ---------------------------------------------------------------------------

/** One game to play: a global `index` (so results map back regardless of which
 *  worker finished first), the RNG `seed` (fully determines the game), the
 *  per-seat version `labels`, and the turn cap. */
export interface GameSpec {
  index: number;
  seed: string;
  /** Version label per seat (e.g. ["fable-v2","claude-v2","fable-v2","claude-v2"]); repeats are fine —
   *  the worker resolves each through `versionBot`. */
  labels: readonly string[];
  maxTurns: number;
}

/** A worker's compact report for one game — everything the aggregators need, and
 *  nothing that would bloat the message channel (no event log, no full state). */
export interface GameResult {
  index: number;
  seed: string;
  labels: readonly string[];
  /** The winning seat's version label, or null for a capped (drawn) game. */
  winnerLabel: string | null;
  terminated: boolean;
  turns: number;
  trades: number;
  declines: number;
  bankruptcies: number;
  /** Set only when the game threw (a rejected intent / engine error) — excluded
   *  from every tally, surfaced as a red flag. */
  error?: string;
}

/** The Monopoly game pool: the shared worker pool running `worker.ts`. */
export function monopolyPool(size?: number): WorkerPool<GameSpec, GameResult> {
  return new WorkerPool(new URL("./worker.ts", import.meta.url), size);
}

/** The six distinct ways to seat 2 of contender A among 4 seats (B takes the
 *  rest) — identical to `tournament.ts` so a parallel run reproduces the
 *  single-threaded head-to-head exactly. */
const A_SEATINGS: readonly (readonly number[])[] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [2, 3],
];

/** Build the game stream for an A-vs-B pairing: game `from..from+count-1`, each
 *  seeded `${prefix}-${index+1}` with A's two seats cycled through `A_SEATINGS`.
 *  This matches `runHeadToHead`'s seed+seating scheme exactly (with prefix "vs"),
 *  which is what lets `sim:verify` confirm parallel == single-threaded. */
export function pairingSpecs(
  a: string,
  b: string,
  prefix: string,
  from: number,
  count: number,
  maxTurns: number,
): GameSpec[] {
  const specs: GameSpec[] = [];
  for (let k = 0; k < count; k++) {
    const index = from + k;
    const aSeats = new Set(A_SEATINGS[index % A_SEATINGS.length]);
    const labels = [0, 1, 2, 3].map((s) => (aSeats.has(s) ? a : b));
    specs.push({ index, seed: `${prefix}-${index + 1}`, labels, maxTurns });
  }
  return specs;
}
