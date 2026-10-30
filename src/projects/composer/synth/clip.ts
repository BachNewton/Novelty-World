import { renderAnalog, type AnalogVoice, type AnalogWork, type Layer } from "./analog";
import { dip, filter, highPass, onePole } from "./band";
import { Room, type Rendered } from "./render";
import { CLIP_BPM, type Clip, type ClipPart, type Sound } from "./vocabulary";

// Plays the dictionary (`vocabulary.ts`): a word's values on the analog engine,
// into the hall the bands use, at a level evened out so that only the word
// changes. It stops short of the band's master bus on purpose: that bus's tape
// would dirty the clean end of a scale, and its compression would even out the
// very differences a scale is there to show.

const HALL = { size: 0.8, wet: 0.2, damp: 0.55, preDelay: 0.028 };
const SEND_LOW_HZ = 170;
const SEND_HIGH_HZ = 6500;
const ROOM_TAIL_SECONDS = 2;
const FADE_SECONDS = 0.3;
// The level every clip is evened to across its notes, and the most a peak may reach.
const TARGET_RMS = 0.13;
const PEAK = 0.95;
const HONK_HZ = 1200;
const HONK_Q = 2.2;
const MUD_HZ = 300;
const MUD_Q = 1;
const PRESENCE_HZ = 3200;
const PRESENCE_Q = 1.1;
const LATENESS_SEED = 0.6180339887;
const WHINE_TRANSPOSE = 36;

function voiceOf(sound: Sound): AnalogVoice {
  const { voices, detune, width, square, sub } = sound;
  const stack = { voices, detune, width };
  const layers: Layer[] = [
    { wave: "saw", ...stack, level: 1 - square },
    { wave: "pulse", ...stack, level: square * 0.7 },
    { wave: "triangle", voices: 2, detune: detune / 2, width: width / 2, level: sub, transpose: -12 },
  ];
  return {
    layers: layers.filter((layer) => layer.level > 0),
    filter: { hz: sound.cutoffHz, keyTrack: 0.5, velocity: 0.8, opens: 1, envelope: { attack: 0.003, decay: 0.25, sustain: 0.2 }, resonance: sound.resonance },
    amp: { attack: sound.attack, decay: 0.9, sustain: 0.75 },
    release: sound.release,
    drift: sound.drift,
    dynamics: 1,
    output: 0.5,
  };
}

// Open and undrifting, so nothing softens it: a separate voice, because the
// main voice's filter would swallow it.
function whineVoice(sound: Sound): AnalogVoice {
  return {
    layers: [{ wave: "sine", voices: 1, detune: 0, width: 0, level: sound.whine, transpose: WHINE_TRANSPOSE }],
    filter: { hz: 12000, keyTrack: 0, velocity: 0, opens: 0, envelope: { attack: 0.01, decay: 0.1, sustain: 1 }, resonance: 0 },
    amp: { attack: 0.03, decay: 1, sustain: 1 },
    release: sound.release,
    drift: 0,
    dynamics: 1,
    output: 0.5,
  };
}

function mix(voice: AnalogVoice, part: ClipPart, left: Float32Array, right: Float32Array, sampleRate: number, work: AnalogWork): void {
  const { sound, notes } = part;
  const beat = 60 / CLIP_BPM;
  const fade = Math.max(1, Math.round(sound.release * sampleRate));
  notes.forEach((note, index) => {
    const lateness = ((index * LATENESS_SEED) % 1) * sound.scatterMs * 0.001;
    const offset = Math.round((note.start * beat + lateness) * sampleRate);
    const held = Math.round(note.duration * beat * sound.gate * sampleRate);
    const samples = renderAnalog(voice, note.pitch, note.velocity, 0, held / sampleRate + sound.release, sampleRate, work);
    const end = Math.min(samples.left.length, left.length - offset);
    for (let i = 0; i < end; i++) {
      const release = i < held ? 1 : 1 - (i - held) / fade;
      const level = note.velocity * release * release;
      left[offset + i] += samples.left[i] * level;
      right[offset + i] += samples.right[i] * level;
    }
  });
}

