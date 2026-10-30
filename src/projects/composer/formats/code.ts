import { parseNote } from "@/shared/lib/sound";
import type { Note } from "../types";

// A piece as a program: motifs are values, and development is functions on
// them, so a sequence, an inversion or a walking bass is written once and
// used by name. Beats are quarter notes.

export type Phrase = readonly Note[];

export function midi(name: string): number {
  return parseNote(name).semitone + 12;
}

// A line from "name:beats" tokens, one after the other: "A4:1 C5:.5 r:.5 E5:2",
// with r a rest and + joining a chord, "C4+E4:2".
export function line(text: string, velocity = 0.75): Phrase {
  let at = 0;
  const notes: Note[] = [];
  for (const token of text.split(/\s+/).filter((part) => part !== "" && part !== "|")) {
    const colon = token.indexOf(":");
    const names = token.slice(0, colon);
    const duration = Number(token.slice(colon + 1));
    if (colon < 0 || Number.isNaN(duration)) throw new Error(`Code: "${token}" has no length`);
    if (names !== "r") {
      for (const name of names.split("+")) notes.push({ pitch: midi(name), start: at, duration, velocity });
    }
    at += duration;
  }
  return notes;
}

export function length(phrase: Phrase): number {
  return Math.max(0, ...phrase.map((note) => note.start + note.duration));
}

export function shift(phrase: Phrase, beats: number): Phrase {
  return phrase.map((note) => ({ ...note, start: note.start + beats }));
}

export function transpose(phrase: Phrase, semitones: number): Phrase {
  return phrase.map((note) => ({ ...note, pitch: note.pitch + semitones }));
}

// Plays phrases one after another. A number is a rest of that many beats.
export function seq(...parts: readonly (Phrase | number)[]): Phrase {
  let at = 0;
  const notes: Note[] = [];
  for (const part of parts) {
    if (typeof part === "number") {
      at += part;
      continue;
    }
    notes.push(...shift(part, at));
    at += length(part);
  }
  return notes;
}

export function stack(...parts: readonly Phrase[]): Phrase {
  return parts.flat();
}

export function times(count: number, phrase: Phrase): Phrase {
  return seq(...Array.from({ length: count }, () => phrase));
}

export function louder(phrase: Phrase, by: number): Phrase {
  return phrase.map((note) => ({ ...note, velocity: Math.min(1, note.velocity * by) }));
}

// The pitches of a major or minor scale from a tonic, over all octaves.
export function scale(tonic: string, kind: "major" | "minor"): number[] {
  const steps = kind === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const pitchClass = midi(tonic) % 12;
  return Array.from({ length: 128 }, (_, pitch) => pitch).filter((pitch) => steps.includes((pitch - pitchClass + 120) % 12));
}

// Moves each note along a scale by degrees, so a third stays a third of the
// key, major or minor as it falls. A note outside the scale is an error.
export function diatonic(phrase: Phrase, degrees: number, within: readonly number[]): Phrase {
  return phrase.map((note) => {
    const index = within.indexOf(note.pitch);
    if (index < 0) throw new Error(`Code: pitch ${String(note.pitch)} is outside the scale`);
    return { ...note, pitch: within[index + degrees] };
  });
}

// The mirror image of a phrase about a pitch, along a scale.
export function invert(phrase: Phrase, about: number, within: readonly number[]): Phrase {
  const pivot = within.indexOf(about);
  if (pivot < 0) throw new Error(`Code: pitch ${String(about)} is outside the scale`);
  return phrase.map((note) => {
    const index = within.indexOf(note.pitch);
    if (index < 0) throw new Error(`Code: pitch ${String(note.pitch)} is outside the scale`);
    return { ...note, pitch: within[2 * pivot - index] };
  });
}

// A chord broken into a repeating figure: `order` picks chord tones by index
// from low to high, one per `step` beats, filling `beats`.
export function arpeggio(chord: readonly string[], order: readonly number[], step: number, beats: number, velocity = 0.55): Phrase {
  const pitches = chord.map(midi);
  return Array.from({ length: Math.round(beats / step) }, (_, i) => ({
    pitch: pitches[order[i % order.length]],
    start: i * step,
    duration: step,
    velocity,
  }));
}
