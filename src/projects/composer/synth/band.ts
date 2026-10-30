import { pedalsOf, soundedEnd, timingOf, type Timing } from "../tempo";
import { scoreBeats, type Note, type PedalSpan, type Score } from "../types";
import { renderAnalog, type AnalogWork, type StereoNote } from "./analog";
import { renderFm, renderKitHit } from "./genesis";
import { LIBRARY, type Instrument, type InstrumentId } from "./library";
import { Room, type Rendered } from "./render";
import { renderSoftKitHit } from "./soft-kit";
import { renderStruck } from "./struck";

// A piece's own band: every named track in its own seat, so a fifteen-track
// piece isn't flattened to five roles. A band is plain data beside the piece's
// notes, and a track may sit in several chairs, which is how a line is doubled
// without touching the notes. The mix is built to sound like one instrument:
// a shared dark hall, the low-mids cleared from all but the bass, and a master
// bus that compresses gently and saturates like tape.

export interface Chair {
  instrument: InstrumentId;
  gain: number;
  // -1 is left, 1 right.
  pan: number;
  // How much goes to the hall.
  send: number;
  // In semitones, for a double at another octave.
  transpose?: number;
  // How much ensemble chorus, 0 to 1.
  chorus?: number;
  // Its slot in the spectrum: everything under and over these goes, in Hz, so
  // neighbours don't sit on each other. A bass has no low cut.
  lowCut?: number;
  highCut?: number;
  // Decibels it drops by while the tune sounds, a negative number.
  duck?: number;
  // How far a key's pitch moves it across the field, from middle C.
  keyPan?: number;
}

export interface Band {
  // What the band picker calls it, for a piece with more than one.
  name?: string;
  // The tracks by name; a score's track with no chair is an error.
  chairs: Record<string, readonly Chair[]>;
  // The tracks a chair's `duck` listens to.
  tune?: readonly string[];
  hall: { size: number; wet: number; damp: number; preDelay: number };
  // What the mix is scaled by before the master bus, worked out once from the
  // piece's loudest moment (`tools/levels.ts`), since a stream can't see ahead.
  level: number;
}

// Strengths are rendered at this many levels, since strength is tone. Two
// chairs of one synth get different takes, so a doubled pitch is two waves.
const STRENGTHS = 4;
const TAKES = 2;
const STRUCK_STRENGTHS = 6;
// The hall's ring and the longest release.
const TAIL_SECONDS = 6;
const FADE_SECONDS = 1;
// The mud between a bass and everything above it.
const MUD_HZ = 340;
const MUD_DB = -4;
const SEND_LOW_HZ = 320;
const SEND_HIGH_HZ = 6500;

const COMPRESS_THRESHOLD = 0.3;
const COMPRESS_RATIO = 1.8;
const COMPRESS_ATTACK = 0.03;
const COMPRESS_RELEASE = 0.3;
const TAPE_DRIVE = 1.5;
const TAPE_TOP_HZ = 15000;

// A stream's stretches of audio. Multiples of the open strings' block, so each
// starts on one.
export const STREAM_CHUNK = 1 << 16;
const MAX_STEP = STREAM_CHUNK;
// Rendered unheard before a start partway through, to wake the filters and the
// compressor: under half a second, so a seek stays quick.
const PRE_ROLL = 1 << 14;
const STRINGS_BLOCK = 64;

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function highPass(hz: number, sampleRate: number): Biquad {
  const w = (2 * Math.PI * hz) / sampleRate;
  const alpha = Math.sin(w) / (2 * 0.707);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
}

function lowPass(hz: number, sampleRate: number): Biquad {
  const w = (2 * Math.PI * hz) / sampleRate;
  const alpha = Math.sin(w) / (2 * 0.707);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
}

export function dip(hz: number, db: number, sampleRate: number, q = 0.9): Biquad {
  const w = (2 * Math.PI * hz) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const a = 10 ** (db / 40);
  const c = Math.cos(w);
  const a0 = 1 + alpha / a;
  return { b0: (1 + alpha * a) / a0, b1: (-2 * c) / a0, b2: (1 - alpha * a) / a0, a1: (-2 * c) / a0, a2: (1 - alpha / a) / a0 };
}

