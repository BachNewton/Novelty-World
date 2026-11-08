import { flatPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/** A flat-plane V8 to 9,000: each bank an even, screaming four, hard and high, a fast limiter and crackle on the lift. */
export const sund: Voice = {
  seed: 292,
  combustion: {
    firing: flatPlaneV8,
    lope: 0.04,
    jitter: 0.06,
    banks: { gain: 0.95, ring: 1.07, delayMs: 0.3 },
    pulseMs: 0.9,
    headerHz: 800,
    roughness: 0.3,
    knock: 0,
    knockHz: 2400,
    chatter: 0.2,
    fan: null,
    pipeHz: 190,
    pipeRing: 0.4,
    exhaustHz: [1100, 3400, 2200],
    silencerHz: 420,
    silencerDb: 5,
    rasp: 2.8,
    intakeHz: 330,
    intakeQ: 2.5,
    intake: 0.8,
    limiterHz: 16,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 4, antiLag: 0 },
  gearWhine: { teeth: 25, level: 0.02 },
  cabin: 0.15,
  level: 0.3,
  idleLevel: 0.42,
};
