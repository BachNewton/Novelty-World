import { inline } from "../firing";
import type { Voice } from "../vehicles";

/**
 * A 1980s Group B engine: a turbo five behind the seats on enormous boost, rough and warbling from its odd count, on a
 * short pipe with hardly a silencer. Its big old turbo spools late and slowly, so a stab of throttle is a wait and then
 * a roar under a screaming whistle, and every lift is a huge flutter and the anti-lag's bangs and crackle. A
 * straight-cut box whines under it, and the engine is a bulkhead behind the driver's head in a bare shell.
 */
export const frost: Voice = {
  seed: 1985,
  combustion: {
    firing: inline(5),
    lope: 0.14,
    jitter: 0.16,
    banks: { gain: 1, ring: 1, delayMs: 0 },
    pulseMs: 1.1,
    headerHz: 600,
    roughness: 0.46,
    knock: 0,
    knockHz: 2400,
    chatter: 0.25,
    fan: null,
    pipeHz: 145,
    pipeRing: 0.46,
    exhaustHz: [1250, 3600, 2700],
    silencerHz: 310,
    silencerDb: 5,
    rasp: 2.9,
    intakeHz: 290,
    intakeQ: 2.2,
    intake: 0.9,
    limiterHz: 12,
  },
  electric: null,
  turbo: {
    boostFrom: 0.38,
    spoolS: 1.35,
    whistleHz: [1600, 8500],
    whistle: 0.2,
    hiss: 0.16,
    blowOff: "flutter",
    blowOffLevel: 1.2,
  },
  supercharger: null,
  overrun: { crackle: 5, antiLag: 4 },
  gearWhine: { teeth: 21, level: 0.09 },
  cabin: 0.35,
  level: 0.37,
  idleLevel: 0.52,
};
