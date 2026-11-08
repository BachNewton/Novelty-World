import type { Voice } from "../vehicles";

/** A twin-turbo flat-plane V8 over the whine of its motors: hard and high, with an electric edge under it. Provisional, until the sound's own work redoes the voices. */
export const aska: Voice = {
  seed: 517,
  firesPerRev: 4,
  pulseOrders: [1, 2.01, 3, 4.02],
  pulseDecay: 0.5,
  unevenness: 0.05,
  harmonics: [
    { order: 0.5, wave: "sine", level: 0.05, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.38, cents: -3 },
    { order: 2, wave: "sawtooth", level: 0.22, cents: 5 },
    { order: 3, wave: "square", level: 0.05, cents: 11 },
    { order: 6, wave: "sine", level: 0.06, cents: 2 },
  ],
  cycleLevel: 0.42,
  exhaustHz: [900, 3200, 2400],
  bodyHz: 380,
  bodyDb: 8,
  drive: 3.2,
  intakeHz: [900, 4200],
  intakeQ: 1.6,
  intakeLevel: 0.26,
  firingBeat: 0.35,
  level: 0.38,
  idleLevel: 0.4,
};
