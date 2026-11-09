import { inline } from "../firing";
import type { Voice } from "../vehicles";

/** A high-revving four: buzzy low down, then a hard howl from the intake past 6,000, and a pop or two on the lift. */
export const sten: Voice = {
  seed: 777,
  combustion: {
    firing: inline(4),
    lope: 0.05,
    jitter: 0.07,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 1,
    headerHz: 750,
    roughness: 0.3,
    knock: 0,
    knockHz: 2400,
    chatter: 0.18,
    fan: null,
    pipeHz: 160,
    pipeRing: 0.4,
    exhaustHz: [1000, 3400, 1800],
    silencerHz: 450,
    silencerDb: 6,
    rasp: 2.6,
    intakeHz: 380,
    intakeQ: 3,
    intake: 1,
    limiterHz: 14,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 2, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.015 },
  cabin: 0.05,
  level: 0.32,
  idleLevel: 0.42,
};
