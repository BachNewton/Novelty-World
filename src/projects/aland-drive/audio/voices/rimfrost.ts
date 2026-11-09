import { inline } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A 1990s homologation saloon's two-litre turbo four: crisp and even rather than raw, on a road car's exhaust that
 * opens up under load but keeps its manners at idle. A medium turbo comes in from the middle of the revs with a clear
 * whistle, and a lift is a soft flutter with only the odd pop, no anti-lag: the road car's tune, not the stage car's.
 * A gentle whine from its four-wheel drive's transfer box, and a saloon's cabin keeps most of it outside.
 */
export const rimfrost: Voice = {
  seed: 1996,
  combustion: {
    firing: inline(4),
    lope: 0.06,
    jitter: 0.09,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 1.15,
    headerHz: 560,
    roughness: 0.3,
    knock: 0,
    knockHz: 2400,
    chatter: 0.14,
    fan: null,
    pipeHz: 130,
    pipeRing: 0.4,
    exhaustHz: [800, 2400, 1900],
    silencerHz: 290,
    silencerDb: 7,
    rasp: 1.9,
    intakeHz: 310,
    intakeQ: 1.8,
    intake: 0.55,
    limiterHz: 9,
  },
  electric: null,
  turbo: {
    boostFrom: 0.28,
    spoolS: 0.6,
    whistleHz: [2200, 7200],
    whistle: 0.1,
    hiss: 0.09,
    blowOff: "flutter",
    blowOffLevel: 0.7,
  },
  supercharger: null,
  overrun: { crackle: 1.2, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.03 },
  cabin: 0.06,
  level: 0.34,
  idleLevel: 0.44,
};
