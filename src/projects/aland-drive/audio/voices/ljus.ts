import type { Voice } from "../vehicles";

/** A little turbo triple: an off-beat thrum, a whistle as the boost comes in, nothing much at the top. */
export const ljus: Voice = {
  seed: 98,
  firesPerRev: 1.5,
  pulseOrders: [1, 2, 3.02, 4.5],
  pulseDecay: 0.45,
  unevenness: 0.22,
  harmonics: [
    { order: 0.5, wave: "sine", level: 0.12, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.3, cents: -6 },
    { order: 2, wave: "sawtooth", level: 0.14, cents: 8 },
  ],
  cycleLevel: 0.65,
  exhaustHz: [800, 1700, 1300],
  bodyHz: 300,
  bodyDb: 9,
  drive: 1.8,
  intakeHz: [900, 3200],
  intakeQ: 3.5,
  intakeLevel: 0.14,
  firingBeat: 0.4,
  level: 0.28,
  idleLevel: 0.5,
};
