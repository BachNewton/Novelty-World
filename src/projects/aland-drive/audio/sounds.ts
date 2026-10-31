import { Shape, type SoundDesign } from "@/shared/lib/sound";

/*
 * The one-shots, as ZzFX designs. The continuous sounds (engine, tyres, wind,
 * the places) can't be one-shots: they are `graph.ts`'s.
 */

export const SOUND_IDS = ["knock", "thud", "bump-stop", "gear", "handbrake", "crash"] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export const SOUNDS: Record<SoundId, SoundDesign> = {
  knock: {
    label: "Suspension knock",
    trigger: "A wheel rises quickly: a patch, a crossing, a pothole's edge.",
    layers: [{ at: 0, zzfx: { volume: 0.32, frequency: 95, sustain: 0.01, release: 0.05, shape: Shape.triangle, slide: -1, noise: 0.3, filter: -900 } }],
    variation: { pitch: 0.12, volume: 0.3 },
    minGap: 0.09,
    busiestEvery: 0.14,
  },
  thud: {
    label: "Bump thud",
    trigger: "A wheel rises hard: a kerb, a crest landing, a ditch.",
    layers: [
      { at: 0, zzfx: { volume: 0.6, frequency: 70, sustain: 0.03, release: 0.14, shape: Shape.sine, slide: -0.6, filter: -500 } },
      { at: 0, zzfx: { volume: 0.2, frequency: 160, release: 0.06, shape: Shape.noise, filter: -1400 } },
    ],
    variation: { pitch: 0.1, volume: 0.2 },
    minGap: 0.16,
    busiestEvery: 0.3,
  },
  "bump-stop": {
    label: "Bump stop",
    trigger: "A wheel runs out of travel and hits its stop.",
    layers: [
      { at: 0, zzfx: { volume: 0.5, frequency: 120, release: 0.07, shape: Shape.square, slide: -2, filter: -700 } },
      { at: 0.01, zzfx: { volume: 0.2, frequency: 900, release: 0.04, shape: Shape.noise, filter: -2600 } },
    ],
    variation: { pitch: 0.08, volume: 0.15 },
    minGap: 0.25,
    busiestEvery: 0.4,
  },
  gear: {
    label: "Gear change",
    trigger: "The gearbox changes gear: a small mechanical clunk under the note.",
    layers: [{ at: 0, zzfx: { volume: 0.14, frequency: 210, release: 0.03, shape: Shape.triangle, noise: 0.5, filter: -1800 } }],
    variation: { pitch: 0.1, volume: 0.25 },
    minGap: 0.1,
    busiestEvery: 0.6,
  },
  handbrake: {
    label: "Handbrake",
    trigger: "The handbrake goes on: the lever's ratchet, then the cable's clunk.",
    layers: [
      { at: 0, zzfx: { volume: 0.2, frequency: 1800, release: 0.012, shape: Shape.noise, filter: -5000 } },
      { at: 0.035, zzfx: { volume: 0.2, frequency: 2000, release: 0.012, shape: Shape.noise, filter: -5000 } },
      { at: 0.07, zzfx: { volume: 0.2, frequency: 2200, release: 0.012, shape: Shape.noise, filter: -5000 } },
      { at: 0.105, zzfx: { volume: 0.3, frequency: 140, release: 0.05, shape: Shape.triangle, slide: -1, filter: -900 } },
    ],
    variation: { pitch: 0.05, volume: 0.15 },
    minGap: 0.25,
    busiestEvery: 0.6,
  },
  crash: {
    label: "Crash",
    trigger: "The car loses speed faster than any brake can: a wall, a building. Its strength scales the level.",
    layers: [
      { at: 0, zzfx: { volume: 0.85, frequency: 58, sustain: 0.05, release: 0.34, shape: Shape.sine, slide: -0.3, filter: -420 } },
      { at: 0, zzfx: { volume: 0.5, frequency: 300, sustain: 0.03, release: 0.2, shape: Shape.noise, filter: -2200 } },
      { at: 0.015, zzfx: { volume: 0.2, frequency: 1250, release: 0.3, shape: Shape.tan, slide: -4, modulation: 3, filter: -4200 } },
      { at: 0.1, zzfx: { volume: 0.1, frequency: 3100, release: 0.05, shape: Shape.triangle, filter: -6000 } },
      { at: 0.18, zzfx: { volume: 0.07, frequency: 4100, release: 0.04, shape: Shape.triangle, filter: -6000 } },
      { at: 0.27, zzfx: { volume: 0.05, frequency: 3600, release: 0.04, shape: Shape.triangle, filter: -6000 } },
    ],
    variation: { pitch: 0.07, volume: 0.1 },
    minGap: 0.6,
    busiestEvery: 1,
  },
};