class Filter {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(private readonly shape: Biquad) {}

  process(samples: Float32Array, from: number, to: number): void {
    const { b0, b1, b2, a1, a2 } = this.shape;
    let { x1, x2, y1, y2 } = this;
    for (let i = from; i < to; i++) {
      const x = samples[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      samples[i] = y;
    }
    this.x1 = x1;
    this.x2 = x2;
    this.y1 = y1;
    this.y2 = y2;
  }
}

export function filter(samples: Float32Array, from: number, to: number, shape: Biquad): void {
  new Filter(shape).process(samples, from, to);
}

class Pole {
  private low = 0;
  private readonly a: number;

  constructor(hz: number, sampleRate: number) {
    this.a = 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
  }

  process(samples: Float32Array): void {
    const { a } = this;
    let { low } = this;
    for (let i = 0; i < samples.length; i++) {
      low += a * (samples[i] - low);
      samples[i] = low;
    }
    this.low = low;
  }
}

export function onePole(samples: Float32Array, hz: number, sampleRate: number): void {
  new Pole(hz, sampleRate).process(samples);
}

// A Juno-style ensemble: each side a slowly swept short delay, on opposite
// phases, so a held chord widens and moves without a pitch you can hear bend.
const CHORUS_SIZE = 4096;

class Chorus {
  private readonly line = new Float32Array(CHORUS_SIZE);
  private readonly centre: number;
  private readonly depth: number;
  private readonly rate: number;

  constructor(private readonly wet: number, private readonly phase: number, sampleRate: number) {
    this.centre = 0.014 * sampleRate;
    this.depth = 0.004 * sampleRate;
    this.rate = (2 * Math.PI * 0.53) / sampleRate;
  }

  // `start` is the frame in the piece: the sweep runs on the piece's clock.
  process(samples: Float32Array, start: number, count: number): void {
    const { line, centre, depth, rate, phase, wet } = this;
    const scale = 1 / (1 + wet * 0.6);
    for (let n = 0; n < count; n++) {
      const i = start + n;
      const delay = centre + depth * Math.sin(rate * i + phase);
      const read = i - delay;
      const whole = Math.floor(read);
      const part = read - whole;
      const early = line[whole & (CHORUS_SIZE - 1)];
      const late = line[(whole + 1) & (CHORUS_SIZE - 1)];
      line[i & (CHORUS_SIZE - 1)] = samples[n];
      samples[n] = (samples[n] + (early + (late - early) * part) * wet) * scale;
    }
  }
}

interface FrameSpan {
  start: number;
  end: number;
}

// Open strings answering what is held. One low string for each of the twelve
// notes: everything in the bus excites all of them, but only those whose note is
// held down, or pedalled, are undamped and heard. So a held chord's colour rings
// on in the room between its notes, and the rest of the keyboard stays quiet.
class OpenStrings {
  private readonly strings: { line: Float32Array; at: number; low: number; level: number; side: number }[];
  private readonly input = new Float32Array(STRINGS_BLOCK);

  constructor(private readonly amount: number, sampleRate: number) {
    this.strings = Array.from({ length: 12 }, (_, note) => {
      const hz = 440 * 2 ** ((note + 36 - 69) / 12);
      return { line: new Float32Array(Math.round(sampleRate / hz)), at: 0, low: 0, level: 0, side: (note - 5.5) / 12 };
    });
  }

