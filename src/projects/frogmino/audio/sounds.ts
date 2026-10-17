import { Shape, type SoundDesign, type SoundLayer } from "@/shared/lib/sound";

// Frogmino's sound designs: a handful of soft, short sounds built with ZzFX.
// Sound complements the gameplay and never gets in its way, so only moments
// worth marking have a sound, and the frequent actions (slides, turns, jumps)
// are silent.

export const SOUND_IDS = ["hop", "bonk", "pass", "drop", "finish"] as const;
export type SoundId = (typeof SOUND_IDS)[number];

// Each clean pass in a row climbs the major pentatonic scale, in semitones,
// and stays on the octave once it gets there. A bonk starts it over.
export const PASS_STREAK_STEPS = [0, 2, 4, 7, 9, 12] as const;

export function passStreakSemitones(streak: number): number {
  return PASS_STREAK_STEPS[Math.min(streak, PASS_STREAK_STEPS.length - 1)];
}

// A fanfare note: a soft triangle through a low-pass.
function note(at: number, frequency: number, hold: number, release: number): SoundLayer {
  return {
    at,
    zzfx: { volume: 0.4, frequency, attack: 0.01, sustain: hold, release, shape: Shape.triangle, filter: -3500 },
  };
}

export const SOUNDS: Record<SoundId, SoundDesign> = {
  hop: {
    label: "Hop",
    trigger: "A frog hops up (Space), each frog in its own voice.",
    layers: [
      {
        at: 0,
        zzfx: {
          volume: 0.75,
          frequency: 240,
          attack: 0.01,
          decay: 0.04,
          sustain: 0.02,
          sustainVolume: 0.6,
          release: 0.08,
          shape: Shape.triangle,
          slide: 5,
          filter: -2400,
        },
      },
    ],
    variation: { pitch: 0.07, volume: 0.2 },
    minGap: 0.12,
    busiestEvery: 0.75,
  },
  bonk: {
    label: "Bonk",
    trigger: "A row the frog doesn't fit knocks it back.",
    layers: [
      {
        at: 0,
        zzfx: {
          volume: 0.35,
          frequency: 420,
          release: 0.08,
          shape: Shape.triangle,
          slide: -6,
          filter: -2000,
        },
      },
      {
        at: 0,
        zzfx: {
          volume: 0.9,
          frequency: 160,
          decay: 0.05,
          sustain: 0.03,
          sustainVolume: 0.5,
          release: 0.16,
          slide: -0.8,
          noise: 0.4,
          filter: -1200,
        },
      },
    ],
    variation: { pitch: 0.06, volume: 0.15 },
    minGap: 0.3,
    busiestEvery: 1.2,
  },
  pass: {
    label: "Row passed",
    trigger: "The frog fits through a row. Each clean pass in a row climbs a note; a bonk resets it.",
    layers: [{ at: 0, zzfx: { volume: 0.58, frequency: 520, attack: 0.005, sustain: 0.015, release: 0.07, slide: 1.5 } }],
    variation: { pitch: 0.012, volume: 0.12 },
    minGap: 0.08,
    busiestEvery: 0.9,
  },
  drop: {
    label: "Jump out onto the road",
    trigger: "The team jumps out of the helicopter onto the road.",
    layers: [
      { at: 0, zzfx: { volume: 0.5, frequency: 760, attack: 0.01, sustain: 0.04, release: 0.12, slide: -6, filter: -3000 } },
      { at: 0.15, zzfx: { volume: 0.5, frequency: 180, release: 0.08, slide: -1 } },
    ],
    variation: { pitch: 0.05, volume: 0.15 },
    minGap: 0.4,
    busiestEvery: 2,
  },
  finish: {
    label: "Finish",
    trigger: "The frog reaches the end of the course.",
    layers: [note(0, 523.25, 0.06, 0.12), note(0.1, 659.25, 0.06, 0.12), note(0.2, 783.99, 0.06, 0.12), note(0.3, 1046.5, 0.12, 0.4)],
    variation: { pitch: 0, volume: 0 },
    minGap: 2,
    busiestEvery: 3,
  },
};
