import { vee } from "../firing";
import type { Voice } from "../vehicles";

/** A V12: so many firings the note is a seamless tearing silk, sealed away in a quiet cabin at a cruise. */
export const ankar: Voice = {
  seed: 1068,
  combustion: {
    firing: vee(12),
    lope: 0.03,
    jitter: 0.05,
    banks: { gain: 0.95, ring: 1.05, delayMs: 0.2 },
    pulseMs: 1.3,
    headerHz: 700,
    roughness: 0.2,
    knock: 0,
    knockHz: 2400,
    chatter: 0.08,
    fan: null,
    pipeHz: 120,
    pipeRing: 0.35,
    exhaustHz: [800, 2400, 1500],
    silencerHz: 320,
    silencerDb: 5,
    rasp: 1.6,
    intakeHz: 260,
    intakeQ: 1.5,
    intake: 0.5,
    limiterHz: 9,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0.5, antiLag: 0 },
  gearWhine: { teeth: 23, level: 0.008 },
  cabin: 0,
  level: 0.38,
  idleLevel: 0.32,
};
