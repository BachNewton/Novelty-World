import { vee } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A naturally aspirated V12 in a grand tourer: twelve even firings, a smooth deep hum at a cruise that opens, past
 * 6,000, into a high, tearing wail through a sports exhaust and an intake that howls; harder and more open-throated
 * than Ankar's sealed silk, with a soft crackle on a lift and a transaxle's faint whine behind the seats.
 */
export const dyning: Voice = {
  seed: 3112,
  combustion: {
    firing: vee(12),
    lope: 0.03,
    jitter: 0.06,
    banks: { gain: 0.93, ring: 1.07, delayMs: 0.3 },
    pulseMs: 1.0,
    headerHz: 760,
    roughness: 0.25,
    knock: 0,
    knockHz: 2400,
    chatter: 0.1,
    fan: null,
    pipeHz: 140,
    pipeRing: 0.4,
    exhaustHz: [950, 3400, 2200],
    silencerHz: 380,
    silencerDb: 6,
    rasp: 2.2,
    intakeHz: 300,
    intakeQ: 2,
    intake: 0.75,
    limiterHz: 10,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 1.2, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.012 },
  cabin: 0.1,
  level: 0.36,
  idleLevel: 0.34,
};
