import { crossPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A twin-turbo cross-plane V8 up front: each bank lopes down its own pipe, so it burbles deep at idle and drums hard
 * under load, the turbos hushing the top of the note and sighing out through their valves on a lift, and the sports
 * exhaust crackling and popping on the overrun. Deeper and heavier than Sund's flat-plane shriek, rougher than
 * Dyning's V12.
 */
export const brus: Voice = {
  seed: 2207,
  combustion: {
    firing: crossPlaneV8,
    lope: 0.11,
    jitter: 0.1,
    banks: { gain: 0.86, ring: 1.14, delayMs: 0.8 },
    pulseMs: 1.6,
    headerHz: 560,
    roughness: 0.32,
    knock: 0,
    knockHz: 2400,
    chatter: 0.1,
    fan: null,
    pipeHz: 110,
    pipeRing: 0.45,
    exhaustHz: [800, 2600, 2000],
    silencerHz: 220,
    silencerDb: 8,
    rasp: 2.3,
    intakeHz: 240,
    intakeQ: 1.6,
    intake: 0.5,
    limiterHz: 9,
  },
  electric: null,
  turbo: {
    boostFrom: 0.2,
    spoolS: 0.5,
    whistleHz: [2200, 6800],
    whistle: 0.06,
    hiss: 0.09,
    blowOff: "valve",
    blowOffLevel: 0.5,
  },
  supercharger: null,
  overrun: { crackle: 2.5, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.012 },
  cabin: 0.1,
  level: 0.34,
  idleLevel: 0.5,
};
