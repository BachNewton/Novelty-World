import { inline } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A 1.6-litre turbo four built for top-class rallying: hard, even and rasping on a short, open pipe, its turbo kept
 * spinning by anti-lag so it whistles from low revs and bangs on every lift, a straight-cut sequential box whining
 * under it, and the hybrid unit's motor singing with the speed, loudest as it harvests under braking. No deadening in a
 * stripped shell, so the cockpit hears it nearly whole.
 */
export const hagel: Voice = {
  seed: 2207,
  combustion: {
    firing: inline(4),
    lope: 0.09,
    jitter: 0.12,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 0.95,
    headerHz: 720,
    roughness: 0.4,
    knock: 0,
    knockHz: 2400,
    chatter: 0.15,
    fan: null,
    pipeHz: 175,
    pipeRing: 0.42,
    exhaustHz: [1100, 3400, 2400],
    silencerHz: 380,
    silencerDb: 6,
    rasp: 2.7,
    intakeHz: 340,
    intakeQ: 2.4,
    intake: 0.8,
    limiterHz: 16,
  },
  electric: {
    rpmPerMS: 210,
    orders: [
      [8, 0.8],
      [24, 0.35],
      [48, 0.12],
    ],
    level: 0.18,
    carrierHz: 3200,
    polePairs: 4,
    inverter: 0.07,
    regen: 0.8,
  },
  turbo: {
    boostFrom: 0.18,
    spoolS: 0.35,
    whistleHz: [2600, 8000],
    whistle: 0.14,
    hiss: 0.12,
    blowOff: "flutter",
    blowOffLevel: 1,
  },
  supercharger: null,
  overrun: { crackle: 4, antiLag: 4 },
  gearWhine: { teeth: 19, level: 0.08 },
  cabin: 0.3,
  level: 0.36,
  idleLevel: 0.48,
};
