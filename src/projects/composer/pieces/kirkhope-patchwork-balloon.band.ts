import type { Band } from "../synth/band";

// A waltz with air under it: more room than the other chip bands, a soft high voice
// for the flute's flying, plucks for the harp and the waltz's off-beats.

export const PATCHWORK_BALLOON_BAND: Band = {
  hall: { size: 0.5, wet: 0.1, damp: 0.6, preDelay: 0.02 },
  level: 0.548,
  tune: ["horns", "flute", "oboe", "trumpets"],
  chairs: {
    horns: [{ instrument: "brass-stab", gain: 0.9, pan: -0.3, send: 0.4, lowCut: 200, highCut: 2800 }],
    flute: [{ instrument: "air-voice", gain: 0.9, pan: 0.35, send: 0.5, lowCut: 500, highCut: 5000 }],
    oboe: [{ instrument: "knot-reed", gain: 0.9, pan: 0.55, send: 0.4, lowCut: 320, highCut: 4000 }],
    trumpets: [{ instrument: "brass-stab", gain: 0.9, pan: 0.2, send: 0.4, lowCut: 300, highCut: 3800 }],
    harp: [{ instrument: "felt-pluck", gain: 0.8, pan: -0.6, send: 0.5, lowCut: 220, highCut: 3500 }],
    strings: [{ instrument: "hush-pad", gain: 0.7, pan: 0.1, send: 0.5, lowCut: 200, highCut: 1800, duck: -3 }],
    strings_waltz: [{ instrument: "tight-arp", gain: 0.7, pan: -0.1, send: 0.3, lowCut: 200, highCut: 2400 }],
    cellos_basses: [{ instrument: "round-wave", gain: 1, pan: 0, send: 0, highCut: 1000 }],
    kit: [{ instrument: "console-kit", gain: 0.75, pan: 0, send: 0.2 }],
  },
};
