import type { Voice } from "../vehicles";

/** A turbo diesel in a tin box: low revs and the clatter that gives it away. */
export const kobb: Voice = {
  seed: 486,
  firesPerRev: 2,
  pulseOrders: [1, 2.5, 4.3, 7.2, 11.4],
  pulseDecay: 0.26,
  unevenness: 0.2,
  harmonics: [
    { order: 0.5, wave: "triangle", level: 0.08, cents: 0 },
    { order: 1, wave: "square", level: 0.2, cents: -6 },
    { order: 2, wave: "sawtooth", level: 0.16, cents: 9 },
  ],
  cycleLevel: 0.8,
  exhaustHz: [760, 800, 700],
  bodyHz: 190,
  bodyDb: 9,
  drive: 1.2,
  intakeHz: [1500, 2600],
  intakeQ: 2.2,
  intakeLevel: 0.24,
  firingBeat: 1,
  level: 0.3,
  idleLevel: 0.56,
};
