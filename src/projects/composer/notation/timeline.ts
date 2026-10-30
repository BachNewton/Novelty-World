// Turns Verovio's timemap and the engraved positions into what a frame needs:
// where the music should sit at a time, and which notes sound then. Engraved
// spacing isn't proportional to time, so a straight line between notes would
// lurch at each one; a monotone curve through them keeps the motion smooth
// while still passing through every note exactly as it sounds.

export interface TimemapEntry {
  qstamp?: number;
  on?: string[];
  off?: string[];
  restsOn?: string[];
  measureOn?: string;
}

export interface Timeline {
  seconds: number[];
  x: number[];
  slopes: number[];
  // The notes sounding from each point in `moments`, with held ties.
  moments: number[];
  sounding: string[][];
}

// A piecewise-linear map from written quarters to sounding quarters.
export function soundingBeats(timing: readonly { written: number; sounding: number }[], written: number): number {
  const after = timing.findIndex((point) => point.written > written);
  if (after === 0) return written;
  if (after === -1) {
    const last = timing[timing.length - 1];
    return last.sounding + written - last.written;
  }
  const [from, to] = [timing[after - 1], timing[after]];
  return from.sounding + ((written - from.written) / (to.written - from.written)) * (to.sounding - from.sounding);
}

// Fritsch and Carlson's tangents: never overshoots, so the music never backs up.
function monotoneSlopes(seconds: readonly number[], x: readonly number[]): number[] {
  const secants = seconds.slice(1).map((time, index) => (x[index + 1] - x[index]) / (time - seconds[index]));
  return x.map((_, index) => {
    if (index === 0) return secants[0] ?? 0;
    if (index === x.length - 1) return secants[index - 1];
    const [before, after] = [secants[index - 1], secants[index]];
    if (before <= 0 || after <= 0) return 0;
    const [left, right] = [seconds[index] - seconds[index - 1], seconds[index + 1] - seconds[index]];
    return (3 * (left + right)) / ((2 * right + left) / before + (right + 2 * left) / after);
  });
}

interface Positioned {
  time: number;
  x: number;
}

export function buildTimeline(
  entries: readonly TimemapEntry[],
  xOf: (id: string) => number | null,
  timeOf: (quarters: number) => number,
  ties: ReadonlyMap<string, readonly string[]>,
): Timeline {
  const points: Positioned[] = [];
  const moments: number[] = [];
  const sounding: string[][] = [];
  const held = new Set<string>();
  for (const { qstamp, on = [], off = [], restsOn = [], measureOn } of entries) {
    if (qstamp === undefined) throw new Error("Notation: a timemap without quarter times");
    const time = timeOf(qstamp);
    for (const id of off) held.delete(id);
    for (const id of on) held.add(id);
    if (on.length + off.length > 0) {
      moments.push(time);
      sounding.push([...held].flatMap((id) => [id, ...(ties.get(id) ?? [])]));
    }
    const ids = [...on, ...restsOn, ...(measureOn === undefined ? [] : [measureOn])];
    const x = ids.map(xOf).find((value) => value !== null) ?? null;
    const last = points.at(-1);
    if (x !== null && (last === undefined || (time > last.time && x > last.x))) points.push({ time, x });
  }
  const seconds = points.map((point) => point.time);
  const x = points.map((point) => point.x);
  return { seconds, x, slopes: monotoneSlopes(seconds, x), moments, sounding };
}

// The last index whose time has come, or -1.
export function indexAt(times: readonly number[], time: number): number {
  let [low, high] = [0, times.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] <= time) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function scrollAt({ seconds, x, slopes }: Timeline, time: number): number {
  const index = indexAt(seconds, time);
  if (index < 0) return x[0];
  if (index >= x.length - 1) return x[x.length - 1];
  const span = seconds[index + 1] - seconds[index];
  const at = (time - seconds[index]) / span;
  const [square, cube] = [at * at, at * at * at];
  return (
    (2 * cube - 3 * square + 1) * x[index] +
    (cube - 2 * square + at) * span * slopes[index] +
    (-2 * cube + 3 * square) * x[index + 1] +
    (cube - square) * span * slopes[index + 1]
  );
}
