import { barBeats, scoreBeats, type Note, type Score, type Track } from "./types";

// A score as ABC, so a piece written in any format shows as sheet music.
// Notation is coarser than a score: onsets round to the nearest sixteenth, and
// each track is one voice, so a note still sounding at the next onset is cut
// short there. Drums aren't shown.

const STEPS_PER_BEAT = 4;
const SHARP_ORDER = "FCGDAEB";
const LETTERS = "CDEFGAB";
const NATURALS = [0, 2, 4, 5, 7, 9, 11];

// How many sharps (or, negative, flats) a key has.
function keySharps(key: string): number {
  const match = /^([A-G])([#b]?)(m?)$/.exec(key);
  if (match === null) throw new Error(`ABC export: not a key: "${key}"`);
  const [, letter, accidental, minor] = match;
  const fifths: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
  const shift = accidental === "#" ? 7 : accidental === "b" ? -7 : 0;
  return fifths[letter] + shift - (minor === "m" ? 3 : 0);
}

// Each letter's alteration in a key signature, by letter index in C D E F G A B.
function signature(sharps: number): number[] {
  const altered = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < Math.abs(sharps); i++) {
    const letter = sharps > 0 ? SHARP_ORDER[i] : SHARP_ORDER[6 - i];
    altered[LETTERS.indexOf(letter)] = sharps > 0 ? 1 : -1;
  }
  return altered;
}

// A pitch as a letter and an alteration, spelled as the key spells it, or with
// sharps in a sharp key and flats in a flat one.
function spell(pitch: number, key: readonly number[], sharps: number): { octave: number; letter: number; alter: number } {
  const octave = Math.floor(pitch / 12) - 1;
  const pitchClass = ((pitch % 12) + 12) % 12;
  for (let letter = 0; letter < 7; letter++) {
    if ((NATURALS[letter] + key[letter] + 12) % 12 === pitchClass) {
      const edge = NATURALS[letter] + key[letter];
      return { octave: octave - (edge < 0 ? -1 : edge > 11 ? 1 : 0), letter, alter: key[letter] };
    }
  }
  if (NATURALS.includes(pitchClass)) return { octave, letter: NATURALS.indexOf(pitchClass), alter: 0 };
  const alter = sharps >= 0 ? 1 : -1;
  return { octave, letter: NATURALS.indexOf((pitchClass - alter + 12) % 12), alter };
}

const ACCIDENTAL: Record<number, string> = { [-1]: "_", 0: "=", 1: "^" };

function noteText(pitch: number, key: readonly number[], sharps: number, bar: Map<string, number>): string {
  const { octave, letter, alter } = spell(pitch, key, sharps);
  const id = `${String(letter)}:${String(octave)}`;
  const current = bar.get(id) ?? key[letter];
  const mark = alter === current ? "" : ACCIDENTAL[alter];
  bar.set(id, alter);
  const name = LETTERS[letter];
  if (octave >= 5) return mark + name.toLowerCase() + "'".repeat(octave - 5);
  return mark + name + ",".repeat(4 - octave);
}

interface Span {
  step: number;
  pitches: number[];
  length: number;
}

// A voice as onsets: each lasts to its longest note, or the next onset.
function spans(notes: readonly Note[], totalSteps: number): Span[] {
  const byStep = new Map<number, Note[]>();
  for (const note of notes) {
    const step = Math.round(note.start * STEPS_PER_BEAT);
    if (step >= totalSteps) continue;
    byStep.set(step, [...(byStep.get(step) ?? []), note]);
  }
  const steps = [...byStep.keys()].sort((a, b) => a - b);
  return steps.map((step, index) => {
    const group = byStep.get(step) ?? [];
    const end = steps.at(index + 1) ?? totalSteps;
    const wanted = Math.max(...group.map((note) => Math.round(note.duration * STEPS_PER_BEAT)), 1);
    return { step, pitches: [...new Set(group.map((note) => note.pitch))].sort((a, b) => a - b), length: Math.min(wanted, end - step) };
  });
}

function voiceText(track: Track, score: Score, barSteps: number, totalSteps: number): string {
  const sharps = keySharps(score.key);
  const key = signature(sharps);
  const ons = spans(track.notes, totalSteps);
  let text = "";
  let bar = new Map<string, number>();
  let barsOnLine = 0;
  const barLine = (): void => {
    text += barsOnLine % 4 === 3 ? " |\n" : " | ";
    barsOnLine++;
    bar = new Map();
  };
  // Writes `length` steps from `step`, cut at bar lines, tied across them.
  const write = (step: number, length: number, make: () => string, tie: boolean): void => {
    let at = step;
    let left = length;
    while (left > 0) {
      const room = barSteps - (at % barSteps);
      const part = Math.min(room, left);
      left -= part;
      text += `${make()}${String(part)}${tie && left > 0 ? "-" : ""} `;
      at += part;
      if (at % barSteps === 0 && at < totalSteps) barLine();
    }
  };
  let cursor = 0;
  for (const { step, pitches, length } of ons) {
    write(cursor, step - cursor, () => "z", false);
    const body = (): string => {
      const names = pitches.map((pitch) => noteText(pitch, key, sharps, bar));
      return names.length === 1 ? names[0] : `[${names.join("")}]`;
    };
    write(step, length, body, true);
    cursor = step + length;
  }
  write(cursor, totalSteps - cursor, () => "z", false);
  return `${text}|]`;
}

export function scoreToAbc(score: Score): string {
  const barSteps = barBeats(score) * STEPS_PER_BEAT;
  const totalSteps = Math.ceil(scoreBeats(score) * STEPS_PER_BEAT / barSteps) * barSteps;
  const parts = score.tracks.filter((track) => track.role !== "drums" && track.notes.length > 0);
  const clef = (track: Track): string => {
    const mean = track.notes.reduce((sum, note) => sum + note.pitch, 0) / track.notes.length;
    return mean < 57 ? "bass" : "treble";
  };
  return [
    "X:1",
    `T:${score.title}`,
    `M:${String(score.metre[0])}/${String(score.metre[1])}`,
    "L:1/16",
    `Q:1/4=${String(Math.round(score.bpm))}`,
    `K:${score.key}`,
    ...parts.flatMap((track, index) => [
      `V:${String(index + 1)} clef=${clef(track)} name="${track.name}"`,
      voiceText(track, score, barSteps, totalSteps),
    ]),
  ].join("\n");
}
