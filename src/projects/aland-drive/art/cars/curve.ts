/* A smooth line through keys, for a car's profiles: monotone, so it never overshoots a key. */

export type Key = readonly [at: number, value: number];

export function curve(keys: readonly Key[]): (at: number) => number {
  const count = keys.length;
  const widths = keys.slice(1).map(([at], index) => at - keys[index][0]);
  const slopes = keys.slice(1).map(([, value], index) => (value - keys[index][1]) / widths[index]);
  const tangents = keys.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === count - 1) return slopes[count - 2];
    const [before, after] = [slopes[index - 1], slopes[index]];
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  });
  return (at) => {
    if (at <= keys[0][0]) return keys[0][1];
    if (at >= keys[count - 1][0]) return keys[count - 1][1];
    const span = keys.findIndex(([next]) => at < next) - 1;
    const width = widths[span];
    const share = (at - keys[span][0]) / width;
    const [square, cube] = [share * share, share * share * share];
    return (
      (2 * cube - 3 * square + 1) * keys[span][1] +
      (cube - 2 * square + share) * width * tangents[span] +
      (-2 * cube + 3 * square) * keys[span + 1][1] +
      (cube - square) * width * tangents[span + 1]
    );
  };
}

export const smoothstep = (from: number, to: number, at: number) => {
  const share = Math.min(1, Math.max(0, (at - from) / (to - from)));
  return share * share * (3 - 2 * share);
};
