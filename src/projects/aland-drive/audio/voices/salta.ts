import { inline } from "../firing";
import type { Voice } from "../vehicles";

/** A tired four: lumpy and uneven, muffled, its tappets ticking, out of breath early. */
export const salta: Voice = {
  seed: 583,
  combustion: {
    firing: inline(4),
    lope: 0.25,
    jitter: 0.18,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 2,
    headerHz: 450,
    roughness: 0.3,
    knock: 0,
    knockHz: 2400,
    chatter: 0.3,
    fan: null,
    pipeHz: 120,
    pipeRing: 0.4,
    exhaustHz: [650, 800, 900],
    silencerHz: 230,
    silencerDb: 8,
    rasp: 1.5,
    intakeHz: 220,
    intakeQ: 1.5,
    intake: 0.4,
    limiterHz: 7,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.02 },
  cabin: 0.05,
  level: 0.37,
  idleLevel: 0.52,
};
