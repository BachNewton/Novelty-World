// The one form every piece reaches, whatever it was written in. The synths
// and the views read only this, so any piece plays on any synth and shows in
// any view.

// What a track does in the music. A performer chooses an instrument per role.
export type Role = "lead" | "keys" | "bass" | "pad" | "drums";

export const ROLES: readonly Role[] = ["lead", "keys", "bass", "pad", "drums"];

// General MIDI's drum notes, the ones the drum voices play.
export const KICK = 36;
export const SNARE = 38;
export const HAT = 42;

export interface Note {
  // A MIDI note: 60 is middle C.
  pitch: number;
  // In quarter-note beats from the start of the piece.
  start: number;
  duration: number;
  // From 0 to 1.
  velocity: number;
}

export interface Track {
  name: string;
  role: Role;
  notes: Note[];
}

export interface Score {
  title: string;
  bpm: number;
  // The time signature, as in 3/4.
  metre: readonly [beats: number, unit: number];
  // A key as ABC names it: C, Am, F#m, Bb.
  key: string;
  tracks: Track[];
}

export type FormatId = "abc" | "tracker" | "events" | "code" | "midi";

export interface Piece {
  id: string;
  title: string;
  format: FormatId;
  // The text it was written in. A piece written as code has none: its source
  // is its file.
  source: string | null;
  score: () => Score;
}

export function scoreBeats(score: Score): number {
  return Math.max(0, ...score.tracks.flatMap((track) => track.notes.map((note) => note.start + note.duration)));
}

export function beatSeconds(score: Score): number {
  return 60 / score.bpm;
}

// Beats in a bar, in quarter notes: 6/8 is 3.
export function barBeats(score: Score): number {
  return (score.metre[0] * 4) / score.metre[1];
}
