import type { Voice } from "../vehicles";

/** A turbo flat four on unequal pipes: a loping rumble, and a whoosh as the boost arrives. */
export const grus: Voice = {
  seed: 1262,
  firesPerRev: 2,
  pulseOrders: [1, 1.5, 2.05, 3.1],
  pulseDecay: 0.38,
  unevenness: 0.45,
  harmonics: [
    { order: 0.5, wave: "triangle", level: 0.22, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.3, cents: -9 },
    { order: 2, wave: "sawtooth", level: 0.14, cents: 12 },
  ],
  cycleLevel: 0.78,
  exhaustHz: [800, 2200, 1800],
  bodyHz: 260,
  bodyDb: 10,
  drive: 2.3,
  intakeHz: [1200, 4400],
  intakeQ: 3,
  intakeLevel: 0.2,
  firingBeat: 0.5,
  level: 0.34,
  idleLevel: 0.5,
};
