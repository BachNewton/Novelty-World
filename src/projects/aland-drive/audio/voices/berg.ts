import { inline } from "../firing";
import type { Voice } from "../vehicles";

/** An old straight six that never revs: a low, muffled drone, a lazy beat, ticking tappets and a whining transfer box. */
export const berg: Voice = {
  seed: 874,
  combustion: {
    firing: inline(6),
    lope: 0.15,
    jitter: 0.14,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 2.2,
    headerHz: 420,
    roughness: 0.25,
    knock: 0,
    knockHz: 2400,
    chatter: 0.25,
    fan: null,
    pipeHz: 100,
    pipeRing: 0.45,
    exhaustHz: [550, 900, 900],
    silencerHz: 200,
    silencerDb: 9,
    rasp: 1.4,
    intakeHz: 180,
    intakeQ: 1.5,
    intake: 0.35,
    limiterHz: 6,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0, antiLag: 0 },
  gearWhine: { teeth: 17, level: 0.04 },
  cabin: 0.1,
  level: 0.37,
  idleLevel: 0.55,
};
