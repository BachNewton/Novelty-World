import type { Voice } from "../vehicles";

/** A tired four: lumpy, muffled, out of breath early. */
export const salta: Voice = {
  seed: 583,
  firesPerRev: 2,
  pulseOrders: [1, 2, 2.97, 4.1, 6.05],
  pulseDecay: 0.42,
  unevenness: 0.34,
  harmonics: [
    { order: 0.5, wave: "triangle", level: 0.1, cents: 3 },
    { order: 1, wave: "sawtooth", level: 0.3, cents: -9 },
    { order: 2, wave: "sawtooth", level: 0.18, cents: 12 },
  ],
  cycleLevel: 0.7,
  exhaustHz: [650, 800, 900],
  bodyHz: 230,
  bodyDb: 10,
  drive: 1.5,
  intakeHz: [380, 1100],
  intakeQ: 1.6,
  intakeLevel: 0.1,
  firingBeat: 0.6,
  level: 0.32,
  idleLevel: 0.52,
};
