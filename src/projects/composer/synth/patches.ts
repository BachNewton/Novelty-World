import { Shape, zzfxParams, type ZzfxSound } from "@/shared/lib/sound";
import { HAT, KICK, SNARE } from "../types";

// Instruments as code: each renders one note to samples, in plain arithmetic,
// so a render is the same everywhere and works without a browser. A note is
// rendered once at its pitch and strength, long enough for any note, and the
// mixer cuts it to length with the patch's release (see `render.ts`).

export interface RenderContext {
  sampleRate: number;
  // ZzFX's sample builder, passed in since ZzFX needs a stand-in off the page.
  build: (params: number[]) => ArrayLike<number>;
}

export interface Patch {
  name: string;
  // How long a note's samples run, in seconds.
  seconds: number;
  // The fade after a note lets go, in seconds.
  release: number;
  render(pitch: number, velocity: number, context: RenderContext): Float32Array;
}

const TAU = 2 * Math.PI;

function frequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

// Noise that is the same every render.
function noise(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 2147483648 - 1;
  };
}

// Ramps the first samples up, so a note never starts with a click.
function fadeIn(samples: Float32Array, seconds: number, sampleRate: number): void {
  const length = Math.min(samples.length, Math.round(seconds * sampleRate));
  for (let i = 0; i < length; i++) samples[i] *= i / length;
}

// A damped sine, added on: a two-pole resonator, far cheaper than Math.sin
// per sample, with its decay built in.
function addResonator(out: Float32Array, hz: number, amplitude: number, tau: number, sampleRate: number): void {
  const r = Math.exp(-1 / (tau * sampleRate));
  const w = (TAU * hz) / sampleRate;
  const c1 = 2 * r * Math.cos(w);
  const c2 = -r * r;
  let y1 = amplitude * Math.sin(w) * r;
  let y2 = 0;
  for (let i = 1; i < out.length; i++) {
    out[i] += y1;
    const y = c1 * y1 + c2 * y2;
    y2 = y1;
    y1 = y;
  }
}

// An additive piano: stretched partials (a real string's stiffness sharpens
// its overtones), each pair of resonators slightly apart for a string's slow
// beating, a fast decay then a long one, and the hammer's thump. A harder
// strike has more upper partials, which is most of what loud sounds like.
export const piano: Patch = {
  name: "Piano",
  seconds: 5,
  release: 0.12,
  render(pitch, velocity, { sampleRate }) {
    const out = new Float32Array(Math.round(this.seconds * sampleRate));
    const f = frequency(pitch);
    const stiffness = 0.00006 * 2 ** ((pitch - 48) / 18);
    const count = Math.min(26, Math.floor((0.45 * sampleRate) / f));
    const roll = 2.5 - 1.25 * velocity;
    const sustain = 4.2 * (130 / f) ** 0.45;
    for (let k = 1; k <= count; k++) {
      const hz = k * f * Math.sqrt(1 + stiffness * k * k);
      // A hammer strikes an eighth of the way along, which thins the 8th.
      const strike = 0.35 + 0.65 * Math.abs(Math.sin((Math.PI * k) / 8));
      const amplitude = (strike * (0.9 * k ** -roll)) / Math.sqrt(1 + (hz / 5000) ** 2);
      const tau = sustain / (1 + 0.3 * k);
      addResonator(out, hz * 1.00025, amplitude * 0.6, tau * 0.24, sampleRate);
      addResonator(out, hz * 0.99985, amplitude * 0.4, tau, sampleRate);
    }
    const hammer = noise(pitch + 1);
    const thump = Math.round(0.012 * sampleRate);
    for (let i = 0; i < thump; i++) out[i] += hammer() * 0.05 * velocity * (1 - i / thump);
    fadeIn(out, 0.002 + 0.004 * (1 - velocity), sampleRate);
    return out;
  },
};

