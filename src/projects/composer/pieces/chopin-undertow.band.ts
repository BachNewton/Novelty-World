import type { Band } from "../synth/band";

// A clear grand in a smaller, drier room, so a fast figuration keeps its separate notes.

export const UNDERTOW_BAND: Band = {
  hall: { size: 0.55, wet: 0.09, damp: 0.5, preDelay: 0.018 },
  level: 0.369,
  chairs: {
    right_hand: [{ instrument: "clear-salon", gain: 1, pan: 0.06, send: 0.4, keyPan: 0.28, lowCut: 45 }],
    left_hand: [{ instrument: "clear-salon", gain: 1, pan: -0.06, send: 0.2, keyPan: 0.28, lowCut: 35 }],
  },
};
