import type { Voice } from "../vehicles";

/** A straight six that loves to rev: smooth at idle, a hard edge up high. */
export const skerryGt: Voice = {
  seed: 1,
  firesPerRev: 3,
  pulseOrders: [1, 2.02, 3.04, 5.1],
  pulseDecay: 0.5,
  unevenness: 0.12,
  harmonics: [
    { order: 0.5, wave: "sine", level: 0.07, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.36, cents: -4 },
    { order: 2, wave: "sawtooth", level: 0.2, cents: 7 },
  ],
  cycleLevel: 0.55,
  exhaustHz: [900, 2400, 1800],
  bodyHz: 340,
  bodyDb: 8,
  drive: 2.2,
  intakeHz: [500, 2400],
  intakeQ: 1.2,
  intakeLevel: 0.16,
  firingBeat: 0.5,
  level: 0.34,
  idleLevel: 0.46,
};
