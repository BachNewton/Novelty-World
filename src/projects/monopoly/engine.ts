import type {
  ApplyResult,
  GameEvent,
  GameState,
  Intent,
} from "./types";

/** Random number source for the engine. Every roll, deck shuffle, and
 *  card draw goes through this; `Math.random` may not be called directly
 *  from engine code. See `monopoly/CLAUDE.md` "RNG: always injected." */
export interface Rng {
  /** Next uniform value in [0, 1). */
  next(): number;
}

/** Construct an RNG from the game's seed. The state's `rngSeed` field is
 *  the source of truth; advancing the RNG over the course of a game makes
 *  the run deterministically replayable from the event log. */
export function createRng(seed: string): Rng {
  // TODO: swap in a seedable PRNG (e.g. mulberry32) once engine logic
  // lands. For the skeleton we ignore `seed` so calling code compiles;
  // determinism will arrive with the rules implementation.
  void seed;
  return { next: () => Math.random() };
}

/** Apply a single external intent. On success the caller should then run
 *  `autoStep` to drain mechanics until the next decision point. */
export function apply(
  state: GameState,
  intent: Intent,
  _rng: Rng,
): ApplyResult {
  void state;
  throw new Error(`apply: not yet implemented (intent ${intent.kind})`);
}

/** Run mechanical transitions (dice, movement, rent, card draws, …) until
 *  the state hits a phase that requires a decision or has `turn.paused`
 *  set. No-op when the state is already at a decision point. */
export function autoStep(
  _state: GameState,
  _rng: Rng,
): { state: GameState; newEvents: readonly GameEvent[] } {
  throw new Error("autoStep: not yet implemented");
}
