import type { Voice } from "../vehicles";

/**
 * A naturally aspirated V12 in a grand tourer: six even firings a turn, a smooth deep hum at a cruise that rises, as
 * the revs climb past 6,000, into a high, tearing wail, harder and more open than Ankar's silk.
 */
export const dyning: Voice = {
  seed: 3112,
  firesPerRev: 6,
  pulseOrders: [1, 2, 3, 4.01],
  pulseDecay: 0.6,
  unevenness: 0.035,
  harmonics: [
    { order: 0.5, wave: "sine", level: 0.06, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.36, cents: -3 },
    { order: 2, wave: "sawtooth", level: 0.22, cents: 4 },
    { order: 3, wave: "square", level: 0.04, cents: 9 },
    { order: 4, wave: "sine", level: 0.05, cents: 2 },
  ],
  cycleLevel: 0.4,
  exhaustHz: [900, 3600, 2000],
  bodyHz: 360,
  bodyDb: 6,
  drive: 2.4,
  intakeHz: [800, 4000],
  intakeQ: 1.3,
  intakeLevel: 0.2,
  firingBeat: 0.3,
  level: 0.36,
  idleLevel: 0.34,
};
