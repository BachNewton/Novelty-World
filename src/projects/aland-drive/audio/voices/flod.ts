import { crossPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A twin-turbo cross-plane V8 in a long estate, Orkan's engine bored out and given more boost: the same dark, bassy
 * burble through a longer pipe, a little lumpier and rougher-throated, its banks further apart so the lope is heard
 * at idle, with the turbos' whoosh building early and a sigh through their valves on every lift. Sealed in a quiet
 * cabin, as a family car is.
 */
export const flod: Voice = {
  seed: 1907,
  combustion: {
    firing: crossPlaneV8,
    lope: 0.11,
    jitter: 0.1,
    banks: { gain: 0.86, ring: 1.14, delayMs: 0.8 },
    pulseMs: 1.9,
    headerHz: 450,
    roughness: 0.32,
    knock: 0,
    knockHz: 2400,
    chatter: 0.1,
    fan: null,
    pipeHz: 96,
    pipeRing: 0.47,
    exhaustHz: [620, 1900, 1700],
    silencerHz: 178,
    silencerDb: 8,
    rasp: 1.95,
    intakeHz: 225,
    intakeQ: 1.5,
    intake: 0.42,
    limiterHz: 8,
  },
  electric: null,
  turbo: {
    boostFrom: 0.22,
    spoolS: 0.6,
    whistleHz: [1800, 6200],
    whistle: 0.09,
    hiss: 0.18,
    blowOff: "valve",
    blowOffLevel: 0.9,
  },
  supercharger: null,
  overrun: { crackle: 1.6, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.014 },
  cabin: 0.06,
  level: 0.36,
  idleLevel: 0.48,
};
