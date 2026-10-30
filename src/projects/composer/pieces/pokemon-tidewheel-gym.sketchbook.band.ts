import type { Band } from "../synth/band";

// The Tidewheel Gym on the Sketchbook family: the same battle with the overdrive
// gone, clear brass over a strong plain bass, parts apart left to right, and a
// small room just big enough to take the edge off.

export const TIDEWHEEL_GYM_SKETCHBOOK_BAND: Band = {
  name: "Sketchbook",
  hall: { size: 0.28, wet: 0.08, damp: 0.6, preDelay: 0.01 },
  level: 0.724,
  tune: ["trumpets"],
  chairs: {
    trumpets: [{ instrument: "morning-brass", gain: 1, pan: 0, send: 0.28, lowCut: 380, highCut: 5600 }],
    horns: [{ instrument: "ribbon-strings", gain: 0.75, pan: -0.45, send: 0.28, lowCut: 300, highCut: 4600, duck: -2 }],
    square_arp: [{ instrument: "thumb-pluck", gain: 0.6, pan: 0.68, send: 0.2, lowCut: 500, highCut: 5000, duck: -3 }],
    brass_stabs: [{ instrument: "morning-brass", gain: 0.6, pan: 0.42, send: 0.25, lowCut: 200, highCut: 4200, duck: -3 }],
    strings: [{ instrument: "apple-reed", gain: 0.45, pan: -0.68, send: 0.3, lowCut: 240, highCut: 4200, duck: -4 }],
    slap_bass: [{ instrument: "standing-bass", gain: 0.62, pan: 0, send: 0, highCut: 1800 }],
    kit: [{ instrument: "sketch-kit", gain: 0.7, pan: 0, send: 0.08, highCut: 5800 }],
  },
};