  process(left: Float32Array, right: Float32Array, start: number, count: number, sounding: readonly Play[], pedals: readonly FrameSpan[]): void {
    const { input, amount } = this;
    const blocks = Math.ceil(count / STRINGS_BLOCK);
    const open = new Uint8Array(blocks * 12);
    // The pedal lifts every damper at once, so the whole keyboard answers.
    for (const pedal of pedals) {
      if (pedal.end <= start || pedal.start >= start + count) continue;
      const first = Math.max(0, Math.floor((pedal.start - start) / STRINGS_BLOCK));
      const last = Math.min(blocks, Math.ceil((pedal.end - start) / STRINGS_BLOCK));
      open.fill(1, first * 12, last * 12);
    }
    for (const play of sounding) {
      const first = Math.max(0, Math.floor((play.start - start) / STRINGS_BLOCK));
      const last = Math.min(blocks, Math.ceil((play.start + play.held - start) / STRINGS_BLOCK));
      for (let b = first; b < last; b++) open[b * 12 + (play.pitch % 12)] = 1;
    }
    for (let block = 0; block < blocks; block++) {
      const from = block * STRINGS_BLOCK;
      const size = Math.min(STRINGS_BLOCK, count - from);
      for (let i = 0; i < size; i++) input[i] = (left[from + i] + right[from + i]) * 0.5;
      this.strings.forEach((string, note) => {
        const held = open[block * 12 + note] === 1;
        const feedback = held ? 0.9985 : 0.93;
        const target = held ? amount * 0.02 : 0;
        const { line } = string;
        let { at, low, level } = string;
        for (let i = 0; i < size; i++) {
          const delayed = line[at];
          low += 0.6 * (delayed - low);
          line[at] = input[i] * 0.04 + low * feedback;
          at = at + 1 === line.length ? 0 : at + 1;
          level += 0.002 * (target - level);
          const heard = low * level;
          left[from + i] += heard * (1 - string.side);
          right[from + i] += heard * (1 + string.side);
        }
        string.at = at;
        string.low = low;
        string.level = level;
      });
    }
  }
}

// Which stretches of the piece the tune is sounding in, by the block.
const DUCK_BLOCK = 256;

function tuneActivity(score: Score, tune: readonly string[], time: Timing, length: number, sampleRate: number): Uint8Array {
  const active = new Uint8Array(Math.ceil(length / DUCK_BLOCK));
  for (const track of score.tracks) {
    if (!tune.includes(track.name)) continue;
    for (const note of track.notes) {
      const first = Math.floor((time.seconds(note.start) * sampleRate) / DUCK_BLOCK);
      const last = Math.ceil((time.seconds(note.start + note.duration) * sampleRate) / DUCK_BLOCK);
      active.fill(1, first, last);
    }
  }
  return active;
}

// Stereo-linked, so a loud side doesn't pull the image across.
class Compressor {
  private level = 0;
  private readonly rise: number;
  private readonly fall: number;

  constructor(sampleRate: number) {
    this.rise = 1 - Math.exp(-1 / (COMPRESS_ATTACK * sampleRate));
    this.fall = 1 - Math.exp(-1 / (COMPRESS_RELEASE * sampleRate));
  }

  process(left: Float32Array, right: Float32Array): void {
    const slope = 1 / COMPRESS_RATIO - 1;
    const { rise, fall } = this;
    let { level } = this;
    for (let i = 0; i < left.length; i++) {
      const input = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      level += (input > level ? rise : fall) * (input - level);
      if (level > COMPRESS_THRESHOLD) {
        const gain = (level / COMPRESS_THRESHOLD) ** slope;
        left[i] *= gain;
        right[i] *= gain;
      }
    }
    this.level = level;
  }
}

function strengthOf(voice: Instrument, velocity: number): number {
  const levels = voice.kind === "struck" ? STRUCK_STRENGTHS : STRENGTHS;
  return Math.max(1, Math.round(velocity * levels)) / levels;
}

export function renderNote(voice: Instrument, pitch: number, strength: number, take: number, seconds: number, sampleRate: number, work: AnalogWork): StereoNote {
  switch (voice.kind) {
    case "struck":
      return renderStruck(voice, pitch, strength, seconds, sampleRate, work);
    case "fm":
      return renderFm(voice, pitch, strength, seconds, sampleRate, work);
    case "kit":
      return renderKitHit(voice, pitch, strength, sampleRate, work);
    case "soft-kit":
      return renderSoftKitHit(voice, pitch, strength, sampleRate, work);
    case undefined:
      return renderAnalog(voice, pitch, strength, take, seconds, sampleRate, work);
  }
}

// Only the analog synth's stacks differ from take to take.
function takeOf(voice: Instrument, chairIndex: number): number {
  return voice.kind === undefined ? chairIndex % TAKES : 0;
}

function chairsOf(band: Band, name: string): readonly Chair[] {
  // A plain record lookup: a name from a score may not be in it.
  const chairs = (band.chairs as Partial<Band["chairs"]>)[name];
  if (chairs === undefined) throw new Error(`Composer: no chair in the band for track "${name}"`);
  return chairs;
}

// One note of a track, as a chair will play it.
interface Play {
  pitch: number;
  strength: number;
  take: number;
  start: number;
  held: number;
  // Its last frame's end, from `start`: held, and the release's fade.
  length: number;
  gain: number;
  panLeft: number;
  panRight: number;
  samples: StereoNote | null;
}

function cacheKey({ pitch, strength, take }: Play): string {
  return `${String(pitch)}:${String(strength)}:${String(take)}`;
}

// The notes of one instrument, each rendered once, on first use, and kept until
// its last. How long each must run comes from the music, so no held note can run
// out of samples, and a short note's render costs a short note's work.
class NoteCache {
  private readonly notes = new Map<string, StereoNote>();
  private readonly longest = new Map<string, number>();
  private readonly uses = new Map<string, number>();

