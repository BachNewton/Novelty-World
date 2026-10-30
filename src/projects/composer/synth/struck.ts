import type { AnalogWork, StereoNote } from "./analog";

// The struck engine, for the piano family: a note is a set of decaying partials,
// each a pair of slightly apart resonators, as a piano's unison strings are.
// Their beating, and the fast then slow decay it makes, is what a held piano note
// is. A stiff string's overtones run sharp, which is why it is `stiffness` and
// not harmonics that say "piano". Touch moves the spectrum a long way: a soft
// note is a few low partials and a hard one reaches far up. A partial stops
// costing anything once it has died, so a long pedalled note is cheap.

export interface StruckVoice {
  kind: "struck";
  // The most partials any note has.
  partials: number;
  // Inharmonicity at middle C, and the octaves over which it doubles.
  stiffness: number;
  stiffnessOctaves: number;
  // The spectrum's slope, a partial's amplitude falling as k^-slope, from the
  // softest touch to the hardest, and how much shallower per octave below middle C.
  slope: { soft: number; hard: number; bass: number };
  // Where along the string the hammer lands, as a fraction: it thins the partials
  // with a node there. 0 for none.
  strikeAt: number;
  // Above this, partials fall away.
  topHz: number;
  // Below this the body hardly radiates, so a low note is heard by its harmonics.
  bodyHz: number;
  // In seconds at middle C: the fast stage, the slow stage, and the slow stage's share.
  ring: { prompt: number; after: number; afterShare: number };
  // Octaves shorter per octave of pitch.
  keyRing: number;
  // How much sooner upper partials die: the top of a note goes first.
  topDamp: number;
  // The gap between a partial's two strings, in cents: the beating.
  unison: number;
  // Seconds from strike to full, softest touch then hardest.
  attack: { soft: number; hard: number };
  // The hammer: a short band of noise, and the wooden thump of the body.
  hammer: { level: number; time: number; hz: number };
  thump: number;
  // An electric pickup's growl, from nothing to overdriven, grown by touch.
  bark?: number;
  // How far the partials spread across the stereo field, 0 to 1.
  width: number;
  // Open strings ringing with whatever is held, 0 to 1 (`band.ts`).
  sympathy: number;
  // Decibels per octave of level across the keyboard, to even out how loud it sounds.
  evenness: number;
  release: number;
  dynamics: number;
  output: number;
}

const TAU = 2 * Math.PI;
const CENT = Math.LN2 / 1200;
// A partial is rendered until it is this far under its start.
const SILENT = 1e-3;
// Above C6 a note dies this many octaves sooner per octave: the top must not ring on.
const HIGH_PITCH = 84;
const HIGH_RING = 1.3;
const HIGH_LIFT = 4;
const THUMP_MODES = [
  { hz: 92, time: 0.05, level: 1 },
  { hz: 178, time: 0.035, level: 0.7 },
  { hz: 310, time: 0.022, level: 0.45 },
];

