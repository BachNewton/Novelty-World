/** A seeded source of uniform random values. JavaScript intentionally does
 *  not let you seed `Math.random`, so anything that needs reproducibility
 *  (a game replayed from its seed, a generated level, an optimizer run)
 *  brings its own.
 *
 *  `getState()` returns the current internal state — a value that can be
 *  passed back to `createRng` to resume the same stream. That is what lets a
 *  serialized state carry its RNG along (Monopoly's `GameState.rngState`). */
export interface Rng {
  /** Next uniform value in [0, 1). */
  next: () => number;
  /** Current internal state; passing this back to `createRng` resumes
   *  the same stream of values. */
  getState: () => number;
}

/** Construct an RNG from either a string seed or a numeric state. String
 *  seeds are hashed with xmur3 into a 32-bit mulberry32 state; numeric input
 *  is used directly, so a numeric seed is plain mulberry32 and
 *  `createRng(prev.getState())` continues exactly where `prev` left off.
 *
 *  Its output is load-bearing: Monopoly's seeded games, bot simulations,
 *  ratings and replays all depend on this exact stream, and the unit tests
 *  pin it. Never change the algorithm.
 *
 *  xmur3 + mulberry32 from https://stackoverflow.com/a/47593316 */
export function createRng(seedOrState: string | number): Rng {
  let state: number;
  if (typeof seedOrState === "number") {
    state = seedOrState >>> 0;
  } else {
    let h = 1779033703 ^ seedOrState.length;
    for (let i = 0; i < seedOrState.length; i++) {
      h = Math.imul(h ^ seedOrState.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    state = (h ^ (h >>> 16)) >>> 0;
  }
  return {
    next: () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState: () => state >>> 0,
  };
}

/** A uniform value in [low, high). */
export function uniform(rng: Rng, low: number, high: number): number {
  return low + rng.next() * (high - low);
}

/** One of `items`, each equally likely. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng.next() * items.length)];
}
