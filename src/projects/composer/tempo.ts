import type { PedalSpan, Score, TempoPoint, Track } from "./types";

// Time in a piece. A score is written in beats and sounds in seconds, and the
// tempo map is what joins them, so everything that crosses over asks here. Between
// two points the tempo holds, or glides evenly per beat where the later point says
// so: that is a written ritardando or accelerando, and it has an exact answer.

export interface Timing {
  seconds: (beats: number) => number;
  beats: (seconds: number) => number;
  bpm: (beats: number) => number;
  points: readonly TempoPoint[];
}

// The change in tempo per beat from a point to the next, 0 where it holds.
function slopeAfter(points: readonly TempoPoint[], index: number): number {
  const [from, to] = [points[index], points.at(index + 1)];
  return to?.glide === true ? (to.bpm - from.bpm) / (to.beat - from.beat) : 0;
}

function secondsOver(beats: number, bpm: number, slope: number): number {
  return slope === 0 ? (beats * 60) / bpm : (60 / slope) * Math.log(1 + (slope * beats) / bpm);
}

function beatsOver(seconds: number, bpm: number, slope: number): number {
  return slope === 0 ? (seconds * bpm) / 60 : (bpm / slope) * (Math.exp((slope * seconds) / 60) - 1);
}

function lastAtOrBefore(values: readonly number[], value: number): number {
  let [low, high] = [0, values.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] <= value) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

function buildTiming(points: readonly TempoPoint[]): Timing {
  const beatsOf = points.map((point) => point.beat);
  const slopes = points.map((_, index) => slopeAfter(points, index));
  const starts = [0];
  for (let index = 1; index < points.length; index++) {
    const before = points[index - 1];
    starts.push(starts[index - 1] + secondsOver(points[index].beat - before.beat, before.bpm, slopes[index - 1]));
  }
  return {
    points,
    seconds: (beats) => {
      const index = lastAtOrBefore(beatsOf, beats);
      return starts[index] + secondsOver(beats - points[index].beat, points[index].bpm, slopes[index]);
    },
    beats: (seconds) => {
      const index = lastAtOrBefore(starts, seconds);
      return points[index].beat + beatsOver(seconds - starts[index], points[index].bpm, slopes[index]);
    },
    bpm: (beats) => {
      const index = lastAtOrBefore(beatsOf, beats);
      return points[index].bpm + slopes[index] * (beats - points[index].beat);
    },
  };
}

const timings = new WeakMap<readonly TempoPoint[], Timing>();

// Kept by the map, so a view can ask on every frame.
export function timingOf(score: Pick<Score, "tempo">): Timing {
  const known = timings.get(score.tempo);
  if (known !== undefined) return known;
  const timing = buildTiming(score.tempo);
  timings.set(score.tempo, timing);
  return timing;
}

// What holds a track's dampers up: the score's pedal and its own, in order.
export function pedalsOf(score: Pick<Score, "pedal">, track: Pick<Track, "pedal">): PedalSpan[] {
  return [...score.pedal, ...(track.pedal ?? [])].sort((a, b) => a.start - b.start);
}

// Every pedal in the score, each once: both hands of a piano often share one.
export function allPedals(score: Pick<Score, "pedal" | "tracks">): PedalSpan[] {
  const unique = new Map([...score.pedal, ...score.tracks.flatMap((track) => track.pedal ?? [])].map((pedal) => [`${String(pedal.start)}:${String(pedal.end)}`, pedal]));
  return [...unique.values()].sort((a, b) => a.start - b.start);
}

// Beats are fractions of ticks, so two equal times can differ in the last bits.
const SAME_MOMENT = 1e-6;

// Where a note lifted at `end` stops sounding: when the pedal lifts, if it was
// down. A note lifted just as the pedal goes down is already gone.
export function soundedEnd(end: number, pedals: readonly PedalSpan[]): number {
  return pedals.find((pedal) => pedal.start + SAME_MOMENT < end && end < pedal.end - SAME_MOMENT)?.end ?? end;
}
