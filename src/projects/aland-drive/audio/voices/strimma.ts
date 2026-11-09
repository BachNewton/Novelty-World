import { vee } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A free-breathing flat six to 9,000, behind the seats: its two sides fire in turn into headers a little unequal, so a
 * metallic, faintly gruff beat low down hardens into a clean wail up top, the airbox howling at the driver's back and
 * the valve gear ticking. A few pops on a lift.
 */
export const strimma: Voice = {
  seed: 1907,
  combustion: {
    firing: vee(6),
    lope: 0.05,
    jitter: 0.07,
    banks: { gain: 0.93, ring: 1.08, delayMs: 0.6 },
    pulseMs: 0.8,
    headerHz: 760,
    roughness: 0.28,
    knock: 0,
    knockHz: 2400,
    chatter: 0.18,
    fan: null,
    pipeHz: 185,
    pipeRing: 0.45,
    exhaustHz: [1050, 3800, 2400],
    silencerHz: 400,
    silencerDb: 7,
    rasp: 2.8,
    intakeHz: 300,
    intakeQ: 2.4,
    intake: 0.9,
    limiterHz: 13,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 2.5, antiLag: 0 },
  gearWhine: { teeth: 23, level: 0.02 },
  cabin: 0.12,
  level: 0.4,
  idleLevel: 0.44,
};
