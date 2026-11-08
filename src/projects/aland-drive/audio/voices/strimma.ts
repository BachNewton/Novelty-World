import type { Voice } from "../vehicles";

/**
 * A free-breathing flat six to 9,000: a gruff, metallic boxer's beat low down that hardens into a wail up top, with
 * the airbox howling behind the seats. Provisional, until the sound's own work redoes the voices.
 */
export const strimma: Voice = {
  seed: 1907,
  firesPerRev: 3,
  pulseOrders: [1, 1.5, 2.02, 3.03, 4.05],
  pulseDecay: 0.48,
  unevenness: 0.1,
  harmonics: [
    { order: 0.5, wave: "triangle", level: 0.08, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.38, cents: -4 },
    { order: 1.5, wave: "triangle", level: 0.06, cents: 6 },
    { order: 2, wave: "sawtooth", level: 0.22, cents: 6 },
    { order: 3, wave: "square", level: 0.06, cents: 12 },
  ],
  cycleLevel: 0.5,
  exhaustHz: [1000, 3800, 2400],
  bodyHz: 360,
  bodyDb: 8,
  drive: 2.9,
  intakeHz: [700, 3800],
  intakeQ: 1.8,
  intakeLevel: 0.26,
  firingBeat: 0.45,
  level: 0.36,
  idleLevel: 0.44,
};
