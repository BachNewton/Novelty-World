/** Fisher-Yates shuffle — returns a new array, leaves the input untouched.
 *  `random` supplies uniform values in [0, 1); it defaults to `Math.random`,
 *  but a caller that needs determinism (e.g. a seeded game engine) can inject
 *  its own RNG so the shuffle is reproducible. */
export function shuffleArray<T>(
  arr: readonly T[],
  random: () => number = Math.random,
): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
