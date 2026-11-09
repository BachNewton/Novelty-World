import { flatPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A twin-turbo flat-plane V8 just behind the seats, to 8,700: a hard, even shriek rather than a burble, the turbos'
 * whistle over it as they spool, a flutter when the throttle shuts, crackle on the overrun, and the intake's roar loud
 * in the cockpit.
 */
export const virvel: Voice = {
  seed: 733,
  combustion: {
    firing: flatPlaneV8,
    lope: 0.045,
    jitter: 0.07,
    banks: { gain: 0.94, ring: 1.07, delayMs: 0.35 },
    pulseMs: 0.95,
    headerHz: 760,
    roughness: 0.34,
    knock: 0,
    knockHz: 2400,
    chatter: 0.15,
    fan: null,
    pipeHz: 180,
    pipeRing: 0.42,
    exhaustHz: [1050, 3400, 2300],
    silencerHz: 380,
    silencerDb: 6,
    rasp: 2.9,
    intakeHz: 310,
    intakeQ: 2.4,
    intake: 0.85,
    limiterHz: 15,
  },
  electric: null,
  turbo: {
    boostFrom: 0.28,
    spoolS: 0.5,
    whistleHz: [2200, 7000],
    whistle: 0.09,
    hiss: 0.09,
    blowOff: "flutter",
    blowOffLevel: 0.7,
  },
  supercharger: null,
  overrun: { crackle: 3, antiLag: 0 },
  gearWhine: { teeth: 23, level: 0.02 },
  cabin: 0.12,
  level: 0.32,
  idleLevel: 0.42,
};