function saturate(left: Float32Array, right: Float32Array, drive: number): void {
  let peak = 0;
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  for (const side of [left, right]) {
    for (let i = 0; i < side.length; i++) side[i] = Math.tanh((side[i] / peak) * drive) * peak;
  }
}

function renderPart(part: ClipPart, length: number, sampleRate: number, work: AnalogWork): readonly [Float32Array, Float32Array] {
  const { sound, db, pan } = part;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  mix(voiceOf(sound), part, left, right, sampleRate, work);
  if (sound.whine > 0) mix(whineVoice(sound), part, left, right, sampleRate, work);

  const shapes = [
    highPass(sound.lowCut, sampleRate),
    dip(HONK_HZ, sound.honkDb, sampleRate, HONK_Q),
    dip(MUD_HZ, sound.mudDb, sampleRate, MUD_Q),
    dip(PRESENCE_HZ, sound.presenceDb, sampleRate, PRESENCE_Q),
  ];
  for (const side of [left, right]) {
    for (const shape of shapes) filter(side, 0, length, shape);
  }
  if (sound.drive > 1) saturate(left, right, sound.drive);

  const gain = 10 ** (db / 20);
  const panLeft = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const panRight = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  for (let i = 0; i < length; i++) {
    left[i] *= panLeft;
    right[i] *= panRight;
  }
  if (sound.send > 0) hall(left, 0, sound.send, sampleRate);
  if (sound.send > 0) hall(right, 23, sound.send, sampleRate);
  return [left, right];
}

function hall(side: Float32Array, spread: number, amount: number, sampleRate: number): void {
  const send = new Float32Array(side.length);
  const delay = Math.round(HALL.preDelay * sampleRate);
  for (let i = delay; i < side.length; i++) send[i] = side[i - delay] * amount;
  filter(send, 0, send.length, highPass(SEND_LOW_HZ, sampleRate));
  onePole(send, SEND_HIGH_HZ, sampleRate);
  new Room(HALL.size, spread, sampleRate, HALL.damp).process(send, side, HALL.wet);
}

// The gain that brings a clip's notes, not its tail, to the target, so that a
// long tail or a quiet attack isn't paid for in level.
function levelling(left: Float32Array, right: Float32Array, sounded: number): number {
  let energy = 0;
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    if (i < sounded) energy += left[i] * left[i] + right[i] * right[i];
  }
  return Math.min(TARGET_RMS / Math.sqrt(energy / (2 * sounded)), PEAK / peak);
}

export function renderClip(clip: Clip, sampleRate: number): Rendered & { work: AnalogWork } {
  const beat = 60 / CLIP_BPM;
  const notes = clip.parts.flatMap((part) => part.notes);
  const sounded = Math.ceil(Math.max(...notes.map((note) => note.start + note.duration)) * beat * sampleRate);
  const lastSound = Math.max(...clip.parts.flatMap(({ sound, notes: own }) => own.map((note) => (note.start + note.duration * sound.gate) * beat + sound.scatterMs * 0.001 + sound.release)));
  const length = Math.ceil((lastSound + ROOM_TAIL_SECONDS) * sampleRate);
  const work: AnalogWork = { notes: 0, oscillatorSamples: 0 };
  const parts = clip.parts.map((part) => renderPart(part, length, sampleRate, work));

  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (const [partLeft, partRight] of parts) {
    for (let i = 0; i < length; i++) {
      left[i] += partLeft[i];
      right[i] += partRight[i];
    }
  }
  const gain = levelling(left, right, sounded);
  const heard = clip.solo === undefined ? [left, right] : parts[clip.solo];
  const fade = Math.round(FADE_SECONDS * sampleRate);
  for (const side of heard) {
    for (let i = 0; i < length; i++) side[i] *= gain * Math.min(1, (length - i) / fade);
  }
  return { left: heard[0] as Float32Array<ArrayBuffer>, right: heard[1] as Float32Array<ArrayBuffer>, sampleRate, work };
}
