import type { Voice } from "../vehicles";

/** No firings: a rising whine that sits above the tyres, and almost nothing at rest. */
export const strom: Voice = {
  seed: 971,
  firesPerRev: 6,
  pulseOrders: [1, 3],
  pulseDecay: 2,
  unevenness: 0,
  harmonics: [
    { order: 1, wave: "sine", level: 0.34, cents: 0 },
    { order: 1.5, wave: "triangle", level: 0.1, cents: 5 },
    { order: 0.25, wave: "sine", level: 0.3, cents: -3 },
  ],
  cycleLevel: 0.08,
  exhaustHz: [1600, 3200, 1600],
  bodyHz: 900,
  bodyDb: 3,
  drive: 0.4,
  intakeHz: [2400, 6200],
  intakeQ: 5,
  intakeLevel: 0.03,
  firingBeat: 0,
  level: 0.2,
  idleLevel: 0,
};
