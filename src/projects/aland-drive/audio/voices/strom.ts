import type { Voice } from "../vehicles";

/** No firings: the motor's whine in its orders rising with the speed, the inverter's tones under hard current, the reduction gear's whine, almost nothing at rest. */
export const strom: Voice = {
  seed: 971,
  combustion: null,
  electric: {
    rpmPerMS: null,
    orders: [
      [8, 1],
      [24, 0.4],
      [48, 0.15],
    ],
    level: 0.5,
    carrierHz: 3600,
    polePairs: 4,
    inverter: 0.12,
    regen: 0.5,
  },
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0, antiLag: 0 },
  gearWhine: { teeth: 17, level: 0.1 },
  cabin: 0,
  level: 0.36,
  idleLevel: 0,
};
