import { vee } from "../firing";
import type { Voice } from "../vehicles";

/** A V6: the same firings as a six but gruffer from its two banks, a growl rather than a scream, heard straight through the open top. */
export const bris: Voice = {
  seed: 1165,
  combustion: {
    firing: vee(6),
    lope: 0.08,
    jitter: 0.08,
    banks: { gain: 0.9, ring: 1.1, delayMs: 0.5 },
    pulseMs: 1.4,
    headerHz: 560,
    roughness: 0.3,
    knock: 0,
    knockHz: 2400,
    chatter: 0.12,
    fan: null,
    pipeHz: 120,
    pipeRing: 0.45,
    exhaustHz: [800, 2000, 1600],
    silencerHz: 280,
    silencerDb: 7,
    rasp: 2.1,
    intakeHz: 260,
    intakeQ: 2,
    intake: 0.5,
    limiterHz: 10,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 1.5, antiLag: 0 },
  gearWhine: { teeth: 23, level: 0.01 },
  cabin: 0.8,
  level: 0.44,
  idleLevel: 0.48,
};
