import { WorkerPool } from "@/shared/lib/bot-lab/pool";
import type { TrialOutcome } from "@/shared/lib/bot-lab/gauntlet";
import type { Finish } from "@/shared/lib/bot-lab/elo";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// How Risk's measurement games are seated (see the project's CLAUDE.md, "Measuring
// bots"). A pairing is a candidate against one opponent at a table of N, in one of
// two mixtures: ONE-IN, the candidate alone among N − 1 copies of the opponent,
// and ONE-OUT, the reverse. Games come in groups of N that share a seed, with the
// lone seat rotated through every seat, so each bot takes every place in the turn
// order on the same deal, and the same random stream.

export type Format = "one-in" | "one-out";

export const FORMATS: readonly Format[] = ["one-in", "one-out"];

/** The Risk pool: the shared worker pool running Risk's `worker.ts`. */
export function riskPool(size?: number): WorkerPool<RiskGameSpec, RiskGameResult> {
  return new WorkerPool(new URL("./worker.ts", import.meta.url), size);
}

/** Seats the candidate holds in a format at a table of `players`. */
export function candidateSeats(format: Format, players: number): number {
  return format === "one-in" ? 1 : players - 1;
}

/** Games `from` to `from + count − 1` of a pairing's stream. Game i is rotation
 *  i mod N of group ⌊i / N⌋, seeded `${prefix}-${group + 1}`: the lone bot sits at
 *  seat i mod N. */
export function tableSpecs(
  candidate: string,
  opponent: string,
  format: Format,
  players: number,
  prefix: string,
  from: number,
  count: number,
  maxTurns: number,
): RiskGameSpec[] {
  if (candidate === opponent) {
    throw new Error(`a pairing needs two different bots to tell their wins apart (both are "${candidate}")`);
  }
  const [lone, rest] = format === "one-in" ? [candidate, opponent] : [opponent, candidate];
  return Array.from({ length: count }, (_, k) => {
    const index = from + k;
    const rotation = index % players;
    const group = Math.floor(index / players);
    return {
      index,
      seed: `${prefix}-${group + 1}`,
      labels: Array.from({ length: players }, (_, seat) => (seat === rotation ? lone : rest)),
      maxTurns,
    };
  });
}

/** A game's result from `candidate`'s side: its side won, lost, or the cap drew it. */
export function outcomeFor(result: RiskGameResult, candidate: string): TrialOutcome {
  if (result.error !== undefined) return "error";
  if (result.winner === null) return "draw";
  return result.labels[result.winner] === candidate ? "win" : "loss";
}

/** A game's finishing order for the Elo fit; none for a game that errored. */
export function finishesOf(result: RiskGameResult): Finish[] {
  if (result.error !== undefined) return [];
  return result.labels.map((label, seat) => ({ label, place: result.places[seat] }));
}
