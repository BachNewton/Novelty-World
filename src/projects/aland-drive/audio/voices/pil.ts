import { inline } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A two-litre turbo four in a hot hatch: an even, purposeful hum low down, a hard-edged rasp as the boost comes in,
 * the turbo's whistle and a valve's sigh on a lift, and a crisp pop from the tailpipes as the quick box changes up.
 */
export const pil: Voice = {
  seed: 4144,
  combustion: {
    firing: inline(4),
    lope: 0.05,
    jitter: 0.08,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 1.0,
    headerHz: 760,
    roughness: 0.3,
    knock: 0,
    knockHz: 2400,
    chatter: 0.1,
    fan: null,
    pipeHz: 175,
    pipeRing: 0.38,
    exhaustHz: [950, 3200, 2600],
    silencerHz: 440,
    silencerDb: 7,
    rasp: 2.4,
    intakeHz: 360,
    intakeQ: 2.4,
    intake: 0.75,
    limiterHz: 10,
  },
  electric: null,
  turbo: {
    boostFrom: 0.2,
    spoolS: 0.45,
    whistleHz: [2400, 7600],
    whistle: 0.08,
    hiss: 0.08,
    blowOff: "valve",
    blowOffLevel: 0.7,
  },
  supercharger: null,
  overrun: { crackle: 1.5, antiLag: 0, upshiftPops: 1 },
  gearWhine: { teeth: 21, level: 0.012 },
  cabin: 0.03,
  level: 0.33,
  idleLevel: 0.46,
};