function random(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

// A damped sine, added to both sides: a two-pole resonator, far cheaper than a
// sine per sample, with its decay built in. Returns the samples it took.
function addPartial(left: Float32Array, right: Float32Array, hz: number, amplitude: number, tau: number, phase: number, pan: number, sampleRate: number): number {
  const length = Math.min(left.length, Math.ceil(tau * Math.log(amplitude / SILENT) * sampleRate));
  if (length <= 0) return 0;
  const r = Math.exp(-1 / (tau * sampleRate));
  const w = (TAU * hz) / sampleRate;
  const c1 = 2 * r * Math.cos(w);
  const c2 = -r * r;
  const gainLeft = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gainRight = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  let y1 = amplitude * Math.sin(phase);
  let y2 = (amplitude * Math.sin(phase - w)) / r;
  for (let i = 0; i < length; i++) {
    left[i] += y1 * gainLeft;
    right[i] += y1 * gainRight;
    const y = c1 * y1 + c2 * y2;
    y2 = y1;
    y1 = y;
  }
  return length;
}

// An asymmetric soft curve: a pickup near its tine, with even harmonics.
function barked(value: number, drive: number): number {
  const pushed = value * drive + 0.5 * drive * value * value;
  return pushed / (1 + Math.abs(pushed) * 0.9);
}

export function renderStruck(voice: StruckVoice, pitch: number, velocity: number, seconds: number, sampleRate: number, work: AnalogWork): StereoNote {
  const hz = 440 * 2 ** ((pitch - 69) / 12);
  const octaves = (pitch - 60) / 12;
  const { ring, slope } = voice;
  const stiffness = voice.stiffness * 2 ** (octaves / voice.stiffnessOctaves);
  const steepness = Math.max(0.35, slope.soft + (slope.hard - slope.soft) * velocity ** 1.4 - slope.bass * Math.max(0, -octaves));
  const scale = 2 ** (-voice.keyRing * octaves - (HIGH_RING * Math.max(0, pitch - HIGH_PITCH)) / 12);
  const shares = [1 - ring.afterShare, ring.afterShare];
  const taus = [ring.prompt * scale, ring.after * scale];
  const levels: number[] = [];
  const frequencies: number[] = [];
  let energy = 0;
  for (let k = 1; k <= voice.partials; k++) {
    const partial = k * hz * Math.sqrt(1 + stiffness * k * k);
    if (partial > 0.42 * sampleRate) break;
    const strike = voice.strikeAt === 0 ? 1 : 0.25 + 0.75 * Math.abs(Math.sin(Math.PI * k * voice.strikeAt));
    const body = 1 / Math.sqrt(1 + (voice.bodyHz / partial) ** 4);
    const top = 1 / (1 + (partial / (voice.topHz * (0.45 + 0.55 * velocity))) ** 2);
    const level = strike * body * top * k ** -steepness;
    levels.push(level);
    frequencies.push(partial);
    energy += level * level;
  }
  // The top dies fast, so it is lifted to be heard as loud as the middle.
  const size = 10 ** ((voice.evenness * octaves + (HIGH_LIFT * Math.max(0, pitch - HIGH_PITCH)) / 12) / 20);
  const gain = (voice.output * size) / Math.sqrt(energy);

  // Nothing runs past the last partial's silence, however long the note is held.
  const lasts = Math.min(seconds, taus[1] * Math.log(1 / SILENT));
  work.notes++;
  const left = new Float32Array(Math.ceil(lasts * sampleRate));
  const right = new Float32Array(left.length);
  const roll = random(pitch * 53 + Math.round(velocity * 8) * 7 + 1);
  const cents = voice.unison * CENT;
  levels.forEach((level, index) => {
    const partial = frequencies[index];
    const place = (roll() * 2 - 1) * voice.width;
    const damping = 1 + voice.topDamp * (partial / 1000) ** 1.3 + 0.05 * index;
    // One phase for both strings: apart, they would cancel at the strike.
    const phase = roll() * TAU;
    for (let stage = 0; stage < 2; stage++) {
      const apart = stage === 0 ? 1 + cents : 1 - cents;
      const amplitude = level * shares[stage] * gain;
      if (amplitude < SILENT * 0.05) continue;
      work.oscillatorSamples += addPartial(left, right, partial * apart, amplitude, taus[stage] / damping, phase, place * (stage === 0 ? 1 : -0.6), sampleRate);
    }
  });

  for (const mode of THUMP_MODES) {
    const amplitude = voice.thump * mode.level * velocity * velocity * gain * Math.max(0.25, 1 - 0.25 * Math.max(0, octaves));
    if (amplitude > SILENT) work.oscillatorSamples += addPartial(left, right, mode.hz * (1 + 0.04 * octaves), amplitude, mode.time, 0.3, 0, sampleRate);
  }

  const hammer = random(pitch * 19 + 5);
  const count = Math.min(left.length, Math.round(voice.hammer.time * 6 * sampleRate));
  const smooth = 1 - Math.exp((-TAU * voice.hammer.hz * (0.5 + velocity)) / sampleRate);
  let lowLeft = 0;
  let lowRight = 0;
  const strength = voice.hammer.level * velocity * velocity * voice.output;
  for (let i = 0; i < count; i++) {
    const fall = strength * Math.exp(-i / sampleRate / voice.hammer.time);
    lowLeft += smooth * (hammer() * 2 - 1 - lowLeft);
    lowRight += smooth * (hammer() * 2 - 1 - lowRight);
    left[i] += lowLeft * fall;
    right[i] += lowRight * fall;
  }

  if (voice.bark !== undefined) {
    const drive = 1 + voice.bark * velocity * velocity;
    for (let i = 0; i < left.length; i++) {
      left[i] = barked(left[i], drive);
      right[i] = barked(right[i], drive);
    }
  }

  const attack = Math.min(left.length, Math.round((voice.attack.soft + (voice.attack.hard - voice.attack.soft) * velocity) * sampleRate));
  for (let i = 0; i < attack; i++) {
    const rise = i / attack;
    left[i] *= rise * rise;
    right[i] *= rise * rise;
  }
  return { left, right };
}
