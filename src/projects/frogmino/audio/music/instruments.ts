import { Shape } from "../sounds";
import type { Instrument } from "./song";

// The themes' shared instruments, in the sound effects' soft retro palette:
// sine and triangle waves, most through a low-pass, a little brighter than
// the effects since music sits behind them. ZzFX's randomness stays off (its
// default), so every note is in tune.

// A plucky triangle lead that settles to a soft hold.
export const LEAD: Instrument = {
  name: "Lead",
  base: "B4",
  zzfx: {
    volume: 0.75,
    attack: 0.005,
    decay: 0.06,
    sustain: 0.14,
    sustainVolume: 0.55,
    release: 0.12,
    shape: Shape.triangle,
    filter: -3200,
  },
};

// A rounder sine lead, for a second voice beside the first.
export const SINE_LEAD: Instrument = {
  name: "Sine lead",
  base: "B4",
  zzfx: { volume: 0.8, attack: 0.01, decay: 0.08, sustain: 0.14, sustainVolume: 0.6, release: 0.14 },
};

// A short, low triangle bass, for oom-pah and octave pumping.
export const BASS: Instrument = {
  name: "Bass",
  base: "B2",
  zzfx: {
    volume: 1,
    attack: 0.005,
    decay: 0.05,
    sustain: 0.08,
    sustainVolume: 0.6,
    release: 0.08,
    shape: Shape.triangle,
    filter: -1200,
  },
};

// Quiet sine chord tones, short like a strummed "pah".
export const PAD: Instrument = {
  name: "Pad",
  base: "B4",
  zzfx: { volume: 0.4, attack: 0.01, decay: 0.08, sustain: 0.1, sustainVolume: 0.45, release: 0.15 },
};

// A soft, dull hi-hat tick: filtered noise.
export const TICK: Instrument = {
  name: "Tick",
  base: "B5",
  zzfx: { volume: 0.12, release: 0.03, shape: Shape.noise, filter: -5000 },
};

// A soft kick: a low sine thump falling in pitch.
export const THUMP: Instrument = {
  name: "Thump",
  base: "A2",
  zzfx: { volume: 0.7, decay: 0.03, sustain: 0.02, sustainVolume: 0.5, release: 0.08, slide: -0.6 },
};

// A glassy sine bell with a short echo, for sparkles.
export const BELL: Instrument = {
  name: "Bell",
  base: "B5",
  zzfx: { volume: 0.4, attack: 0.003, decay: 0.1, sustainVolume: 0.3, sustain: 0.1, release: 0.35, delay: 0.06 },
};
