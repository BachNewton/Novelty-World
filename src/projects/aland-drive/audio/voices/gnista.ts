import type { Voice } from "../vehicles";

/**
 * Two motors, one on each axle, through straight-cut gears and no engine: the motors' whine climbing fast with the
 * speed, the pair a few cents apart so they beat, the gears' own harder whine a step above them, and the inverters'
 * thin high tone over it all. Rawer and louder than a road car's, as a race car's drive is. Near silent at rest.
 * Provisional, until the sound's own work redoes the voices.
 */
export const gnista: Voice = {
  seed: 2213,
  firesPerRev: 4,
  pulseOrders: [1, 2, 3],
  pulseDecay: 2,
  unevenness: 0,
  harmonics: [
    { order: 1, wave: "sine", level: 0.3, cents: 0 },
    { order: 1, wave: "sine", level: 0.14, cents: 12 },
    { order: 0.5, wave: "triangle", level: 0.18, cents: -5 },
    { order: 2.5, wave: "triangle", level: 0.13, cents: 0 },
    { order: 5, wave: "sine", level: 0.04, cents: 3 },
  ],
  cycleLevel: 0.08,
  exhaustHz: [1800, 5000, 2600],
  bodyHz: 1100,
  bodyDb: 4,
  drive: 1.1,
  intakeHz: [3200, 9000],
  intakeQ: 7,
  intakeLevel: 0.04,
  firingBeat: 0,
  level: 0.3,
  idleLevel: 0,
};
