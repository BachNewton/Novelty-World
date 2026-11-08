import { inline } from "../firing";
import type { Voice } from "../vehicles";

/** A straight six that loves to rev: smooth and even, an exhaust that hardens into a howl past 5,000, a few pops on the lift. */
export const skerryGt: Voice = {
  seed: 1,
  combustion: {
    firing: inline(6),
    lope: 0.06,
    jitter: 0.08,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 1.2,
    headerHz: 650,
    roughness: 0.25,
    knock: 0,
    knockHz: 2400,
    chatter: 0.15,
    fan: null,
    pipeHz: 140,
    pipeRing: 0.45,
    exhaustHz: [900, 2600, 1800],
    silencerHz: 340,
    silencerDb: 6,
    rasp: 2,
    intakeHz: 280,
    intakeQ: 2,
    intake: 0.6,
    limiterHz: 11,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 2, antiLag: 0 },
  gearWhine: { teeth: 23, level: 0.015 },
  cabin: 0.1,
  level: 0.45,
  idleLevel: 0.46,
};
