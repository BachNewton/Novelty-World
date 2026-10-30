import { barBeats, type Score } from "./types";
import { bars } from "./analysis";

// Dynamics, read off the velocities rather than written down, so they can't
// disagree with the notes. A bar's level is the loud end of what starts in it,
// which is what a listener follows; a part that never changes, like a
// harpsichord, says nothing about shape and is left out.

export interface DynamicMark {
  bar: number;
  text: string;
  about: string;
}

const LEVELS = ["pp", "p", "mp", "mf", "f", "ff"] as const;
const LEVEL_TOPS = [0.3, 0.42, 0.55, 0.7, 0.85, Infinity];
const LOUD_SHARE = 0.75;
const HOLD_BARS = 2;
const SWELL_BARS = 3;
const SWELL_RISE = 0.09;

function barLevels(score: Score): (number | null)[] {
  const bar = barBeats(score);
  const shaped = score.tracks.filter((track) => track.role !== "drums" && new Set(track.notes.map((note) => note.velocity)).size > 1);
  const tracks = shaped.length > 0 ? shaped : score.tracks.filter((track) => track.role !== "drums");
  const byBar = Array.from({ length: bars(score) }, () => [] as number[]);
  for (const track of tracks) for (const note of track.notes) byBar.at(Math.floor(note.start / bar))?.push(note.velocity);
  return byBar.map((velocities) => {
    if (velocities.length === 0) return null;
    velocities.sort((a, b) => a - b);
    return velocities[Math.floor((velocities.length - 1) * LOUD_SHARE)];
  });
}

function levelOf(value: number): number {
  return LEVEL_TOPS.findIndex((top) => value <= top);
}

export function dynamicsOf(score: Score): DynamicMark[] {
  const levels = barLevels(score);
  const marks: DynamicMark[] = [];
  let shown = -1;
  levels.forEach((value, index) => {
    if (value === null) return;
    const level = levelOf(value);
    const held = levels.slice(index, index + HOLD_BARS).every((next) => next === null || levelOf(next) === level);
    if (level !== shown && held) {
      marks.push({ bar: index + 1, text: LEVELS[level], about: `Bar ${String(index + 1)}: played ${LEVELS[level]}, velocities near ${String(Math.round(value * 127))}` });
      shown = level;
    }
  });
  for (let index = 0; index + SWELL_BARS < levels.length; index++) {
    const [from, to] = [levels[index], levels[index + SWELL_BARS]];
    if (from === null || to === null) continue;
    const between = levels.slice(index, index + SWELL_BARS + 1).filter((value) => value !== null);
    const rising = between.every((value, step) => step === 0 || value >= between[step - 1]);
    const falling = between.every((value, step) => step === 0 || value <= between[step - 1]);
    if (Math.abs(to - from) >= SWELL_RISE && ((to > from && rising) || (to < from && falling))) {
      const text = to > from ? "cresc." : "dim.";
      marks.push({ bar: index + 1, text, about: `Bars ${String(index + 1)} to ${String(index + 1 + SWELL_BARS)}: ${to > from ? "growing" : "falling away"}` });
      index += SWELL_BARS - 1;
    }
  }
  const top = Math.max(...levels.map((value) => value ?? 0));
  const peak = levels.indexOf(top);
  if (peak >= 0) marks.push({ bar: peak + 1, text: "climax", about: `Bar ${String(peak + 1)}: the loudest bar of the piece` });
  return marks.sort((a, b) => a.bar - b.bar);
}
