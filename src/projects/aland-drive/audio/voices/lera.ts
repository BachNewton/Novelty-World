import { inline } from "../firing";
import type { Voice } from "../vehicles";

/**
 * Hagel's road-going sibling: a two-litre turbo four with the rally car's hard, even beat, but through a road car's
 * silencer, so it is a deep, slightly gruff hum at a cruise that turns to a rasp only when it is worked. Its bigger turbo
 * comes in late and audibly, a rising whistle from about 3,000 rpm, and lets go in a flutter on a lift, since the
 * homologation special kept the rally car's dump valve; no anti-lag, only the odd pop at high revs. A road car's
 * gearbox, near silent, and a cabin with some deadening left in it.
 */
export const lera: Voice = {
  seed: 3119,
  combustion: {
    firing: inline(4),
    lope: 0.07,
    jitter: 0.09,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 1.15,
    headerHz: 620,
    roughness: 0.33,
    knock: 0,
    knockHz: 2400,
    chatter: 0.12,
    fan: null,
    pipeHz: 135,
    pipeRing: 0.44,
    exhaustHz: [800, 2200, 1900],
    silencerHz: 260,
    silencerDb: 7,
    rasp: 2.1,
    intakeHz: 300,
    intakeQ: 2,
    intake: 0.6,
    limiterHz: 9,
  },
  electric: null,
  turbo: {
    boostFrom: 0.32,
    spoolS: 0.65,
    whistleHz: [2200, 7200],
    whistle: 0.1,
    hiss: 0.09,
    blowOff: "flutter",
    blowOffLevel: 0.8,
  },
  supercharger: null,
  overrun: { crackle: 1, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.015 },
  cabin: 0.08,
  level: 0.32,
  idleLevel: 0.44,
};
