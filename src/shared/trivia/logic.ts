/** Fisher-Yates shuffle — returns a new array. */
export function shuffleArray<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build a deterministic high-score storage key for a set of filter values.
 * Sorted so the same selection always produces the same key regardless of
 * the order the user toggled the options.
 */
export function highScoreKey(filter: readonly string[]): string {
  const sorted = [...filter].sort((a, b) => a.localeCompare(b));
  return `highScore:${sorted.join(",")}`;
}
