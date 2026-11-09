import type { Voice } from "../vehicles";

/**
 * Four motors, one at each wheel, and no engine: a whine lower than a saloon's motor, from fewer pole pairs, climbing
 * with the speed through one long gear to a scream at the motors' limit, four inverters singing over it under hard
 * current, and the straight-cut reduction gears whining under that. Almost nothing at rest.
 */
export const blixt: Voice = {
  seed: 1187,
  combustion: null,
  electric: {
    rpmPerMS: null,
    orders: [
      [6, 1],
      [12, 0.3],
      [18, 0.45],
      [36, 0.16],
    ],
    level: 0.6,
    carrierHz: 4800,
    polePairs: 3,
    inverter: 0.22,
    regen: 0.6,
  },
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.08 },
  cabin: 0.1,
  level: 0.38,
  idleLevel: 0,
};
