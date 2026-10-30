import type { AnalogWork, StereoNote } from "./analog";

// 16-bit FM: a Sega Genesis in plain arithmetic. It doesn't pretend to be any
// instrument, it owns being a synth. A voice is the Yamaha YM2612's own
// registers, so a new sound is data in the chip's vocabulary (`library.ts`), and
// any patch written for the real chip translates by copying its numbers.
//
// What is modelled, since the chip's character is these details: four
// operators in its eight algorithms, a 10-bit sine lookup with no
// interpolation, its stepped envelope clock, operator 1's feedback, carriers
// that clip when they sum past full scale, a 9-bit DAC with its crossover step
// (the "ladder effect"), and the console's analog low-pass. Not modelled: the
// six-channel limit, since a score may stack more, and key-off, since the
// mixer owns a note's end (see `band.ts`).

export interface Operator {
  // Frequency multiple, 0 to 15; 0 means one half.
  mul: number;
  // Detune, -3 to 3: a fine offset that grows with pitch.
  dt: number;
  // Total level, 0 to 127: attenuation in 0.75 dB steps. On a carrier this is
  // loudness; on a modulator, brightness (each -8 is 6 dB, twice the bend).
  tl: number;
  // Attack rate, 0 to 31; 31 is instant.
  ar: number;
  // First decay rate, 0 to 31, which runs down to the sustain level.
  d1r: number;
  // Sustain level, 0 to 15, in 3 dB steps below the peak.
  d1l: number;
  // Second decay rate, 0 to 31, which runs on from there.
  d2r: number;
  // Rate scaling, 0 to 3: how much faster the envelope runs on high notes.
  ks: number;
  // Velocity: how many TL steps softer this operator is at the softest touch.
  // On a modulator this is what makes a hard note brighter, not just louder.
  vel: number;
}

export interface FmVoice {
  kind: "fm";
  // The chip's algorithm, 0 to 7: how the operators connect.
  algorithm: number;
  // Operator 1's feedback into itself, 0 to 7: 5 is a saw, 7 is noise.
  feedback: number;
  operators: readonly [Operator, Operator, Operator, Operator];
  // The fade after the key lets go, in seconds.
  release: number;
  vibrato?: { hz: number; cents: number; delay: number };
  // How strongly velocity sets loudness: the mixer's exponent.
  dynamics: number;
  output: number;
}

// The console's drum samples, by General MIDI's drum notes.
export interface KitVoice {
  kind: "kit";
  release: number;
  dynamics: number;
  output: number;
}

// One sound of the kit: a sample as it would be stored in the console's ROM,
// at a low rate and few bits, played by the sixth FM channel in DAC mode. Tone
// sweeps from `hz + sweep` to `hz`; noise is the PSG's shift register.
export interface DrumSound {
  rate: number;
  bits: number;
  tone?: { hz: number; sweep: number; sweepTime: number; decay: number; level: number };
  noise?: { decay: number; level: number };
}

// Which operators bend each operator, and which are heard. Operators are in
// the chip's diagram order: operator 1 is index 0.
const ALGORITHMS: readonly { into: readonly (readonly number[])[]; heard: readonly number[] }[] = [
  { into: [[], [0], [1], [2]], heard: [3] }, // 1 > 2 > 3 > 4
  { into: [[], [], [0, 1], [2]], heard: [3] }, // (1 + 2) > 3 > 4
  { into: [[], [], [1], [0, 2]], heard: [3] }, // (1 + (2 > 3)) > 4
  { into: [[], [0], [], [1, 2]], heard: [3] }, // ((1 > 2) + 3) > 4
  { into: [[], [0], [], [2]], heard: [1, 3] }, // (1 > 2) + (3 > 4)
  { into: [[], [0], [0], [0]], heard: [1, 2, 3] }, // 1 > (2 + 3 + 4)
  { into: [[], [0], [], []], heard: [1, 2, 3] }, // (1 > 2) + 3 + 4
  { into: [[], [], [], []], heard: [0, 1, 2, 3] }, // 1 + 2 + 3 + 4
];

