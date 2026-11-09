import { crossPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A twin-turbo cross-plane V8 set behind the front axle: a deep, even burble muffled by its turbos, so the exhaust stays
 * dark and bassy even flat out, while the turbos' breath rises over it as a broad whoosh with the load and sighs out
 * through their valves on every lift.
 */
export const orkan: Voice = {
  seed: 734,
  combustion: {
    firing: crossPlaneV8,
    lope: 0.09,
    jitter: 0.09,
    banks: { gain: 0.88, ring: 1.12, delayMs: 0.7 },
    pulseMs: 1.8,
    headerHz: 480,
    roughness: 0.28,
    knock: 0,
    knockHz: 2400,
    chatter: 0.1,
    fan: null,
    pipeHz: 105,
    pipeRing: 0.45,
    exhaustHz: [650, 1700, 1500],
    silencerHz: 190,
    silencerDb: 8,
    rasp: 1.7,
    intakeHz: 240,
    intakeQ: 1.6,
    intake: 0.45,
    limiterHz: 9,
  },
  electric: null,
  turbo: {
    boostFrom: 0.24,
    spoolS: 0.55,
    whistleHz: [2000, 6800],
    whistle: 0.1,
    hiss: 0.16,
    blowOff: "valve",
    blowOffLevel: 0.85,
  },
  supercharger: null,
  overrun: { crackle: 1.2, antiLag: 0 },
  gearWhine: { teeth: 23, level: 0.012 },
  cabin: 0.08,
  level: 0.36,
  idleLevel: 0.45,
};
