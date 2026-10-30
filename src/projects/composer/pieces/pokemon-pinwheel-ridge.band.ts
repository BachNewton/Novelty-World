import type { Band } from "../synth/band";

// Four channels, as written: the pulses apart left and right, the wave and the noise
// in the middle, and next to no room.

export const PINWHEEL_RIDGE_BAND: Band = {
  hall: { size: 0.25, wet: 0.04, damp: 0.6, preDelay: 0.01 },
  level: 0.674,
  chairs: {
    pulse_1: [{ instrument: "hollow-pulse", gain: 0.9, pan: 0.3, send: 0.5, lowCut: 300, highCut: 4500 }],
    pulse_2: [{ instrument: "tight-arp", gain: 0.9, pan: -0.4, send: 0.4, lowCut: 220, highCut: 3800 }],
    wave: [{ instrument: "round-wave", gain: 1, pan: 0, send: 0, highCut: 1100 }],
    noise: [{ instrument: "console-kit", gain: 0.6, pan: 0, send: 0.1 }],
  },
};