const CHIP_RATE = 53267;
// The envelopes advance once every three of the chip's samples.
const ENVELOPE_RATE = CHIP_RATE / 3;
// The detune table's unit, in Hz.
const DETUNE_UNIT = CHIP_RATE / 2 ** 20;
const PHASES = 1024;
const SILENT = 1023;
// A full-scale modulator bends the phase by four whole cycles.
const MODULATION = 4 * PHASES;
// The Model 1 DAC's crossover step: about 4 units of its 9 bits, either side
// of zero. Quiet tails become a little square buzz.
const LADDER = 4 / 256;
// The console's analog output filter. The Model 1's is lower than this; here
// it keeps the digital edge while taking off the harshest aliasing.
const OUTPUT_HZ = 7000;
const TAIL_SECONDS = 0.005;
// A low note's fundamental is below what most speakers can play, so what is
// heard is its harmonics. Modulators open as the pitch falls, in total level
// units, or a low note is a sine nobody can hear on a laptop.
const OPEN_BELOW = 60;
const OPEN_PER_SEMITONE = 0.4;

const SINE = Float64Array.from({ length: PHASES }, (_, i) => Math.sin(((i + 0.5) * 2 * Math.PI) / PHASES));
// Envelope attenuation runs in 1024 steps of 0.094 dB.
const GAIN = Float64Array.from({ length: SILENT + 1 }, (_, i) => (i === SILENT ? 0 : 2 ** (-i / 64)));

// How far each envelope tick moves, by the rate's low two bits and the tick's
// place in an eight-step cycle, from the chip's own table.
const SLOW_STEPS = [
  [0, 1, 0, 1, 0, 1, 0, 1],
  [0, 1, 0, 1, 1, 1, 0, 1],
  [0, 1, 1, 1, 0, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1],
];
const FAST_STEPS = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 2, 1, 1, 1, 2],
  [1, 2, 1, 2, 1, 2, 1, 2],
  [1, 2, 2, 2, 1, 2, 2, 2],
];

// The chip's detune table by magnitude and key code.
const DETUNE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 8, 8],
  [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14, 16, 16, 16, 16],
  [2, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20, 22, 22, 22, 22],
];

const ATTACK = 0;
const DECAY = 1;
const SUSTAIN = 2;

function frequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

// The chip's key code: four to the octave, from its lowest block.
function keyCode(hz: number): number {
  return Math.max(0, Math.min(31, Math.floor(4 * Math.log2(hz / 26))));
}

function envelopeRate(rate: number, code: number, ks: number): number {
  return rate === 0 ? 0 : Math.min(63, 2 * rate + (code >> (3 - ks)));
}

class LiveOperator {
  private stage = ATTACK;
  private level = SILENT;
  private phase = 0;
  private readonly rates: readonly number[];
  private readonly sustain: number;
  private readonly attenuation: number;
  private readonly step: number;

  constructor(operator: Operator, hz: number, code: number, velocity: number, opened: number, sampleRate: number) {
    this.rates = [operator.ar, operator.d1r, operator.d2r].map((rate) => envelopeRate(rate, code, operator.ks));
    this.sustain = operator.d1l === 15 ? SILENT : operator.d1l * 32;
    this.attenuation = Math.round(Math.max(0, operator.tl + operator.vel * (1 - velocity) - opened) * 8);
    const detune = DETUNE[Math.abs(operator.dt)][code] * DETUNE_UNIT * Math.sign(operator.dt);
    this.step = ((hz + detune) * (operator.mul === 0 ? 0.5 : operator.mul) * PHASES) / sampleRate;
  }

  tick(clock: number): void {
    const rate = this.rates[this.stage];
    if (rate < 2) return;
    const shift = Math.max(0, 11 - (rate >> 2));
    if ((clock & ((1 << shift) - 1)) !== 0) return;
    const slot = (clock >> shift) & 7;
    const move = rate < 48 ? SLOW_STEPS[rate & 3][slot] : rate >= 60 ? 8 : FAST_STEPS[rate & 3][slot] << ((rate >> 2) - 12);
    if (this.stage === ATTACK) {
      this.level = rate >= 62 ? 0 : this.level + ((~this.level * move) >> 4);
      if (this.level <= 0) {
        this.level = 0;
        this.stage = DECAY;
      }
      return;
    }
    this.level = Math.min(SILENT, this.level + move);
    if (this.stage === DECAY && this.level >= this.sustain) this.stage = SUSTAIN;
  }

