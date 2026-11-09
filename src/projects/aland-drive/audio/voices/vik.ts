import { inline } from "../firing";
import type { Voice } from "../vehicles";

/** A twin-carb four with no silencer to speak of: raspy and bright, the carburettors gasping, popping on the overrun, and all of it straight into the open cockpit. */
export const vik: Voice = {
  seed: 680,
  combustion: {
    firing: inline(4),
    lope: 0.12,
    jitter: 0.12,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 1.3,
    headerHz: 600,
    roughness: 0.35,
    knock: 0,
    knockHz: 2400,
    chatter: 0.25,
    fan: null,
    pipeHz: 150,
    pipeRing: 0.35,
    exhaustHz: [1200, 2800, 2000],
    silencerHz: 360,
    silencerDb: 4,
    rasp: 2.4,
    intakeHz: 300,
    intakeQ: 1.2,
    intake: 1,
    limiterHz: 9,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 2, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.02 },
  cabin: 1,
  level: 0.34,
  idleLevel: 0.45,
};
