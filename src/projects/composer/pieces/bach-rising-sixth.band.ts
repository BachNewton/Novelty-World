import type { Band } from "../synth/band";

// A concerto for quick synths in a small room: a struck electric keyboard for the
// soloist, hard enough to keep its fast notes apart, and clean chip lines for the
// strings, placed the way a small band stands, so the counterpoint can be followed.

export const RISING_SIXTH_BAND: Band = {
  hall: { size: 0.45, wet: 0.08, damp: 0.6, preDelay: 0.015 },
  level: 0.581,
  chairs: {
    violin_1: [{ instrument: "hollow-pulse", gain: 0.8, pan: 0.5, send: 0.4, lowCut: 300, highCut: 4500 }],
    violin_2: [{ instrument: "knot-reed", gain: 0.8, pan: -0.5, send: 0.4, lowCut: 260, highCut: 3800 }],
    viola: [{ instrument: "knot-reed", gain: 0.8, pan: 0.2, send: 0.3, lowCut: 180, highCut: 2800 }],
    cello_and_bass: [{ instrument: "round-wave", gain: 1, pan: -0.15, send: 0.1, highCut: 1400 }],
    harpsichord_right_hand: [{ instrument: "stage-electric", gain: 0.9, pan: 0.05, send: 0.25, keyPan: 0.2, lowCut: 200 }],
    harpsichord_left_hand: [{ instrument: "stage-electric", gain: 0.9, pan: -0.1, send: 0.2, keyPan: 0.2, lowCut: 90 }],
  },
};
