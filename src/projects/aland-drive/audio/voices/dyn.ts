import { vee } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A big twin-turbo V6 of three and a half litres in a desert truck: each bank down its own turbo and its own pipe, so
 * it is gruff and uneven where a straight six would be smooth, a hard, loud bark under load through a short, barely
 * silenced exhaust, the turbos whooshing in early and loud, and a blow-off valve's psssh on every lift.
 */
export const dyn: Voice = {
  seed: 2207,
  combustion: {
    firing: vee(6),
    lope: 0.09,
    jitter: 0.1,
    banks: { gain: 0.88, ring: 1.12, delayMs: 0.6 },
    pulseMs: 1.5,
    headerHz: 500,
    roughness: 0.4,
    knock: 0,
    knockHz: 2400,
    chatter: 0.12,
    fan: null,
    pipeHz: 110,
    pipeRing: 0.46,
    exhaustHz: [750, 2000, 2000],
    silencerHz: 220,
    silencerDb: 6,
    rasp: 2.6,
    intakeHz: 230,
    intakeQ: 1.6,
    intake: 0.55,
    limiterHz: 8,
  },
  electric: null,
  turbo: {
    boostFrom: 0.2,
    spoolS: 0.55,
    whistleHz: [1900, 6400],
    whistle: 0.1,
    hiss: 0.16,
    blowOff: "valve",
    blowOffLevel: 1,
  },
  supercharger: null,
  overrun: { crackle: 1.2, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.03 },
  cabin: 0.08,
  level: 0.5,
  idleLevel: 0.5,
};