  constructor(private readonly voice: Instrument, private readonly sampleRate: number, private readonly work: AnalogWork) {}

  plan(play: Play): void {
    const key = cacheKey(play);
    this.longest.set(key, Math.max(this.longest.get(key) ?? 0, play.length));
    this.uses.set(key, (this.uses.get(key) ?? 0) + 1);
  }

  take(play: Play): StereoNote {
    const key = cacheKey(play);
    const known = this.notes.get(key);
    if (known !== undefined) return known;
    const length = this.longest.get(key);
    if (length === undefined) throw new Error(`Composer: no length for ${key}`);
    const note = renderNote(this.voice, play.pitch, play.strength, play.take, length / this.sampleRate, this.sampleRate, this.work);
    this.notes.set(key, note);
    return note;
  }

  finished(play: Play): void {
    const key = cacheKey(play);
    const left = (this.uses.get(key) ?? 0) - 1;
    this.uses.set(key, left);
    if (left === 0) this.notes.delete(key);
  }
}

interface Mixed {
  left: Float32Array;
  right: Float32Array;
  sendLeft: Float32Array;
  sendRight: Float32Array;
}

// One chair of the band: its notes, and everything between them and the mix,
// each holding its state from one stretch of audio to the next.
class Seat {
  private readonly busLeft = new Float32Array(MAX_STEP);
  private readonly busRight = new Float32Array(MAX_STEP);
  private readonly fade: number;
  private readonly strings: OpenStrings | null;
  private readonly filters: Filter[][];
  private readonly ducking: number;
  private readonly duckEase: number;
  private readonly choruses: Chorus[] | null;
  private next = 0;
  private sounding: Play[] = [];
  private gain = 1;

  constructor(private readonly chair: Chair, voice: Instrument, private readonly plays: readonly Play[], private readonly pedals: readonly FrameSpan[], private readonly cache: NoteCache, private readonly activity: Uint8Array, sampleRate: number) {
    this.fade = Math.max(1, Math.round(voice.release * sampleRate));
    this.strings = voice.kind === "struck" && voice.sympathy > 0 ? new OpenStrings(voice.sympathy, sampleRate) : null;
    const shapes: Biquad[] = [];
    if (chair.lowCut !== undefined) shapes.push(highPass(chair.lowCut, sampleRate), dip(MUD_HZ, MUD_DB, sampleRate));
    if (chair.highCut !== undefined) shapes.push(lowPass(chair.highCut, sampleRate));
    this.filters = shapes.map((shape) => [new Filter(shape), new Filter(shape)]);
    this.ducking = chair.duck === undefined ? 1 : 10 ** (chair.duck / 20);
    this.duckEase = 1 - Math.exp(-1 / (0.06 * sampleRate));
    this.choruses = chair.chorus === undefined ? null : [new Chorus(chair.chorus, 0, sampleRate), new Chorus(chair.chorus, Math.PI / 2, sampleRate)];
  }

