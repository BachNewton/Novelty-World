import type { Analysis } from "./analysis";
import type { Band } from "./synth/band";

// The one form every piece reaches. The bands and the views read only this.

// What a track does in the music, which decides how the views draw it.
export type Role = "lead" | "keys" | "bass" | "pad" | "drums";

export const ROLES: readonly Role[] = ["lead", "keys", "bass", "pad", "drums"];

export interface Note {
  // A MIDI note: 60 is middle C.
  pitch: number;
  // In quarter-note beats from the start of the piece.
  start: number;
  duration: number;
  // From 0 to 1.
  velocity: number;
}

// The sustain pedal down, in beats: a note lifted under it rings until `end`.
export interface PedalSpan {
  start: number;
  end: number;
}

export interface Track {
  name: string;
  role: Role;
  notes: Note[];
  // A pedal for this track alone; `Score.pedal` holds for all of them.
  pedal?: PedalSpan[];
}

// The tempo from a beat on. With `glide`, it arrives here evenly from the point
// before: a written ritardando or accelerando.
export interface TempoPoint {
  beat: number;
  bpm: number;
  glide?: boolean;
}

export interface Score {
  title: string;
  // In order, the first at beat 0. `tempo.ts` turns beats into seconds.
  tempo: readonly TempoPoint[];
  pedal: PedalSpan[];
  // The time signature, as in 3/4.
  metre: readonly [beats: number, unit: number];
  // A key: C, Am, F#m, Bb.
  key: string;
  tracks: Track[];
}

export interface Piece {
  id: string;
  title: string;
  // Whose manner it is written in, which the track selector names.
  after?: string;
  // How the track selector files it: a broad genre, then a style within it.
  genre: string;
  style: string;
  score: () => Score;
  // The band it plays on by default, and any others it can play on, each named.
  band: Band;
  otherBands?: readonly Band[];
  // Its form, themes and harmony: the language for talking about it.
  analysis?: Analysis;
}

export function bandsOf(piece: Piece): readonly Band[] {
  return [piece.band, ...(piece.otherBands ?? [])];
}

export function scoreBeats(score: Score): number {
  const noteEnds = score.tracks.flatMap((track) => track.notes.map((note) => note.start + note.duration));
  const pedalEnds = [...score.pedal, ...score.tracks.flatMap((track) => track.pedal ?? [])].map((pedal) => pedal.end);
  return Math.max(0, ...noteEnds, ...pedalEnds);
}

// Beats in a bar, in quarter notes: 6/8 is 3.
export function barBeats(score: Score): number {
  return (score.metre[0] * 4) / score.metre[1];
}
