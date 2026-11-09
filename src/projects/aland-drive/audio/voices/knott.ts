import { inline } from "../firing";
import type { Voice } from "../vehicles";

/** A small petrol four on a short, plain exhaust: busy and buzzy, a bright rasp that climbs fast through short gears, an intake that hums in the cabin and a transfer box whining under it all. */
export const knott: Voice = {
  seed: 2318,
  combustion: {
    firing: inline(4),
    lope: 0.07,
    jitter: 0.11,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 1.0,
    headerHz: 660,
    roughness: 0.35,
    knock: 0,
    knockHz: 2400,
    chatter: 0.18,
    fan: null,
    pipeHz: 175,
    pipeRing: 0.38,
    exhaustHz: [900, 2000, 1600],
    silencerHz: 380,
    silencerDb: 6,
    rasp: 1.9,
    intakeHz: 340,
    intakeQ: 1.8,
    intake: 0.6,
    limiterHz: 9,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.045 },
  cabin: 0.12,
  level: 0.33,
  idleLevel: 0.45,
};
