import { Shape } from "@/shared/lib/sound";
import type { Instrument } from "./song";

// The themes' shared instrument palette, as ZzFX sounds tuned to a base
// pitch. Soft by default, as the sound effects are: sine and triangle waves,
// mostly through a low-pass (a negative filter). The brighter colours (the
// pulse, the fiddle, the kazoo) are kept quiet and low-passed so they sing
// rather than beep. A note plays from eleven semitones below the base to two
// octaves above it. Drums play at their base pitch (`x` in a line), or a
// note's name with a fraction for a lighter hit.

// Pitched voices.

// A Game Boy pulse lead: a square at a quarter duty, held.
export const PULSE: Instrument = {
  name: "Pulse",
  base: "C5",
  zzfx: { volume: 0.32, attack: 0.008, decay: 0.1, sustainVolume: 0.7, sustain: 1.6, release: 0.06, shape: Shape.square, shapeCurve: 0.5, filter: -2600 },
};

// The pulse at an eighth duty, thinner and plucked short: the bouncing voice.
export const PULSE_PIP: Instrument = {
  name: "Pulse (pip)",
  base: "C5",
  zzfx: { volume: 0.28, attack: 0.004, decay: 0.07, sustainVolume: 0.45, sustain: 0.05, release: 0.05, shape: Shape.square, shapeCurve: 0.25, filter: -3000 },
};

// The Game Boy's wave channel as a bass: a soft triangle.
export const WAVE_BASS: Instrument = {
  name: "Wave bass",
  base: "B1",
  zzfx: { volume: 0.7, attack: 0.004, decay: 0.08, sustainVolume: 0.75, sustain: 0.6, release: 0.05, shape: Shape.triangle, filter: -900 },
};

// A fiddle: a bowed saw, low-passed, with a slow swell and a little tremolo.
export const FIDDLE: Instrument = {
  name: "Fiddle",
  base: "C5",
  zzfx: { volume: 0.26, attack: 0.04, decay: 0.1, sustainVolume: 0.85, sustain: 1.2, release: 0.08, shape: Shape.saw, filter: -2300, tremolo: 0.12, repeatTime: 0.11 },
};

// A banjo: a bright pluck that dies away fast.
export const BANJO: Instrument = {
  name: "Banjo",
  base: "C4",
  zzfx: { volume: 0.32, attack: 0.001, decay: 0.09, sustainVolume: 0.12, sustain: 0.05, release: 0.12, shape: Shape.saw, filter: -3200 },
};

// A tuba: a round, buzzy low brass note.
export const TUBA: Instrument = {
  name: "Tuba",
  base: "B1",
  zzfx: { volume: 0.7, attack: 0.025, decay: 0.08, sustainVolume: 0.7, sustain: 0.35, release: 0.07, shape: Shape.saw, filter: -520 },
};

// A clarinet: a square's hollow odd harmonics, softened.
export const CLARINET: Instrument = {
  name: "Clarinet",
  base: "C5",
  zzfx: { volume: 0.3, attack: 0.03, decay: 0.08, sustainVolume: 0.85, sustain: 1.4, release: 0.08, shape: Shape.square, filter: -1500 },
};

// A music box: a high, glassy sine that rings on.
export const MUSIC_BOX: Instrument = {
  name: "Music box",
  base: "C6",
  zzfx: { volume: 0.34, attack: 0.001, decay: 0.25, sustainVolume: 0.25, sustain: 0.25, release: 0.5, shape: Shape.sine },
};

// Pizzicato strings: a short, soft pluck.
export const PIZZICATO: Instrument = {
  name: "Pizzicato",
  base: "C4",
  zzfx: { volume: 0.6, attack: 0.002, decay: 0.07, sustainVolume: 0.15, sustain: 0.04, release: 0.1, shape: Shape.triangle, filter: -1800 },
};

// A kazoo: a buzzing saw with a wobble.
export const KAZOO: Instrument = {
  name: "Kazoo",
  base: "C5",
  zzfx: { volume: 0.24, attack: 0.02, decay: 0.05, sustainVolume: 0.9, sustain: 1, release: 0.05, shape: Shape.saw, filter: -1900, tremolo: 0.25, repeatTime: 0.045 },
};

// A calliope: a breathy organ pipe with a fast flutter.
export const CALLIOPE: Instrument = {
  name: "Calliope",
  base: "C5",
  zzfx: { volume: 0.34, attack: 0.012, decay: 0.05, sustainVolume: 0.8, sustain: 0.6, release: 0.05, shape: Shape.triangle, filter: -2600, tremolo: 0.3, repeatTime: 0.07 },
};

// A vibraphone: a mellow struck bar with its motor's slow pulse.
export const VIBES: Instrument = {
  name: "Vibraphone",
  base: "C5",
  zzfx: { volume: 0.4, attack: 0.002, decay: 0.35, sustainVolume: 0.35, sustain: 0.5, release: 0.6, shape: Shape.sine, tremolo: 0.3, repeatTime: 0.17 },
};

