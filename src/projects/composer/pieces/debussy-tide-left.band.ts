import type { Band } from "../synth/band";

// A felt piano up close, with just enough room for held harmony to bloom.

export const TIDE_LEFT_BAND: Band = {
  hall: { size: 0.7, wet: 0.12, damp: 0.65, preDelay: 0.02 },
  level: 0.362,
  chairs: {
    right_hand: [{ instrument: "close-felt", gain: 1, pan: 0.06, send: 0.5, keyPan: 0.28, lowCut: 45 }],
    left_hand: [{ instrument: "close-felt", gain: 1, pan: -0.06, send: 0.35, keyPan: 0.28, lowCut: 35 }],
  },
};
