import type { Band } from "../synth/band";

// A village band on the chip: the oompah tight in the middle, reeds and brass out
// to the sides, almost no room, and only the piccolo soft, since a high line must be.

export const TURNIP_FAIR_BAND: Band = {
  hall: { size: 0.35, wet: 0.06, damp: 0.6, preDelay: 0.012 },
  level: 0.618,
  tune: ["clarinet", "piccolo", "muted_trumpet"],
  chairs: {
    clarinet: [{ instrument: "knot-reed", gain: 1, pan: -0.35, send: 0.4, lowCut: 280, highCut: 4000 }],
    piccolo: [{ instrument: "air-voice", gain: 0.8, pan: 0.5, send: 0.5, lowCut: 700, highCut: 5000 }],
    muted_trumpet: [{ instrument: "brass-stab", gain: 0.8, pan: 0.3, send: 0.4, lowCut: 300, highCut: 3200 }],
    banjo: [{ instrument: "felt-pluck", gain: 0.8, pan: -0.55, send: 0.3, lowCut: 300, highCut: 3500 }],
    horns: [{ instrument: "hush-pad", gain: 0.7, pan: 0.15, send: 0.5, lowCut: 220, highCut: 1800, duck: -3 }],
    tuba: [{ instrument: "round-wave", gain: 1, pan: 0, send: 0, highCut: 1000 }],
    kit: [{ instrument: "console-kit", gain: 0.75, pan: 0, send: 0.1 }],
  },
};
