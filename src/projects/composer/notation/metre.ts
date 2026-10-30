// How a metre cuts time into written notes. All in ticks, 48 to the quarter,
// which holds sixteenths, 32nds, triplets and sextuplets exactly.

export const TICKS_PER_QUARTER = 48;

export interface Span {
  start: number;
  end: number;
}

export interface Value {
  // 1 is a whole note, 4 a quarter.
  dur: number;
  dots: 0 | 1;
}

export interface Metre {
  barTicks: number;
  // Where each beat starts in a bar: 6/8 has two, 7/8 three, unequal.
  beats: readonly number[];
  // The span a triplet could fill, or a pitch grid is chosen for: a quarter in
  // simple time, a beat in compound or irregular time.
  cells: readonly Span[];
  compound: boolean;
  // Four-beat bars show their middle. Null when a bar has no such middle.
  middle: number | null;
}

export function metreOf([count, unit]: readonly [number, number]): Metre {
  const unitTicks = (TICKS_PER_QUARTER * 4) / unit;
  const barTicks = count * unitTicks;
  const compound = unit >= 8 && count % 3 === 0;
  const lengths = compound ? Array<number>(count / 3).fill(unitTicks * 3) : unit >= 8 ? irregular(count, unitTicks) : Array<number>(count).fill(unitTicks);
  const beats: number[] = [];
  let at = 0;
  for (const length of lengths) {
    beats.push(at);
    at += length;
  }
  const cells: Span[] = [];
  for (let start = 0; start < barTicks; start += TICKS_PER_QUARTER) {
    if (unitTicks < TICKS_PER_QUARTER) break;
    cells.push({ start, end: start + TICKS_PER_QUARTER });
  }
  if (cells.length === 0) beats.forEach((start, index) => cells.push({ start, end: beats.at(index + 1) ?? barTicks }));
  return { barTicks, beats, cells, compound, middle: beats.length === 4 ? barTicks / 2 : null };
}

// Fives and sevens of eighths: twos, then a three to finish.
function irregular(count: number, unitTicks: number): number[] {
  const lengths = Array<number>(Math.floor(count / 2)).fill(unitTicks * 2);
  if (count % 2 === 1) lengths[lengths.length - 1] += unitTicks;
  return lengths;
}

// A length as one written value, or null when it takes a tie.
export function valueOf(ticks: number): Value | null {
  for (const dur of [1, 2, 4, 8, 16, 32, 64]) {
    const plain = (TICKS_PER_QUARTER * 4) / dur;
    if (ticks === plain) return { dur, dots: 0 };
    if (ticks === plain * 1.5) return { dur, dots: 1 };
  }
  return null;
}

function beatAround(tick: number, metre: Metre): Span {
  const index = metre.beats.findLastIndex((beat) => beat <= tick);
  return { start: metre.beats[index], end: metre.beats.at(index + 1) ?? metre.barTicks };
}

// A note may cross a beat when the beat can still be felt through it.
function crossingReads({ start, end }: Span, crossed: readonly number[], metre: Metre): boolean {
  const onBeat = metre.beats.includes(start);
  const endsOnBeat = end === metre.barTicks || metre.beats.includes(end);
  if (onBeat) {
    if (metre.compound) return endsOnBeat;
    return endsOnBeat || metre.middle === null || !crossed.includes(metre.middle);
  }
  if (metre.compound || crossed.length !== 1 || crossed[0] === metre.middle) return false;
  // The syncopated quarter of eighth, quarter, eighth.
  const beat = beatAround(start, metre);
  const length = beat.end - beat.start;
  return end - start === length && start - beat.start === length / 2;
}

// The latest strong point inside a span, so a tie leaves the longer value first.
function cutInsideBeat(span: Span, beat: Span): number {
  for (const step of [24, 12, 6, 3]) {
    const cut = beat.start + Math.ceil((span.end - beat.start) / step - 1) * step;
    if (cut > span.start) return cut;
  }
  throw new Error(`Notation: a span finer than the tick grid: ${String(span.start)}-${String(span.end)}`);
}

// A sounding length inside one bar as written values, to tie.
export function splitNote(span: Span, metre: Metre): Span[] {
  const { start, end } = span;
  const crossed = metre.beats.filter((beat) => beat > start && beat < end);
  const whole = valueOf(end - start) !== null;
  if (crossed.length === 0 && whole) return [span];
  if (crossed.length > 0 && whole && crossingReads(span, crossed, metre)) return [span];
  const cut =
    crossed.length === 0
      ? cutInsideBeat(span, beatAround(start, metre))
      : metre.middle !== null && crossed.includes(metre.middle)
        ? metre.middle
        : metre.beats.includes(start)
          ? (crossed.at(-1) ?? 0)
          : crossed[0];
  return [...splitNote({ start, end: cut }, metre), ...splitNote({ start: cut, end }, metre)];
}

// A silence inside one bar as written rests: unlike a note, a rest shows the
// beat it covers, and is never dotted but for a compound beat.
export function splitRest({ start, end }: Span, metre: Metre): Span[] {
  const rests: Span[] = [];
  let at = start;
  while (at < end) {
    const beat = beatAround(at, metre);
    const inHalf = metre.middle !== null && (at === 0 || at === metre.middle) && at + metre.middle <= end;
    const length = inHalf && metre.middle !== null ? metre.middle : restLength(at, end, beat);
    rests.push({ start: at, end: at + length });
    at += length;
  }
  return rests;
}

function restLength(at: number, end: number, beat: Span): number {
  const full = beat.end - beat.start;
  if (at === beat.start && end >= beat.end && valueOf(full) !== null) return full;
  for (const step of [48, 24, 12, 6, 3]) {
    if ((at - beat.start) % step === 0 && at + step <= Math.min(end, beat.end)) return step;
  }
  throw new Error(`Notation: a rest finer than the tick grid at ${String(at)}`);
}