// A plucked string by Karplus-Strong: a burst of noise goes round a delay the
// length of the string's period, and a little averaging each time round is
// the string losing its top first.
export const harp: Patch = {
  name: "Harp",
  seconds: 4,
  release: 0.15,
  render(pitch, velocity, { sampleRate }) {
    const out = new Float32Array(Math.round(this.seconds * sampleRate));
    const period = sampleRate / frequency(pitch) - 0.5;
    const size = Math.floor(period);
    const fraction = period - size;
    const line = new Float32Array(size + 1);
    const burst = noise(pitch + 7);
    let previous = 0;
    const pick = 0.45 + 0.45 * velocity;
    for (let i = 0; i < line.length; i++) {
      previous += pick * (burst() - previous);
      line[i] = previous;
    }
    const damping = Math.min(0.9985, 0.9965 + (60 - pitch) * 0.00005);
    let index = 0;
    let last = 0;
    for (let i = 0; i < out.length; i++) {
      const next = (index + 1) % line.length;
      const value = line[index] * (1 - fraction) + line[next] * fraction;
      const filtered = damping * (0.5 * value + 0.5 * last);
      last = value;
      line[index] = filtered;
      out[i] = value;
      index = next;
    }
    fadeIn(out, 0.001, sampleRate);
    return out;
  },
};

// A saw with its worst aliasing smoothed off at each jump (PolyBLEP).
function saw(phase: number, step: number): number {
  let value = 2 * phase - 1;
  if (phase < step) {
    const t = phase / step;
    value -= t + t - t * t - 1;
  } else if (phase > 1 - step) {
    const t = (phase - 1) / step;
    value -= t * t + t + t + 1;
  }
  return value;
}

// Bowed strings: three detuned saws through a filter, the bow's slow attack,
// and a vibrato that arrives after the note has settled.
function bowed(name: string, bright: number, attack: number): Patch {
  return {
    name,
    seconds: 7,
    release: 0.28,
    render(pitch, velocity, { sampleRate }) {
      const out = new Float32Array(Math.round(this.seconds * sampleRate));
      const f = frequency(pitch);
      const phases = [0.1, 0.45, 0.8];
      const detune = [0.998, 1, 1.0023];
      const a = 1 - Math.exp((-TAU * Math.min(0.4 * sampleRate, bright * (0.7 + 0.8 * velocity) + 2 * f)) / sampleRate);
      let low1 = 0;
      let low2 = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / sampleRate;
        const depth = 0.004 * Math.min(1, Math.max(0, (t - 0.25) / 0.5));
        const vibrato = 1 + depth * Math.sin(TAU * 5.3 * t);
        let sample = 0;
        for (let v = 0; v < 3; v++) {
          const step = (f * detune[v] * vibrato) / sampleRate;
          phases[v] = (phases[v] + step) % 1;
          sample += saw(phases[v], step);
        }
        low1 += a * (sample - low1);
        low2 += a * (low1 - low2);
        out[i] = low2 * 0.3 * Math.min(1, t / attack);
      }
      return out;
    },
  };
}

export const strings = bowed("Strings", 1900, 0.16);
export const cello = bowed("Cello", 1100, 0.07);

// A flute: nearly a sine, a little second and third harmonic, and the breath
// that is most of why it doesn't sound like a test tone.
export const flute: Patch = {
  name: "Flute",
  seconds: 6,
  release: 0.09,
  render(pitch, velocity, { sampleRate }) {
    const out = new Float32Array(Math.round(this.seconds * sampleRate));
    const f = frequency(pitch);
    const breath = noise(pitch + 3);
    let phase = 0;
    let air = 0;
    let airLow = 0;
    const blow = 0.65 + 0.35 * velocity;
    for (let i = 0; i < out.length; i++) {
      const t = i / sampleRate;
      const depth = 0.0035 * Math.min(1, Math.max(0, (t - 0.18) / 0.4));
      phase += (f * (1 + depth * Math.sin(TAU * 5 * t))) / sampleRate;
      const tone = Math.sin(TAU * phase) + 0.22 * blow * Math.sin(2 * TAU * phase) + 0.07 * blow * Math.sin(3 * TAU * phase);
      // Band-limited breath, by the difference of two low-passes.
      const raw = breath();
      air += 0.28 * (raw - air);
      airLow += 0.04 * (raw - airLow);
      const chiff = 0.03 + 0.1 * Math.exp(-t / 0.03);
      out[i] = (tone * 0.42 + (air - airLow) * chiff) * Math.min(1, t / 0.035);
    }
    return out;
  },
};

