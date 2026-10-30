import type { Band } from "../synth/band";

// A burglar on tiptoe: dark, close and dry, the plucks and the bass almost touching,
// each lead in its own place so a line handed round is seen to move. What the score
// calls a celesta is a short dark pluck here.

export const SPOON_THIEF_BAND: Band = {
  hall: { size: 0.35, wet: 0.06, damp: 0.6, preDelay: 0.012 },
  level: 0.807,
  tune: ["bassoon", "clarinet", "flute", "muted_trumpet"],
  chairs: {
    bassoon: [{ instrument: "knot-reed", gain: 1, pan: -0.3, send: 0.4, lowCut: 150, highCut: 2600 }],
    clarinet: [{ instrument: "knot-reed", gain: 0.9, pan: 0.35, send: 0.4, lowCut: 260, highCut: 3600 }],
    flute: [{ instrument: "air-voice", gain: 0.8, pan: 0.55, send: 0.5, lowCut: 500, highCut: 4500 }],
    muted_trumpet: [{ instrument: "brass-stab", gain: 0.7, pan: -0.5, send: 0.4, lowCut: 350, highCut: 3000 }],
    celesta: [{ instrument: "felt-pluck", gain: 0.7, pan: 0.6, send: 0.6, lowCut: 500, highCut: 2600 }],
    pizz: [{ instrument: "felt-pluck", gain: 0.9, pan: -0.15, send: 0.3, lowCut: 200, highCut: 2400 }],
    organ: [{ instrument: "drawn-organ", gain: 0.9, pan: 0.1, send: 0.5, lowCut: 140, highCut: 1800, duck: -3 }],
    double_bass_pizz: [{ instrument: "round-wave", gain: 1, pan: 0, send: 0, highCut: 900 }],
    kit: [{ instrument: "console-kit", gain: 0.7, pan: 0, send: 0.15 }],
  },
};
