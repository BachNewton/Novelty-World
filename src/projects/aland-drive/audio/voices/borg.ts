import { crossPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A big twin-turbo cross-plane V8 in a tall luxury four-by-four, breathing out of short pipes that leave the sills
 * ahead of the rear wheels: the deepest, lumpiest of Valtor's V8s, its banks well apart so each pipe's lope is heard
 * at idle, a wide-open sports exhaust under load and a barrage of crackles off the side pipes on every lift. The
 * cabin is tall and well sealed, but the pipes are beside it, so more of the exhaust reaches the seat than in Flod.
 */
export const borg: Voice = {
  seed: 2207,
  combustion: {
    firing: crossPlaneV8,
    lope: 0.13,
    jitter: 0.11,
    banks: { gain: 0.84, ring: 1.16, delayMs: 0.85 },
    pulseMs: 2.1,
    headerHz: 420,
    roughness: 0.36,
    knock: 0,
    knockHz: 2400,
    chatter: 0.1,
    fan: null,
    pipeHz: 104,
    pipeRing: 0.5,
    exhaustHz: [780, 2800, 2300],
    silencerHz: 168,
    silencerDb: 9,
    rasp: 2.5,
    intakeHz: 215,
    intakeQ: 1.5,
    intake: 0.45,
    limiterHz: 8,
  },
  electric: null,
  turbo: {
    boostFrom: 0.24,
    spoolS: 0.65,
    whistleHz: [1700, 5800],
    whistle: 0.07,
    hiss: 0.16,
    blowOff: "valve",
    blowOffLevel: 0.8,
  },
  supercharger: null,
  overrun: { crackle: 2.8, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.014 },
  cabin: 0.1,
  level: 0.36,
  idleLevel: 0.52,
};
