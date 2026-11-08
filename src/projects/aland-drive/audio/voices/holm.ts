import type { Voice } from "../vehicles";

/** A cross-plane V8: the lopsided burble at idle, a deep rumble under load, never high. */
export const holm: Voice = {
  seed: 389,
  firesPerRev: 4,
  pulseOrders: [1, 2, 3.05],
  pulseDecay: 0.5,
  unevenness: 0.4,
  harmonics: [
    { order: 0.25, wave: "sine", level: 0.08, cents: 0 },
    { order: 0.5, wave: "triangle", level: 0.2, cents: 4 },
    { order: 1, wave: "sawtooth", level: 0.3, cents: -8 },
    { order: 2, wave: "sawtooth", level: 0.12, cents: 10 },
  ],
  cycleLevel: 0.8,
  exhaustHz: [600, 1200, 1300],
  bodyHz: 170,
  bodyDb: 11,
  drive: 2,
  intakeHz: [400, 1500],
  intakeQ: 1.3,
  intakeLevel: 0.12,
  firingBeat: 0.6,
  level: 0.36,
  idleLevel: 0.55,
};
