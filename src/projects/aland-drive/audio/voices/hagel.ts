import type { Voice } from "../vehicles";

/**
 * A 1.6-litre turbo four built for rallying, on anti-lag, over a hybrid unit: an even, hard, rasping four with a
 * bright turbo whistle in its intake, a crackle of anti-lag under it, and the hybrid motor's thin whine above it.
 * Today's model has no pops on lift, so the crackle is a clatter beaten into the intake; provisional, until the sound's
 * own work redoes the voices.
 */
export const hagel: Voice = {
  seed: 2207,
  firesPerRev: 2,
  pulseOrders: [1, 2, 3.02, 4.1],
  pulseDecay: 0.3,
  unevenness: 0.1,
  harmonics: [
    { order: 0.5, wave: "triangle", level: 0.08, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.36, cents: -6 },
    { order: 2, wave: "sawtooth", level: 0.2, cents: 8 },
    { order: 4, wave: "square", level: 0.05, cents: 14 },
    { order: 9, wave: "sine", level: 0.05, cents: 3 },
  ],
  cycleLevel: 0.6,
  exhaustHz: [1000, 3600, 2800],
  bodyHz: 420,
  bodyDb: 7,
  drive: 3.4,
  intakeHz: [2200, 6800],
  intakeQ: 4.5,
  intakeLevel: 0.3,
  firingBeat: 0.28,
  level: 0.37,
  idleLevel: 0.45,
};
