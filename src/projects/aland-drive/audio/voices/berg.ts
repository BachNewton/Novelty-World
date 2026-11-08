import type { Voice } from "../vehicles";

/** An old straight six that never revs: a low, muffled drone and a lazy beat. */
export const berg: Voice = {
  seed: 874,
  firesPerRev: 3,
  pulseOrders: [1, 2, 3.1],
  pulseDecay: 0.46,
  unevenness: 0.2,
  harmonics: [
    { order: 0.5, wave: "triangle", level: 0.12, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.3, cents: -7 },
    { order: 2, wave: "triangle", level: 0.14, cents: 8 },
  ],
  cycleLevel: 0.7,
  exhaustHz: [550, 900, 900],
  bodyHz: 200,
  bodyDb: 11,
  drive: 1.4,
  intakeHz: [350, 1100],
  intakeQ: 1.4,
  intakeLevel: 0.1,
  firingBeat: 0.55,
  level: 0.32,
  idleLevel: 0.55,
};
