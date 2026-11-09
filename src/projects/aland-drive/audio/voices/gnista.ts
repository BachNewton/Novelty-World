import type { Voice } from "../vehicles";

/**
 * Two motors, one on each axle, and no engine: their whine in its orders climbing hard with the speed, a race
 * inverter's high tones loud under full current, a straight-cut reduction gear whining over both, strong regeneration
 * on the lift, and a stripped cabin that lets it all in. Near silent at rest.
 */
export const gnista: Voice = {
  seed: 2213,
  combustion: null,
  electric: {
    rpmPerMS: null,
    orders: [
      [8, 1],
      [24, 0.5],
      [48, 0.22],
    ],
    level: 0.6,
    carrierHz: 4400,
    polePairs: 4,
    inverter: 0.2,
    regen: 0.6,
  },
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.1 },
  cabin: 0.3,
  level: 0.36,
  idleLevel: 0,
};
