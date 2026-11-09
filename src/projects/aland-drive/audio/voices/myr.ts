import type { Voice } from "../vehicles";

/**
 * Two big motors, one on each axle, and no engine: a deep hum from few pole pairs, climbing through one long gear to
 * a low whine at the limit, rather than Gnista's scream; quiet road inverters under it, a helical reduction gear
 * barely heard, and a sealed, heavy cab, so on the move its tyres and the wind are most of what's heard. Silent at rest.
 */
export const myr: Voice = {
  seed: 3301,
  combustion: null,
  electric: {
    rpmPerMS: null,
    orders: [
      [4, 1],
      [12, 0.32],
      [24, 0.14],
    ],
    level: 0.45,
    carrierHz: 2600,
    polePairs: 2,
    inverter: 0.06,
    regen: 0.45,
  },
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0, antiLag: 0 },
  gearWhine: { teeth: 23, level: 0.03 },
  cabin: 0,
  level: 0.32,
  idleLevel: 0,
};
