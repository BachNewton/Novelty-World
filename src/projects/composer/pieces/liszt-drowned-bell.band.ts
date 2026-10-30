import type { Band } from "../synth/band";

// A big dark grand in a large room: the piece is written to the limits of the keyboard.

export const DROWNED_BELL_BAND: Band = {
  hall: { size: 0.8, wet: 0.17, damp: 0.55, preDelay: 0.03 },
  level: 0.256,
  chairs: {
    right_hand: [{ instrument: "iron-concert", gain: 1, pan: 0.06, send: 0.5, keyPan: 0.28, lowCut: 45 }],
    left_hand: [{ instrument: "iron-concert", gain: 1, pan: -0.06, send: 0.3, keyPan: 0.28, lowCut: 35 }],
  },
};
