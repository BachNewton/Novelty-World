import type { Voice } from "../vehicles";

/** A V12: so many firings the note is a seamless tearing silk, quiet at a cruise. */
export const ankar: Voice = {
  seed: 1068,
  firesPerRev: 6,
  pulseOrders: [1, 2, 3],
  pulseDecay: 0.7,
  unevenness: 0.04,
  harmonics: [
    { order: 0.5, wave: "sine", level: 0.05, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.3, cents: -3 },
    { order: 2, wave: "sawtooth", level: 0.18, cents: 4 },
  ],
  cycleLevel: 0.35,
  exhaustHz: [900, 2800, 1600],
  bodyHz: 320,
  bodyDb: 6,
  drive: 1.8,
  intakeHz: [700, 2600],
  intakeQ: 1.1,
  intakeLevel: 0.12,
  firingBeat: 0.3,
  level: 0.3,
  idleLevel: 0.32,
};
