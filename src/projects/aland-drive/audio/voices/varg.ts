import type { Voice } from "../vehicles";

/**
 * A supercharged cross-plane V8 of seven litres and more: the lopsided burble of Holm's V8 made bigger and harder, a
 * deep rumble that turns to a bark under load, and the blower's whine, a thin partial high over the firings that
 * rises with the revs.
 */
export const varg: Voice = {
  seed: 1971,
  firesPerRev: 4,
  pulseOrders: [1, 2, 3.04, 4.1],
  pulseDecay: 0.55,
  unevenness: 0.34,
  harmonics: [
    { order: 0.25, wave: "sine", level: 0.07, cents: 0 },
    { order: 0.5, wave: "triangle", level: 0.24, cents: 3 },
    { order: 1, wave: "sawtooth", level: 0.34, cents: -7 },
    { order: 2, wave: "sawtooth", level: 0.15, cents: 9 },
    // The supercharger: its rotors turn several times for each turn of the crank, a whine above everything else.
    { order: 7.2, wave: "sine", level: 0.05, cents: 0 },
    { order: 7.2, wave: "triangle", level: 0.02, cents: 14 },
  ],
  cycleLevel: 0.78,
  exhaustHz: [520, 1700, 1900],
  bodyHz: 150,
  bodyDb: 12,
  drive: 3,
  intakeHz: [500, 2600],
  intakeQ: 1.4,
  intakeLevel: 0.2,
  firingBeat: 0.5,
  level: 0.4,
  idleLevel: 0.55,
};
