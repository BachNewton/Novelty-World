import { inline } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A supercharged two-litre four to 8,800 on a short race exhaust: a hard, barking scream with the blower's whine over
 * it, a straight-cut gearbox singing under both, and the airbox right behind the driver's head in an open cockpit.
 */
export const span: Voice = {
  seed: 1913,
  combustion: {
    firing: inline(4),
    lope: 0.05,
    jitter: 0.07,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 0.9,
    headerHz: 820,
    roughness: 0.33,
    knock: 0,
    knockHz: 2400,
    chatter: 0.15,
    fan: null,
    pipeHz: 200,
    pipeRing: 0.38,
    exhaustHz: [1200, 3600, 2400],
    silencerHz: 440,
    silencerDb: 5,
    rasp: 2.8,
    intakeHz: 340,
    intakeQ: 2.8,
    intake: 1,
    limiterHz: 16,
  },
  electric: null,
  turbo: null,
  supercharger: { order: 12, level: 0.08 },
  overrun: { crackle: 3, antiLag: 0 },
  gearWhine: { teeth: 23, level: 0.08 },
  cabin: 1,
  level: 0.33,
  idleLevel: 0.44,
};