// A nylon-string guitar: a warm pluck.
export const NYLON: Instrument = {
  name: "Nylon guitar",
  base: "C4",
  zzfx: { volume: 0.42, attack: 0.002, decay: 0.15, sustainVolume: 0.25, sustain: 0.15, release: 0.2, shape: Shape.triangle, filter: -1700 },
};

// An upright bass, plucked: a round thump that hangs on.
export const UPRIGHT: Instrument = {
  name: "Upright bass",
  base: "B1",
  zzfx: { volume: 0.9, attack: 0.003, decay: 0.18, sustainVolume: 0.4, sustain: 0.25, release: 0.15, shape: Shape.triangle, filter: -800 },
};

// A bassoon: a reedy low saw, nimble and a little cheeky.
export const BASSOON: Instrument = {
  name: "Bassoon",
  base: "C4",
  zzfx: { volume: 0.36, attack: 0.015, decay: 0.06, sustainVolume: 0.75, sustain: 0.8, release: 0.05, shape: Shape.saw, filter: -1000 },
};

// A piccolo: a pure, high whistle.
export const PICCOLO: Instrument = {
  name: "Piccolo",
  base: "C6",
  zzfx: { volume: 0.22, attack: 0.02, decay: 0.05, sustainVolume: 0.85, sustain: 0.8, release: 0.06, shape: Shape.sine },
};

// A harpsichord: a bright, quick pluck.
export const HARPSICHORD: Instrument = {
  name: "Harpsichord",
  base: "C4",
  zzfx: { volume: 0.22, attack: 0.001, decay: 0.12, sustainVolume: 0.2, sustain: 0.1, release: 0.15, shape: Shape.saw, filter: -3600 },
};

// A marimba: a wooden, hollow knock with a short ring.
export const MARIMBA: Instrument = {
  name: "Marimba",
  base: "C5",
  zzfx: { volume: 0.55, attack: 0.001, decay: 0.1, sustainVolume: 0.15, sustain: 0.06, release: 0.18, shape: Shape.sine },
};

// A glockenspiel: a small, bright bell.
export const GLOCKENSPIEL: Instrument = {
  name: "Glockenspiel",
  base: "C6",
  zzfx: { volume: 0.22, attack: 0.001, decay: 0.12, sustainVolume: 0.3, sustain: 0.1, release: 0.35, shape: Shape.triangle, filter: -6000 },
};

// A held, soft organ chord tone, for pads.
export const REED_ORGAN: Instrument = {
  name: "Reed organ",
  base: "C4",
  zzfx: { volume: 0.2, attack: 0.06, decay: 0.1, sustainVolume: 0.8, sustain: 2.5, release: 0.15, shape: Shape.triangle, filter: -1400 },
};

// Drums and percussion.

export const KICK: Instrument = {
  name: "Kick",
  base: "E3",
  zzfx: { volume: 0.9, attack: 0.002, decay: 0.03, sustainVolume: 0.35, sustain: 0.02, release: 0.04, shape: Shape.sine, slide: -4 },
};

export const SNARE: Instrument = {
  name: "Snare",
  base: "G4",
  zzfx: { volume: 0.32, attack: 0.001, decay: 0.03, sustainVolume: 0.3, sustain: 0.02, release: 0.08, shape: Shape.noise, filter: -4200 },
};

export const HAT: Instrument = {
  name: "Hat",
  base: "C6",
  zzfx: { volume: 0.12, attack: 0.001, sustain: 0.005, release: 0.03, shape: Shape.noise, filter: 7000 },
};

// A brush swirling on a snare: a soft wash of noise.
export const BRUSH: Instrument = {
  name: "Brush",
  base: "C5",
  zzfx: { volume: 0.12, attack: 0.03, decay: 0.05, sustainVolume: 0.5, sustain: 0.04, release: 0.1, shape: Shape.noise, filter: -5000 },
};

// A wood block: a hollow tick, high or low.
export const WOOD_BLOCK: Instrument = {
  name: "Wood block",
  base: "G5",
  zzfx: { volume: 0.3, attack: 0.001, decay: 0.02, sustainVolume: 0.2, release: 0.03, shape: Shape.triangle, filter: -4000 },
};

// A shaker: a quick, dry rattle.
export const SHAKER: Instrument = {
  name: "Shaker",
  base: "C6",
  zzfx: { volume: 0.08, attack: 0.012, sustain: 0.01, release: 0.03, shape: Shape.noise, filter: 5000 },
};

// A bell, as an elevator's ding.
export const BELL: Instrument = {
  name: "Bell",
  base: "C6",
  zzfx: { volume: 0.25, attack: 0.001, decay: 0.3, sustainVolume: 0.3, sustain: 0.3, release: 0.9, shape: Shape.sine },
};
