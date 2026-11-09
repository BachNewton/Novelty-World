import { crossPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A 1970s big-block cross-plane V8 of seven and a half litres on a four-barrel carburettor and a lumpy cam: each bank
 * lopes into its own pipe through silencers that barely slow it, so it idles in a lazy, uneven burble, booms deep
 * and loud under load with the carburettor roaring into the cabin, and pops on every lift. No turbo, no blower; the
 * old valve gear ticks.
 */
export const kraft: Voice = {
  seed: 1970,
  combustion: {
    firing: crossPlaneV8,
    lope: 0.16,
    jitter: 0.14,
    banks: { gain: 0.84, ring: 1.16, delayMs: 0.9 },
    pulseMs: 2.2,
    headerHz: 420,
    roughness: 0.34,
    knock: 0,
    knockHz: 2400,
    chatter: 0.26,
    fan: null,
    pipeHz: 90,
    pipeRing: 0.5,
    exhaustHz: [800, 1800, 2400],
    silencerHz: 175,
    silencerDb: 4,
    rasp: 2.8,
    intakeHz: 190,
    intakeQ: 1.4,
    intake: 0.8,
    limiterHz: 7,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 4.5, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.012 },
  cabin: 0.16,
  level: 0.58,
  idleLevel: 0.58,
};
