import { crossPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A supercharged cross-plane V8 of seven litres and more up front: each bank lopes into its own pipe, so it burbles
 * deep at idle and turns to a hard, rasping bark under load, the blower's whine rising with the revs over it, and the
 * loud exhaust crackles and pops on every lift.
 */
export const varg: Voice = {
  seed: 1971,
  combustion: {
    firing: crossPlaneV8,
    lope: 0.12,
    jitter: 0.11,
    banks: { gain: 0.86, ring: 1.15, delayMs: 0.8 },
    pulseMs: 1.6,
    headerHz: 520,
    roughness: 0.36,
    knock: 0,
    knockHz: 2400,
    chatter: 0.1,
    fan: null,
    pipeHz: 105,
    pipeRing: 0.48,
    exhaustHz: [700, 2400, 2200],
    silencerHz: 190,
    silencerDb: 7,
    rasp: 2.5,
    intakeHz: 220,
    intakeQ: 1.6,
    intake: 0.55,
    limiterHz: 9,
  },
  electric: null,
  turbo: null,
  supercharger: { order: 11, level: 0.08 },
  overrun: { crackle: 3.5, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.012 },
  cabin: 0.1,
  level: 0.42,
  idleLevel: 0.55,
};
