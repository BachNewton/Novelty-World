import type { Band } from "../synth/band";

// A battle on the full chip: an overdriven lead, a slap bass, stabs and arpeggios
// hard to the sides, the only places the chip has, and no room to hide in.

export const TIDEWHEEL_GYM_BAND: Band = {
  name: "Full Chip",
  hall: { size: 0.25, wet: 0.05, damp: 0.6, preDelay: 0.01 },
  level: 0.572,
  tune: ["trumpets"],
  chairs: {
    trumpets: [{ instrument: "crunch-lead", gain: 0.8, pan: 0, send: 0.4, lowCut: 400, highCut: 5000 }],
    horns: [{ instrument: "brass-stab", gain: 0.8, pan: -0.45, send: 0.3, lowCut: 300, highCut: 3200, duck: -2 }],
    square_arp: [{ instrument: "tight-arp", gain: 0.7, pan: 0.7, send: 0.2, lowCut: 500, highCut: 4000, duck: -3 }],
    brass_stabs: [{ instrument: "brass-stab", gain: 0.8, pan: 0.45, send: 0.3, lowCut: 220, highCut: 2400, duck: -3 }],
    strings: [{ instrument: "hush-pad", gain: 0.6, pan: -0.7, send: 0.4, lowCut: 260, highCut: 2000, duck: -4 }],
    slap_bass: [{ instrument: "slap-bass", gain: 1, pan: 0, send: 0, highCut: 1800 }],
    kit: [{ instrument: "console-kit", gain: 0.8, pan: 0, send: 0.1 }],
  },
};
