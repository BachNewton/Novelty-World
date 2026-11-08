import type { Voice } from "../vehicles";

/**
 * A twin-turbo flat-plane V8 behind the seats, to 8,700: even firing that shrieks rather than burbles, a little of the
 * turbos' whistle riding high over it, and the hollow intake roar of a mid-engined car close behind the driver.
 */
export const virvel: Voice = {
  seed: 733,
  firesPerRev: 4,
  pulseOrders: [1, 2.01, 3, 4.02],
  pulseDecay: 0.52,
  unevenness: 0.05,
  harmonics: [
    { order: 0.5, wave: "sine", level: 0.035, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.4, cents: -3 },
    { order: 2, wave: "sawtooth", level: 0.26, cents: 5 },
    { order: 3, wave: "square", level: 0.07, cents: 11 },
    { order: 9, wave: "sine", level: 0.035, cents: 4 },
  ],
  cycleLevel: 0.44,
  exhaustHz: [1200, 3900, 2500],
  bodyHz: 440,
  bodyDb: 7,
  drive: 3.0,
  intakeHz: [1000, 4600],
  intakeQ: 1.7,
  intakeLevel: 0.28,
  firingBeat: 0.38,
  level: 0.37,
  idleLevel: 0.4,
};
