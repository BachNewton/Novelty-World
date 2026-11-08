import type { Voice } from "../vehicles";

/**
 * A twin-turbo cross-plane V8 at the front: a deep, even burble muffled by its turbos, so the exhaust stays dark and
 * bassy even flat out, while the turbos' breath rises over it as a broad whoosh with the load. Today's model until
 * the new synthesis lands.
 */
export const orkan: Voice = {
  seed: 734,
  firesPerRev: 4,
  pulseOrders: [0.5, 1, 1.5, 2],
  pulseDecay: 0.62,
  unevenness: 0.1,
  harmonics: [
    { order: 0.5, wave: "sine", level: 0.16, cents: 0 },
    { order: 1, wave: "sawtooth", level: 0.3, cents: -4 },
    { order: 1.5, wave: "sine", level: 0.07, cents: 3 },
    { order: 2, wave: "sawtooth", level: 0.12, cents: 6 },
  ],
  cycleLevel: 0.44,
  exhaustHz: [480, 1500, 1100],
  bodyHz: 190,
  bodyDb: 9,
  drive: 1.5,
  intakeHz: [1700, 5200],
  intakeQ: 0.9,
  intakeLevel: 0.34,
  firingBeat: 0.06,
  level: 0.36,
  idleLevel: 0.36,
};