  output(bend: number, modulation: number): number {
    this.phase = (this.phase + this.step * bend) % PHASES;
    return SINE[(this.phase + modulation) & (PHASES - 1)] * GAIN[Math.min(SILENT, this.level + this.attenuation)];
  }

  get finished(): boolean {
    return this.stage !== ATTACK && this.level + this.attenuation >= SILENT;
  }
}

function dac(value: number, bits: number): number {
  const steps = 2 ** (bits - 1);
  const code = Math.round(Math.max(-1, Math.min(1, value)) * steps);
  return code === 0 ? 0 : code / steps + Math.sign(code) * LADDER;
}

// The console's output: its low-pass, and a short fade so a note that runs out
// of samples while held doesn't click.
function analogOutput(out: Float32Array, sampleRate: number): void {
  const a = 1 - Math.exp((-2 * Math.PI * OUTPUT_HZ) / sampleRate);
  let low = 0;
  for (let i = 0; i < out.length; i++) {
    low += a * (out[i] - low);
    out[i] = low;
  }
  const tail = Math.min(out.length, Math.round(TAIL_SECONDS * sampleRate));
  for (let i = 0; i < tail; i++) out[out.length - 1 - i] *= i / tail;
}

const STILL = { hz: 0, cents: 0, delay: 0 };
// Vibrato moves in steps, as the chip's LFO does, this many samples apart.
const VIBRATO_STEP = 128;

export function renderFm(voice: FmVoice, pitch: number, velocity: number, seconds: number, sampleRate: number, work: AnalogWork): StereoNote {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  work.notes++;
  work.oscillatorSamples += out.length * voice.operators.length;
  const hz = frequency(pitch);
  const code = keyCode(hz);
  const { into, heard } = ALGORITHMS[voice.algorithm];
  const opened = Math.max(0, OPEN_BELOW - pitch) * OPEN_PER_SEMITONE;
  const operators = voice.operators.map((operator, index) => new LiveOperator(operator, hz, code, velocity, heard.includes(index) ? 0 : opened, sampleRate));
  const feedback = voice.feedback === 0 ? 0 : PHASES * 2 ** (voice.feedback - 7);
  const vibrato = voice.vibrato ?? STILL;
  const outputs = [0, 0, 0, 0];
  let before = 0;
  let earlier = 0;
  let bend = 1;
  let clock = 0;
  let ticks = 0;
  for (let i = 0; i < out.length; i++) {
    ticks += ENVELOPE_RATE / sampleRate;
    while (ticks >= 1) {
      ticks -= 1;
      clock++;
      for (const operator of operators) operator.tick(clock);
    }
    if (i % VIBRATO_STEP === 0) {
      const t = i / sampleRate;
      const depth = vibrato.cents * Math.min(1, Math.max(0, t / Math.max(vibrato.delay, 0.001) - 1));
      bend = 2 ** ((depth * Math.sin(2 * Math.PI * vibrato.hz * t)) / 1200);
      if (heard.every((index) => operators[index].finished)) break;
    }
    let sum = 0;
    outputs[0] = operators[0].output(bend, (before + earlier) * feedback);
    earlier = before;
    before = outputs[0];
    for (let index = 1; index < 4; index++) {
      let modulation = 0;
      for (const source of into[index]) modulation += outputs[source];
      outputs[index] = operators[index].output(bend, modulation * MODULATION);
    }
    for (const index of heard) sum += outputs[index];
    out[i] = dac(sum, 9);
  }
  analogOutput(out, sampleRate);
  for (let i = 0; i < out.length; i++) out[i] *= voice.output;
  return { left: out, right: out };
}

