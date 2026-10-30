import { beatSeconds, scoreBeats, type Role, type Score } from "../types";
import { bell, cello, chipPulse, chipSoft, chipTriangle, drums, electricPiano, flute, fmBass, fmPad, harp, piano, strings, type Patch, type RenderContext } from "./patches";

// A performer is a band: an instrument for each role in the music, placed
// left to right and in the room. The mixer renders any score with any band.

export interface Seat {
  patch: Patch;
  gain: number;
  // -1 is left, 1 right.
  pan: number;
  // How much goes to the room.
  send: number;
}

export interface Performer {
  id: string;
  name: string;
  room: { size: number; wet: number };
  seats: Record<Role, Seat>;
}

export const PERFORMERS: readonly Performer[] = [
  {
    id: "grand",
    name: "Grand piano",
    room: { size: 0.8, wet: 0.2 },
    seats: {
      lead: { patch: piano, gain: 1, pan: 0.08, send: 1 },
      keys: { patch: piano, gain: 1, pan: -0.05, send: 1 },
      bass: { patch: piano, gain: 1, pan: -0.14, send: 1 },
      pad: { patch: piano, gain: 0.8, pan: 0, send: 1 },
      drums: { patch: drums, gain: 0.3, pan: 0, send: 0.4 },
    },
  },
  {
    id: "chamber",
    name: "Chamber",
    room: { size: 0.86, wet: 0.26 },
    seats: {
      lead: { patch: flute, gain: 0.75, pan: 0.18, send: 1 },
      keys: { patch: harp, gain: 0.7, pan: -0.3, send: 1 },
      bass: { patch: cello, gain: 0.55, pan: 0.3, send: 0.8 },
      pad: { patch: strings, gain: 0.4, pan: 0, send: 1 },
      drums: { patch: drums, gain: 0.3, pan: 0, send: 0.6 },
    },
  },
  {
    id: "electric",
    name: "Electric",
    room: { size: 0.7, wet: 0.16 },
    seats: {
      lead: { patch: bell, gain: 0.55, pan: 0.15, send: 1 },
      keys: { patch: electricPiano, gain: 0.7, pan: -0.15, send: 0.8 },
      bass: { patch: fmBass, gain: 0.8, pan: 0, send: 0.2 },
      pad: { patch: fmPad, gain: 0.35, pan: 0, send: 1 },
      drums: { patch: drums, gain: 0.7, pan: 0, send: 0.2 },
    },
  },
  {
    id: "chip",
    name: "Chip (ZzFX)",
    room: { size: 0.5, wet: 0.06 },
    seats: {
      lead: { patch: chipPulse, gain: 0.9, pan: 0.2, send: 1 },
      keys: { patch: chipSoft, gain: 0.9, pan: -0.2, send: 1 },
      bass: { patch: chipTriangle, gain: 0.9, pan: 0, send: 0.3 },
      pad: { patch: chipSoft, gain: 0.6, pan: 0, send: 1 },
      drums: { patch: drums, gain: 0.7, pan: 0, send: 0.2 },
    },
  },
];

export function performerById(id: string): Performer {
  const performer = PERFORMERS.find((candidate) => candidate.id === id);
  if (performer === undefined) throw new Error(`Composer: no performer "${id}"`);
  return performer;
}

const TAIL_SECONDS = 2.5;
const PEAK = 0.9;
// Strengths are rendered at this many levels, since strength changes a
// note's tone; the mixer scales the rest of the way.
const STRENGTHS = 4;

// One Freeverb channel: parallel combs make the room's many echoes, and
// allpasses smear them into a wash.
class Room {
  private readonly combs: { line: Float32Array; at: number; low: number }[];
  private readonly passes: { line: Float32Array; at: number }[];
  private readonly feedback: number;

  constructor(size: number, spread: number, sampleRate: number) {
    const scale = sampleRate / 44100;
    const line = (tuning: number): Float32Array => new Float32Array(Math.round((tuning + spread) * scale));
    this.combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((tuning) => ({ line: line(tuning), at: 0, low: 0 }));
    this.passes = [556, 441, 341, 225].map((tuning) => ({ line: line(tuning), at: 0 }));
    this.feedback = 0.7 + size * 0.28;
  }

  process(input: Float32Array, out: Float32Array, wet: number): void {
    const damp = 0.25;
    for (let i = 0; i < input.length; i++) {
      let sum = 0;
      for (const comb of this.combs) {
        const delayed = comb.line[comb.at];
        comb.low = delayed * (1 - damp) + comb.low * damp;
        comb.line[comb.at] = input[i] * 0.015 + comb.low * this.feedback;
        comb.at = (comb.at + 1) % comb.line.length;
        sum += delayed;
      }
      for (const pass of this.passes) {
        const delayed = pass.line[pass.at];
        const through = delayed - sum;
        pass.line[pass.at] = sum + delayed * 0.5;
        pass.at = (pass.at + 1) % pass.line.length;
        sum = through;
      }
      out[i] += sum * wet;
    }
  }
}

export interface Rendered {
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
  sampleRate: number;
}

export function renderScore(score: Score, performer: Performer, context: RenderContext): Rendered {
  const { sampleRate } = context;
  const beat = beatSeconds(score);
  const length = Math.ceil((scoreBeats(score) * beat + TAIL_SECONDS) * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const send = new Float32Array(length);
  const cache = new Map<string, Float32Array>();

  for (const track of score.tracks) {
    const seat = performer.seats[track.role];
    const { patch } = seat;
    const panLeft = Math.cos(((seat.pan + 1) * Math.PI) / 4);
    const panRight = Math.sin(((seat.pan + 1) * Math.PI) / 4);
    const fade = Math.max(1, Math.round(patch.release * sampleRate));
    for (const note of track.notes) {
      const level = Math.max(1, Math.round(note.velocity * STRENGTHS)) / STRENGTHS;
      const key = `${patch.name}:${String(note.pitch)}:${String(level)}`;
      let samples = cache.get(key);
      if (samples === undefined) {
        samples = patch.render(note.pitch, level, context);
        cache.set(key, samples);
      }
      const offset = Math.round(note.start * beat * sampleRate);
      const held = Math.round(note.duration * beat * sampleRate);
      const end = Math.min(samples.length, held + fade, length - offset);
      const gain = seat.gain * (note.velocity / level) * note.velocity ** 0.5;
      for (let i = 0; i < end; i++) {
        const release = i < held ? 1 : 1 - (i - held) / fade;
        const sample = samples[i] * gain * release * release;
        left[offset + i] += sample * panLeft;
        right[offset + i] += sample * panRight;
        send[offset + i] += sample * seat.send;
      }
    }
  }

  new Room(performer.room.size, 0, sampleRate).process(send, left, performer.room.wet);
  new Room(performer.room.size, 23, sampleRate).process(send, right, performer.room.wet);

  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  if (peak === 0) throw new Error(`Composer: "${score.title}" rendered silent`);
  const scale = PEAK / peak;
  for (let i = 0; i < length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
  return { left, right, sampleRate };
}