  // Mixes this stretch's notes in, and says which they were.
  private mix(start: number, count: number): readonly Play[] {
    const { busLeft, busRight, fade, plays } = this;
    const end = start + count;
    while (this.next < plays.length && plays[this.next].start < end) this.sounding.push(plays[this.next++]);
    const going = this.sounding;
    this.sounding = [];
    for (const play of going) {
      const samples = (play.samples ??= this.cache.take(play));
      const stop = Math.min(samples.left.length, play.length);
      const first = Math.max(0, start - play.start);
      const last = Math.min(stop, end - play.start);
      const shift = play.start - start;
      const { held, gain, panLeft, panRight } = play;
      for (let i = first; i < last; i++) {
        const release = i < held ? 1 : 1 - (i - held) / fade;
        const level = gain * release * release;
        busLeft[shift + i] += samples.left[i] * level * panLeft;
        busRight[shift + i] += samples.right[i] * level * panRight;
      }
      if (play.start + stop > end) this.sounding.push(play);
      else {
        play.samples = null;
        this.cache.finished(play);
      }
    }
    return going;
  }

  private duck(start: number, count: number): void {
    const { busLeft, busRight, activity, ducking, duckEase } = this;
    let { gain } = this;
    for (let i = 0; i < count; i++) {
      gain += duckEase * ((activity[Math.floor((start + i) / DUCK_BLOCK)] === 1 ? ducking : 1) - gain);
      busLeft[i] *= gain;
      busRight[i] *= gain;
    }
    this.gain = gain;
  }

  play(start: number, count: number, out: Mixed): void {
    const { busLeft, busRight, chair } = this;
    const heard = this.mix(start, count);
    this.strings?.process(busLeft, busRight, start, count, heard, this.pedals);
    for (const [left, right] of this.filters) {
      left.process(busLeft, 0, count);
      right.process(busRight, 0, count);
    }
    if (chair.duck !== undefined) this.duck(start, count);
    if (this.choruses !== null) {
      this.choruses[0].process(busLeft, start, count);
      this.choruses[1].process(busRight, start, count);
    }
    for (let i = 0; i < count; i++) {
      out.left[i] += busLeft[i];
      out.right[i] += busRight[i];
      out.sendLeft[i] += busLeft[i] * chair.send;
      out.sendRight[i] += busRight[i] * chair.send;
    }
    busLeft.fill(0, 0, count);
    busRight.fill(0, 0, count);
  }
}

// What is sent to the hall: a pre-delay, the lows and highs kept out of it, then
// the room itself, one for each side.
class Hall {
  private readonly delays: Float32Array[];
  private readonly lowCuts: Filter[];
  private readonly highCuts: Pole[];
  private readonly rooms: Room[];
  private at = 0;

  constructor(private readonly hall: Band["hall"], sampleRate: number) {
    const delay = Math.max(1, Math.round(hall.preDelay * sampleRate));
    this.delays = [new Float32Array(delay), new Float32Array(delay)];
    const cut = highPass(SEND_LOW_HZ, sampleRate);
    this.lowCuts = [new Filter(cut), new Filter(cut)];
    this.highCuts = [new Pole(SEND_HIGH_HZ, sampleRate), new Pole(SEND_HIGH_HZ, sampleRate)];
    this.rooms = [new Room(hall.size, 0, sampleRate, hall.damp), new Room(hall.size, 23, sampleRate, hall.damp)];
  }