// The PSG's 16-bit noise register, one bit out at a time.
function shiftRegister(): () => number {
  let state = 0x8000;
  return () => {
    const bit = (state ^ (state >> 3)) & 1;
    state = (state >> 1) | (bit << 15);
    return bit === 1 ? 1 : -1;
  };
}

const DRUM_SECONDS = 1.5;
// By then an exponential decay is down 60 dB.
const DECAYS_TO_SILENCE = 7;

function renderDrum(sound: DrumSound, velocity: number, output: number, sampleRate: number): StereoNote {
  const { tone, noise } = sound;
  const longest = Math.max(tone?.decay ?? 0, noise?.decay ?? 0);
  const out = new Float32Array(Math.round(Math.min(DRUM_SECONDS, longest * DECAYS_TO_SILENCE) * sampleRate));
  // A soft hit is duller: a lower rate, and less of the noise's edge.
  const rate = sound.rate * (0.6 + 0.4 * velocity);
  const hiss = shiftRegister();
  const edge = 0.4 + 0.6 * velocity;
  let phase = 0;
  let held = 0;
  let next = 0;
  for (let i = 0; i < out.length; i++) {
    if (i >= next) {
      next += sampleRate / rate;
      const t = i / sampleRate;
      let value = 0;
      if (tone !== undefined) {
        phase += (tone.hz + tone.sweep * Math.exp(-t / tone.sweepTime)) / rate;
        value += Math.sin(2 * Math.PI * phase) * tone.level * Math.exp(-t / tone.decay);
      }
      if (noise !== undefined) value += hiss() * noise.level * edge * Math.exp(-t / noise.decay);
      held = dac(value, sound.bits);
    }
    out[i] = held;
  }
  analogOutput(out, sampleRate);
  for (let i = 0; i < out.length; i++) out[i] *= output;
  return { left: out, right: out };
}

const kick: DrumSound = { rate: 11025, bits: 8, tone: { hz: 52, sweep: 190, sweepTime: 0.022, decay: 0.12, level: 1.7 }, noise: { decay: 0.006, level: 0.5 } };
const snare: DrumSound = { rate: 11025, bits: 8, tone: { hz: 180, sweep: 90, sweepTime: 0.015, decay: 0.06, level: 0.9 }, noise: { decay: 0.1, level: 0.95 } };
const closedHat: DrumSound = { rate: 16000, bits: 4, noise: { decay: 0.018, level: 0.5 } };
const openHat: DrumSound = { rate: 16000, bits: 4, noise: { decay: 0.11, level: 0.45 } };
const crash: DrumSound = { rate: 12000, bits: 5, noise: { decay: 0.3, level: 0.6 } };
const ride: DrumSound = { rate: 16000, bits: 5, tone: { hz: 2600, sweep: 0, sweepTime: 1, decay: 0.2, level: 0.12 }, noise: { decay: 0.14, level: 0.25 } };

function tom(hz: number): DrumSound {
  return { rate: 11025, bits: 8, tone: { hz, sweep: hz * 1.2, sweepTime: 0.03, decay: 0.15, level: 1.2 }, noise: { decay: 0.01, level: 0.3 } };
}

// General MIDI's drum notes; anything else is the closed hat.
const KIT = new Map<number, DrumSound>([
  [35, kick], [36, kick],
  [37, { ...snare, tone: undefined, noise: { decay: 0.015, level: 0.8 } }],
  [38, snare], [39, snare], [40, snare],
  [41, tom(70)], [43, tom(90)], [45, tom(115)], [47, tom(140)], [48, tom(170)], [50, tom(200)],
  [42, closedHat], [44, closedHat], [46, openHat],
  [49, crash], [52, crash], [55, crash], [57, crash],
  [51, ride], [53, ride], [59, ride],
]);

export function renderKitHit(voice: KitVoice, pitch: number, velocity: number, sampleRate: number, work: AnalogWork): StereoNote {
  work.notes++;
  return renderDrum(KIT.get(pitch) ?? closedHat, velocity, voice.output, sampleRate);
}
