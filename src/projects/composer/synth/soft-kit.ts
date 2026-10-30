import type { AnalogWork, StereoNote } from "./analog";

// A small soft drum kit, synthesised at the full rate: a sine falling into its
// pitch and a little noise between a low and a high cut, by General MIDI's drum
// notes. Cymbals are puffs of dark noise, so nothing here has metal in it.

export interface SoftKitVoice {
  kind: "soft-kit";
  release: number;
  dynamics: number;
  output: number;
}

interface SoftHit {
  tone?: { hz: number; sweep: number; sweepTime: number; decay: number; level: number };
  noise?: { decay: number; level: number; fromHz: number; toHz: number };
}

// The tone is pushed through a soft curve, which gives a low drum the harmonics
// a small speaker needs to play it at all.
const BODY_DRIVE = 1.8;
const ATTACK_SECONDS = 0.0015;
const DECAYS_TO_SILENCE = 6;
const LONGEST_SECONDS = 2.5;

const kick: SoftHit = { tone: { hz: 56, sweep: 130, sweepTime: 0.02, decay: 0.13, level: 1 }, noise: { decay: 0.005, level: 0.16, fromHz: 300, toHz: 2400 } };
const snare: SoftHit = { tone: { hz: 185, sweep: 60, sweepTime: 0.014, decay: 0.07, level: 0.62 }, noise: { decay: 0.085, level: 0.62, fromHz: 900, toHz: 4800 } };
const sideStick: SoftHit = { noise: { decay: 0.016, level: 0.55, fromHz: 1000, toHz: 4000 } };
const closedHat: SoftHit = { noise: { decay: 0.017, level: 0.3, fromHz: 3200, toHz: 5800 } };
const openHat: SoftHit = { noise: { decay: 0.09, level: 0.24, fromHz: 3000, toHz: 5400 } };
const crash: SoftHit = { noise: { decay: 0.5, level: 0.3, fromHz: 1400, toHz: 4600 } };
const ride: SoftHit = { noise: { decay: 0.2, level: 0.17, fromHz: 2200, toHz: 5000 } };

function tom(hz: number): SoftHit {
  return { tone: { hz, sweep: hz * 0.7, sweepTime: 0.03, decay: 0.15, level: 0.85 }, noise: { decay: 0.008, level: 0.12, fromHz: 300, toHz: 2400 } };
}

// General MIDI's drum notes; anything else is the closed hat.
const KIT = new Map<number, SoftHit>([
  [35, kick], [36, kick],
  [37, sideStick],
  [38, snare], [39, snare], [40, snare],
  [41, tom(75)], [43, tom(95)], [45, tom(120)], [47, tom(145)], [48, tom(175)], [50, tom(205)],
  [42, closedHat], [44, closedHat], [46, openHat],
  [49, crash], [52, crash], [55, crash], [57, crash],
  [51, ride], [53, ride], [59, ride],
]);

function onePoleStep(hz: number, sampleRate: number): number {
  return 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
}

export function renderSoftKitHit(voice: SoftKitVoice, pitch: number, velocity: number, sampleRate: number, work: AnalogWork): StereoNote {
  const { tone, noise } = KIT.get(pitch) ?? closedHat;
  const longest = Math.max(tone?.decay ?? 0, noise?.decay ?? 0);
  const out = new Float32Array(Math.round(Math.min(LONGEST_SECONDS, longest * DECAYS_TO_SILENCE) * sampleRate));
  work.notes++;
  work.oscillatorSamples += out.length;
  const attack = ATTACK_SECONDS * sampleRate;
  // A soft hit is duller: its noise's top comes down.
  const top = onePoleStep((noise?.toHz ?? 0) * (0.55 + 0.45 * velocity), sampleRate);
  const under = onePoleStep(noise?.fromHz ?? 0, sampleRate);
  let state = (pitch * 2654435761) >>> 0 || 1;
  let phase = 0;
  let low = 0;
  let lowest = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    let value = 0;
    if (tone !== undefined) {
      phase += (tone.hz + tone.sweep * Math.exp(-t / tone.sweepTime)) / sampleRate;
      value += Math.tanh(BODY_DRIVE * Math.sin(2 * Math.PI * phase)) * tone.level * Math.exp(-t / tone.decay);
    }
    if (noise !== undefined) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      low += top * (state / 2147483648 - 1 - low);
      lowest += under * (low - lowest);
      value += (low - lowest) * noise.level * Math.exp(-t / noise.decay);
    }
    out[i] = value * Math.min(1, i / attack) * voice.output;
  }
  return { left: out, right: out };
}
