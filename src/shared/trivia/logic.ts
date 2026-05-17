/**
 * Build a deterministic high-score storage key for a set of filter values.
 * Sorted so the same selection always produces the same key regardless of
 * the order the user toggled the options.
 */
export function highScoreKey(filter: readonly string[]): string {
  const sorted = [...filter].sort((a, b) => a.localeCompare(b));
  return `highScore:${sorted.join(",")}`;
}