  process(sends: readonly [Float32Array, Float32Array], outs: readonly [Float32Array, Float32Array]): void {
    const size = this.delays[0].length;
    sends.forEach((send, side) => {
      const delay = this.delays[side];
      let { at } = this;
      for (let i = 0; i < send.length; i++) {
        const out = delay[at];
        delay[at] = send[i];
        send[i] = out;
        at = at + 1 === size ? 0 : at + 1;
      }
      this.lowCuts[side].process(send, 0, send.length);
      this.highCuts[side].process(send);
      this.rooms[side].process(send, outs[side], this.hall.wet);
    });
    this.at = (this.at + sends[0].length) % size;
  }
}

// The band's end of the chain: a fixed level, since a stream can't see the loud
// part ahead of it, then gentle compression and tape. Tape's curve never reaches
// full scale, so no level here can clip.
class Master {
  private readonly compressor: Compressor;
  private readonly tops: Pole[];
  private readonly fadeFrom: number;
  private readonly fade: number;

  constructor(private readonly level: number, private readonly frames: number, sampleRate: number) {
    this.compressor = new Compressor(sampleRate);
    this.tops = [new Pole(TAPE_TOP_HZ, sampleRate), new Pole(TAPE_TOP_HZ, sampleRate)];
    this.fade = Math.round(FADE_SECONDS * sampleRate);
    this.fadeFrom = frames - this.fade;
  }

  process(left: Float32Array, right: Float32Array, start: number): void {
    const { level, frames, fade, fadeFrom } = this;
    for (let i = 0; i < left.length; i++) {
      left[i] *= level;
      right[i] *= level;
    }
    this.compressor.process(left, right);
    [left, right].forEach((side, index) => {
      for (let i = 0; i < side.length; i++) side[i] = Math.tanh(side[i] * TAPE_DRIVE);
      this.tops[index].process(side);
      for (let i = Math.max(0, fadeFrom - start); i < side.length; i++) side[i] *= (frames - start - i) / fade;
    });
  }
}

// How long a score runs on a band, in frames: every note and the hall's ring.
export function streamFrames(score: Score, sampleRate: number): number {
  return Math.ceil((timingOf(score).seconds(scoreBeats(score)) + TAIL_SECONDS) * sampleRate);
}

// A band playing a score, a stretch of audio at a time. Everything that carries
// over a join (filters, delay lines, the hall, the compressor) lives in the
// objects above, so where a stretch is cut changes nothing. Started anywhere but
// the top, it plays a moment of the music before it, unheard, to wake them up;
// the hall's ring from further back is lost.
export class BandStream {
  readonly frames: number;
  // The loudest moment reaching the master, before its level: what a band's
  // `level` is worked out from (`tools/levels.ts`).
  peak = 0;
  readonly work = { notes: 0, oscillatorSamples: 0 };
  private readonly seats: Seat[] = [];
  private readonly hall: Hall;
  private readonly master: Master;
  private frame: number;

  constructor(score: Score, band: Band, private readonly sampleRate: number, from = 0) {
    const time = timingOf(score);
    this.frames = streamFrames(score, sampleRate);
    this.hall = new Hall(band.hall, sampleRate);
    this.master = new Master(band.level, this.frames, sampleRate);
    this.frame = Math.max(0, from - PRE_ROLL);
    const activity = tuneActivity(score, band.tune ?? [], time, this.frames, sampleRate);
    const caches = new Map<InstrumentId, NoteCache>();
    const ordinals = new Map<InstrumentId, number>();
    for (const track of score.tracks) {
      const pedals = pedalsOf(score, track);
      const pedalFrames = pedals.map(({ start, end }) => ({ start: Math.round(time.seconds(start) * sampleRate), end: Math.round(time.seconds(end) * sampleRate) }));
      for (const chair of chairsOf(band, track.name)) {
        const voice: Instrument = LIBRARY[chair.instrument];
        const cache = caches.get(chair.instrument) ?? new NoteCache(voice, sampleRate, this.work);
        caches.set(chair.instrument, cache);
        const ordinal = ordinals.get(chair.instrument) ?? 0;
        ordinals.set(chair.instrument, ordinal + 1);
        const plays = track.notes.map((note) => this.playOf(note, chair, voice, ordinal, time, pedals)).filter((play) => play.start + play.length > this.frame);
        plays.sort((a, b) => a.start - b.start);
        for (const play of plays) cache.plan(play);
        this.seats.push(new Seat(chair, voice, plays, pedalFrames, cache, activity, sampleRate));
      }
    }
    while (this.frame < from) this.step(Math.min(MAX_STEP, from - this.frame));
  }

