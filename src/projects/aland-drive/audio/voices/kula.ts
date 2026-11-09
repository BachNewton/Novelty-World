import { airCooledFlatFour } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A little air-cooled flat four hung behind the rear axle, revving slowly to 4,600: a chattering, thrumming clatter a
 * touch off the beat, each side's pair puffing into its own short pipe a moment apart, the cooling fan whining over the
 * top, and a thin, tinny exhaust with almost nothing to muffle it. In the cabin the engine is right behind the back seat.
 */
export const kula: Voice = {
  seed: 1938,
  combustion: {
    firing: airCooledFlatFour,
    lope: 0.16,
    jitter: 0.15,
    banks: { gain: 0.92, ring: 1.08, delayMs: 1.4 },
    pulseMs: 1.5,
    headerHz: 560,
    roughness: 0.34,
    knock: 0,
    knockHz: 2400,
    chatter: 0.55,
    fan: { order: 38, level: 0.18 },
    pipeHz: 175,
    pipeRing: 0.36,
    exhaustHz: [900, 1500, 1300],
    silencerHz: 380,
    silencerDb: 5,
    rasp: 1.7,
    intakeHz: 260,
    intakeQ: 1.6,
    intake: 0.45,
    limiterHz: 6,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 0.3, antiLag: 0 },
  gearWhine: { teeth: 21, level: 0.025 },
  cabin: 0.12,
  level: 0.35,
  idleLevel: 0.5,
};
