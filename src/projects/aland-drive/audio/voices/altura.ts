import { vee } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A free-breathing 1990s V12 behind a central seat, a throttle for each cylinder and short race headers: harder and
 * more mechanical than Dyning's grand-touring V12, its valve gear chattering at the driver's back and the intake
 * howling through the cabin's thin skin, the note tearing into a race car's wail at the top of the revs. A straight
 * box that whines a little, and a few pops on a lift.
 */
export const altura: Voice = {
  seed: 4471,
  combustion: {
    firing: vee(12),
    lope: 0.035,
    jitter: 0.08,
    banks: { gain: 0.92, ring: 1.08, delayMs: 0.35 },
    pulseMs: 0.8,
    headerHz: 900,
    roughness: 0.3,
    knock: 0,
    knockHz: 2400,
    chatter: 0.22,
    fan: null,
    pipeHz: 190,
    pipeRing: 0.4,
    exhaustHz: [1150, 4200, 2600],
    silencerHz: 440,
    silencerDb: 5,
    rasp: 2.7,
    intakeHz: 360,
    intakeQ: 2.6,
    intake: 0.95,
    limiterHz: 12,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 1.5, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.028 },
  cabin: 0.14,
  level: 0.33,
  idleLevel: 0.38,
};
