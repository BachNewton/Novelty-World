import type { Voice } from "../vehicles";

/**
 * Four motors, one at each wheel, and no engine: a deep whine that climbs with the speed through one long gear, its
 * motors a few cents apart so they beat against each other, and the inverters' thin high tone over them. Near silent
 * at rest. Provisional, until the sound's own work redoes the voices.
 */
export const blixt: Voice = {
  seed: 1187,
  firesPerRev: 3,
  pulseOrders: [1, 2, 4],
  pulseDecay: 2,
  unevenness: 0,
  harmonics: [
    { order: 1, wave: "sine", level: 0.3, cents: 0 },
    { order: 1, wave: "sine", level: 0.16, cents: 9 },
    { order: 0.5, wave: "triangle", level: 0.26, cents: -4 },
    { order: 2, wave: "triangle", level: 0.08, cents: 6 },
    { order: 4.5, wave: "sine", level: 0.035, cents: 0 },
  ],
  cycleLevel: 0.06,
  exhaustHz: [1400, 4200, 2200],
  bodyHz: 700,
  bodyDb: 4,
  drive: 0.6,
  intakeHz: [3000, 8000],
  intakeQ: 6,
  intakeLevel: 0.025,
  firingBeat: 0,
  level: 0.24,
  idleLevel: 0,
};
