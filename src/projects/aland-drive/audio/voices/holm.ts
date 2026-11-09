import { crossPlaneV8 } from "../firing";
import type { Voice } from "../vehicles";

/** A lazy cross-plane V8: each bank lopes, so the pipes burble at idle and rumble deep under load, and it never revs high. */
export const holm: Voice = {
  seed: 389,
  combustion: {
    firing: crossPlaneV8,
    lope: 0.12,
    jitter: 0.12,
    banks: { gain: 0.85, ring: 1.15, delayMs: 0.8 },
    pulseMs: 2,
    headerHz: 450,
    roughness: 0.3,
    knock: 0,
    knockHz: 2400,
    chatter: 0.12,
    fan: null,
    pipeHz: 95,
    pipeRing: 0.5,
    exhaustHz: [550, 1200, 1300],
    silencerHz: 170,
    silencerDb: 9,
    rasp: 2,
    intakeHz: 180,
    intakeQ: 1.5,
    intake: 0.5,
    limiterHz: 8,
  },
  electric: null,
  turbo: null,
  supercharger: null,
  overrun: { crackle: 1, antiLag: 0 },
  gearWhine: { teeth: 19, level: 0.01 },
  cabin: 0.1,
  level: 0.44,
  idleLevel: 0.55,
};