// Frequency modulation: one sine bends the phase of another, and how hard it
// bends, falling over the note, is the note going from bright to mellow.
function fm(name: string, options: { ratio: number; index: number; indexDecay: number; decay: number; tine?: number; attack?: number; seconds?: number }): Patch {
  const { ratio, index, indexDecay, decay, tine = 0, attack = 0.002, seconds = 4 } = options;
  return {
    name,
    seconds,
    release: 0.14,
    render(pitch, velocity, { sampleRate }) {
      const out = new Float32Array(Math.round(this.seconds * sampleRate));
      const f = frequency(pitch);
      const strength = index * (0.45 + 0.75 * velocity);
      for (let i = 0; i < out.length; i++) {
        const t = i / sampleRate;
        const mod = strength * Math.exp(-t / indexDecay) * Math.sin(TAU * f * ratio * t);
        const body = Math.sin(TAU * f * t + mod);
        const bell = tine === 0 ? 0 : tine * velocity * Math.exp(-t / 0.09) * Math.sin(TAU * f * 14 * t + Math.sin(TAU * f * t));
        out[i] = (body + bell) * 0.5 * Math.exp(-t / decay) * Math.min(1, t / attack);
      }
      return out;
    },
  };
}

export const electricPiano = fm("Electric piano", { ratio: 1, index: 1.5, indexDecay: 0.5, decay: 1.8, tine: 0.32 });
export const bell = fm("Bell", { ratio: 3.51, index: 2.2, indexDecay: 0.8, decay: 1.6, attack: 0.001 });
export const fmBass = fm("FM bass", { ratio: 1, index: 2.4, indexDecay: 0.16, decay: 1.5 });
export const fmPad = fm("FM pad", { ratio: 2, index: 0.8, indexDecay: 3, decay: 6, attack: 0.3, seconds: 7 });

function chip(name: string, sound: ZzfxSound, seconds: number): Patch {
  return {
    name,
    seconds,
    release: 0.03,
    render(pitch, _velocity, { build }) {
      return Float32Array.from(build(zzfxParams({ ...sound, frequency: frequency(pitch) })));
    },
  };
}

export const chipPulse = chip("Pulse", { shape: Shape.square, shapeCurve: 0.5, attack: 0.004, sustain: 3, release: 0.05, sustainVolume: 0.6, decay: 0.06, filter: -3500, volume: 0.32 }, 3.1);
export const chipSoft = chip("Soft pulse", { shape: Shape.square, shapeCurve: 0.3, attack: 0.004, sustain: 3, release: 0.05, sustainVolume: 0.45, decay: 0.1, filter: -2400, volume: 0.22 }, 3.1);
export const chipTriangle = chip("Triangle", { shape: Shape.triangle, attack: 0.003, sustain: 3, release: 0.03, volume: 0.65 }, 3);

// A small drum kit, the same one for every performer but the chip's: General
// MIDI's kick, snare and hat, anything else a hat.
export const drums: Patch = {
  name: "Drums",
  seconds: 0.6,
  release: 0.6,
  render(pitch, velocity, { sampleRate }) {
    const out = new Float32Array(Math.round(this.seconds * sampleRate));
    const hiss = noise(pitch);
    let phase = 0;
    let low = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / sampleRate;
      const raw = hiss();
      if (pitch === KICK) {
        phase += (48 + 130 * Math.exp(-t / 0.035)) / sampleRate;
        out[i] = Math.sin(TAU * phase) * Math.exp(-t / 0.13) * 0.95;
      } else if (pitch === SNARE) {
        phase += 190 / sampleRate;
        low += 0.5 * (raw - low);
        out[i] = Math.sin(TAU * phase) * Math.exp(-t / 0.05) * 0.35 + low * Math.exp(-t / 0.08) * 0.42;
      } else {
        low += 0.5 * (raw - low);
        out[i] = (raw - low) * Math.exp(-t / (pitch === HAT ? 0.022 : 0.08)) * 0.32;
      }
    }
    for (let i = 0; i < out.length; i++) out[i] *= 0.55 + 0.45 * velocity;
    fadeIn(out, 0.0008, sampleRate);
    return out;
  },
};
