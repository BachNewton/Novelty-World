import type { Band } from "../synth/band";

// The same four channels, softer and in a little more room, for an evening. The
// bell figure is a dark pluck: no chime.

export const CEDARBELL_TOWN_BAND: Band = {
  hall: { size: 0.4, wet: 0.08, damp: 0.65, preDelay: 0.015 },
  level: 0.769,
  chairs: {
    pulse_1: [{ instrument: "hollow-pulse", gain: 0.9, pan: 0.25, send: 0.5, lowCut: 280, highCut: 3600 }],
    pulse_2: [{ instrument: "felt-pluck", gain: 1, pan: -0.35, send: 0.5, lowCut: 220, highCut: 3000 }],
    wave: [{ instrument: "round-wave", gain: 1, pan: 0, send: 0, highCut: 1000 }],
    noise: [{ instrument: "console-kit", gain: 0.5, pan: 0, send: 0.1 }],
  },
};
