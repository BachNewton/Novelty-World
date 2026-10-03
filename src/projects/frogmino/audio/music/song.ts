import { zzfxParams, type ZzfxSound } from "../sounds";
import type { ZzfxmChannel, ZzfxmSong } from "./zzfxm";

// Frogmino's music themes as data, written for reading and compiled to
// ZzFXM's song format. A channel's notes are a line of tokens, one per row (a
// sixteenth note), with bar lines for the eye:
//
//   "C5 - . . E5 . G5 . | A5 . . . - . . ."
//
// A note name such as C5, F#4 or Bb3 plays that pitch (C4 is middle C),
// followed by .1 to .9 to play it quieter by that much (E5.4). A dot rests and
// lets the playing note ring on, a dash releases it, x plays the instrument's
// own pitch (for drums), and a bar line is ignored.

export interface Instrument {
  name: string;
  // The pitch the instrument's ZzFX sound is tuned to. ZzFXM plays notes from
  // eleven semitones below it to two octaves above it.
  base: string;
  zzfx: Omit<ZzfxSound, "frequency">;
}

export interface Channel {
  // An index into the theme's instruments.
  instrument: number;
  // -1 is the left speaker, 1 the right.
  pan: number;
  notes: string;
}

export interface Theme {
  id: string;
  name: string;
  // Where in the game it would play.
  use: string;
  mood: string;
  // The style traits it borrows; never a melody.
  style: readonly string[];
  key: string;
  // A loop plays round and round; a jingle once.
  kind: "loop" | "jingle";
  // Beats per minute, four rows to the beat.
  bpm: number;
  // Quarter-note beats to the bar: 2 for 2/4, 4 for 4/4.
  beatsPerBar: number;
  instruments: readonly Instrument[];
  patterns: readonly (readonly Channel[])[];
  sequence: readonly number[];
}

const NOTE_STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE = /^([A-G])(#|b|)(\d)((?:\.\d)?)$/;

// Semitones from C0, and how far the note is turned down.
function parseNote(token: string): { semitone: number; quieter: number } {
  const match = NOTE.exec(token);
  if (match === null) throw new Error(`Not a note: "${token}"`);
  // An absent fraction is the empty string, which Number reads as 0.
  const [, letter, accidental, octave, fraction] = match;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return { semitone: NOTE_STEPS[letter] + shift + 12 * Number(octave), quieter: Number(fraction) };
}

export function noteFrequency(name: string): number {
  // A4 is 440 Hz, and 57 semitones above C0.
  return 440 * 2 ** ((parseNote(name).semitone - 57) / 12);
}

// ZzFXM's notes run from 1 to 36, with 12 at the instrument's own pitch.
const LOWEST = 1;
const HIGHEST = 36;

function compileToken(token: string, base: string): number {
  if (token === ".") return 0;
  if (token === "-") return -1;
  if (token === "x") return 12;
  const { semitone, quieter } = parseNote(token);
  const value = 12 + semitone - parseNote(base).semitone;
  if (value < LOWEST || value > HIGHEST) throw new Error(`${token} is out of range for an instrument based on ${base}`);
  return value + quieter;
}

export function tokens(notes: string): string[] {
  return notes.split(/\s+/).filter((token) => token !== "" && token !== "|");
}

export function compileTheme(theme: Theme): ZzfxmSong {
  const instruments = theme.instruments.map((instrument) =>
    zzfxParams({ ...instrument.zzfx, frequency: noteFrequency(instrument.base) }),
  );
  const patterns = theme.patterns.map((pattern, p) => {
    const rows = tokens(pattern[0].notes).length;
    return pattern.map(({ instrument, pan, notes }, c): ZzfxmChannel => {
      const line = tokens(notes);
      if (line.length !== rows) {
        throw new Error(`${theme.id}: pattern ${p} channel ${c} has ${line.length} rows, not ${rows}`);
      }
      const { base } = theme.instruments[instrument];
      return [instrument, pan, ...line.map((token) => compileToken(token, base))];
    });
  });
  return [instruments, patterns, [...theme.sequence], theme.bpm];
}

export function themeRows(theme: Theme): number {
  return theme.sequence.reduce((rows, index) => rows + tokens(theme.patterns[index][0].notes).length, 0);
}

// How long one time through the theme lasts: a row is a quarter of a beat.
export function themeSeconds(theme: Theme): number {
  return (themeRows(theme) * 60) / theme.bpm / 4;
}

// The song as ZzFXM source, for its tracker
// (keithclark.github.io/ZzFXM/tracker). The tracker's ZzFX has no low-pass
// filter, ZzFX's last parameter, so it plays the instruments brighter.
export function zzfxmSource(theme: Theme): string {
  const [instruments, patterns, sequence, bpm] = compileTheme(theme);
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  const list = (values: number[]): string => `[${values.map((v) => String(round(v))).join(",")}]`;
  return `[[${instruments.map(list).join(",")}],[${patterns
    .map((pattern) => `[${pattern.map(list).join(",")}]`)
    .join(",")}],${list(sequence)},${bpm},{"title":${JSON.stringify(theme.name)}}]`;
}
