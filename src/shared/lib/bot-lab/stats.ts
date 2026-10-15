/** A win share with its 95% confidence interval. */
export interface ShareInterval {
  share: number;
  low: number;
  high: number;
}

/** The Wilson score interval for `wins` out of `trials` at 95%: unlike the plain
 *  normal interval it stays inside [0, 1] and behaves near par shares like 1/6. */
export function wilsonInterval(wins: number, trials: number, z = 1.959964): ShareInterval {
  if (trials === 0) return { share: 0, low: 0, high: 1 };
  const p = wins / trials;
  const z2 = z * z;
  const centre = (p + z2 / (2 * trials)) / (1 + z2 / trials);
  const half =
    (z / (1 + z2 / trials)) * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));
  return { share: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}
