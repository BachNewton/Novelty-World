import type { Voice } from "../vehicles";

/** A flat-plane V8 to 9,000: even, hard and high, a shriek flat out. */
export const sund: Voice = {
  seed: 292,
  firesPerRev: 4,
  pulseOrders: [1, 2.01, 3, 4.02],
  pulseDecay: 0.55,
  unevenness: 0.06,
  harmonics: [
    { order: 0.5, wave: "sine", level: 0.04, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.4, cents: -3 },
    { order: 2, wave: "sawtooth", level: 0.24, cents: 5 },
    { order: 3, wave: "square", level: 0.06, cents: 11 },
  ],
  cycleLevel: 0.45,
  exhaustHz: [1100, 3600, 2200],
  bodyHz: 420,
  bodyDb: 7,
  drive: 2.8,
  intakeHz: [800, 3600],
  intakeQ: 1.4,
  intakeLevel: 0.2,
  firingBeat: 0.4,
  level: 0.36,
  idleLevel: 0.42,
};
