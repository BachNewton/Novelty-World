import type { Voice } from "../vehicles";

/** A twin-carb four with no silencer to speak of: raspy, and the carburettors gasping. */
export const vik: Voice = {
  seed: 680,
  firesPerRev: 2,
  pulseOrders: [1, 2.03, 3.1, 4.4],
  pulseDecay: 0.4,
  unevenness: 0.18,
  harmonics: [
    { order: 0.5, wave: "triangle", level: 0.08, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.34, cents: -6 },
    { order: 2, wave: "sawtooth", level: 0.2, cents: 10 },
  ],
  cycleLevel: 0.6,
  exhaustHz: [900, 2600, 1600],
  bodyHz: 360,
  bodyDb: 8,
  drive: 2.4,
  intakeHz: [700, 2600],
  intakeQ: 1.1,
  intakeLevel: 0.3,
  firingBeat: 0.7,
  level: 0.3,
  idleLevel: 0.45,
};
