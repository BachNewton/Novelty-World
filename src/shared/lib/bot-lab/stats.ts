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

/** The standard normal quantile: the z with P(Z ≤ z) = `p`. Acklam's rational
 *  approximation, refined by one Halley step on the error function's series, so it is
 *  good to about 1e-12 across (0, 1). */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`a quantile needs a probability strictly between 0 and 1, not ${p}`);
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const tail = (q: number) => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  let x: number;
  if (p < 0.02425) x = tail(Math.sqrt(-2 * Math.log(p)));
  else if (p > 1 - 0.02425) x = -tail(Math.sqrt(-2 * Math.log(1 - p)));
  else {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** The standard normal CDF, by the complementary error function's continued fraction in
 *  the tails and its series in the middle: accurate to about 1e-14. */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  let erfc: number;
  if (x < 2) {
    // erf by its Taylor series, which converges fast for small x.
    let term = x;
    let sum = x;
    for (let n = 1; n < 60; n++) {
      term *= (-x * x) / n;
      sum += term / (2 * n + 1);
    }
    erfc = 1 - (2 / Math.sqrt(Math.PI)) * sum;
  } else {
    // erfc by its continued fraction, evaluated from the bottom up.
    let f = 0;
    for (let n = 60; n >= 1; n--) f = n / 2 / (x + f);
    erfc = Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f);
  }
  return z >= 0 ? 1 - erfc / 2 : erfc / 2;
}