  private playOf(note: Note, chair: Chair, voice: Instrument, ordinal: number, time: Timing, pedals: readonly PedalSpan[]): Play {
    const { sampleRate, frames } = this;
    const pitch = note.pitch + (chair.transpose ?? 0);
    const place = Math.max(-1, Math.min(1, chair.pan + (chair.keyPan ?? 0) * ((pitch - 60) / 36)));
    const start = Math.round(time.seconds(note.start) * sampleRate);
    const held = Math.round(time.seconds(soundedEnd(note.start + note.duration, pedals)) * sampleRate) - start;
    return {
      pitch,
      strength: strengthOf(voice, note.velocity),
      take: takeOf(voice, ordinal),
      start,
      held,
      length: Math.min(held + Math.max(1, Math.round(voice.release * sampleRate)), frames - start),
      gain: chair.gain * note.velocity ** voice.dynamics,
      panLeft: Math.cos(((place + 1) * Math.PI) / 4) * Math.SQRT2,
      panRight: Math.sin(((place + 1) * Math.PI) / 4) * Math.SQRT2,
      samples: null,
    };
  }

  private step(count: number): Rendered {
    const out = { left: new Float32Array(count), right: new Float32Array(count), sendLeft: new Float32Array(count), sendRight: new Float32Array(count) };
    const start = this.frame;
    for (const seat of this.seats) seat.play(start, count, out);
    this.hall.process([out.sendLeft, out.sendRight], [out.left, out.right]);
    for (let i = 0; i < count; i++) this.peak = Math.max(this.peak, Math.abs(out.left[i]), Math.abs(out.right[i]));
    this.master.process(out.left, out.right, start);
    this.frame += count;
    return { left: out.left, right: out.right, sampleRate: this.sampleRate };
  }

  // The next stretch, or null at the end of the piece.
  next(frames = STREAM_CHUNK): Rendered | null {
    const count = Math.min(frames, this.frames - this.frame);
    return count <= 0 ? null : this.step(count);
  }
}

export function renderBand(score: Score, band: Band, sampleRate: number, chunk = STREAM_CHUNK): Rendered {
  const stream = new BandStream(score, band, sampleRate);
  const left = new Float32Array(stream.frames);
  const right = new Float32Array(stream.frames);
  let at = 0;
  for (let part = stream.next(chunk); part !== null; part = stream.next(chunk)) {
    left.set(part.left, at);
    right.set(part.right, at);
    at += part.left.length;
  }
  return { left, right, sampleRate };
}

const LOUDEST_BLOCK_SECONDS = 0.05;
// Sized by measuring: the bands' worked-out levels against this estimate.
const ESTIMATE_HEADROOM = 0.7;

// A level for what nobody has measured, an audition: from
// how much is held at the busiest moment, without rendering it. It only has to be
// near, since tape takes any excess gently.
export function estimateLevel(score: Score, band: Band): number {
  const time = timingOf(score);
  const blocks = new Map<number, number>();
  for (const track of score.tracks) {
    for (const chair of chairsOf(band, track.name)) {
      const voice: Instrument = LIBRARY[chair.instrument];
      for (const note of track.notes) {
        const first = Math.floor(time.seconds(note.start) / LOUDEST_BLOCK_SECONDS);
        const last = Math.ceil(time.seconds(note.start + note.duration) / LOUDEST_BLOCK_SECONDS);
        const amount = (chair.gain * note.velocity ** voice.dynamics * voice.output) ** 2;
        for (let block = first; block < last; block++) blocks.set(block, (blocks.get(block) ?? 0) + amount);
      }
    }
  }
  const busiest = Math.max(...blocks.values());
  if (!Number.isFinite(busiest) || busiest === 0) throw new Error(`Composer: "${score.title}" has no notes to play`);
  return ESTIMATE_HEADROOM / Math.sqrt(busiest);
}
