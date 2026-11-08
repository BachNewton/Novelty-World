import type { Voice } from "../vehicles";

/** A V6: the same firings as the six but gruffer, a growl rather than a scream. */
export const bris: Voice = {
  seed: 1165,
  firesPerRev: 3,
  pulseOrders: [1, 1.5, 2.03, 3.05],
  pulseDecay: 0.45,
  unevenness: 0.24,
  harmonics: [
    { order: 0.5, wave: "triangle", level: 0.12, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.34, cents: -6 },
    { order: 1.5, wave: "triangle", level: 0.08, cents: 5 },
    { order: 2, wave: "sawtooth", level: 0.16, cents: 9 },
  ],
  cycleLevel: 0.62,
  exhaustHz: [800, 2000, 1600],
  bodyHz: 280,
  bodyDb: 9,
  drive: 2.1,
  intakeHz: [600, 2200],
  intakeQ: 1.2,
  intakeLevel: 0.14,
  firingBeat: 0.5,
  level: 0.33,
  idleLevel: 0.48,
};
