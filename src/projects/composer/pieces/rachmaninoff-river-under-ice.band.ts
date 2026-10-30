import type { Band } from "../synth/band";

// The River Under the Ice as a synth orchestra, built so each line can be picked
// out: every part has its own slot in the spectrum and its own place left to
// right, the hall is kept off the low parts, and the piano and pads sink a little
// while the tune sounds. Nothing is doubled: the score's own unisons are thick
// enough. What the score calls cymbals and tolls are washes and blooms here.

export const RIVER_BAND: Band = {
  name: "Synth Orchestra",
  hall: { size: 0.72, wet: 0.13, damp: 0.6, preDelay: 0.03 },
  level: 0.269,
  tune: ["violins", "oboe", "flute", "trumpets"],
  chairs: {
    piano_right_hand: [{ instrument: "iron-concert", gain: 1.5, pan: 0.1, send: 0.3, keyPan: 0.22, lowCut: 180, duck: -7 }],
    piano_left_hand: [{ instrument: "iron-concert", gain: 1.25, pan: -0.14, send: 0.1, keyPan: 0.22, lowCut: 55, highCut: 2400, duck: -6 }],
    violins: [{ instrument: "cathedral-strings", gain: 2.1, pan: 0.32, send: 0.35, chorus: 0.2, lowCut: 320, highCut: 6000 }],
    cellos: [{ instrument: "dusk-lead", gain: 1.1, pan: -0.36, send: 0.2, lowCut: 170, highCut: 1800 }],
    strings_inner: [{ instrument: "juno-ensemble", gain: 0.4, pan: -0.02, send: 0.25, chorus: 0.3, lowCut: 260, highCut: 1500, duck: -5 }],
    oboe: [{ instrument: "hollow-reed", gain: 1.1, pan: 0.6, send: 0.3, lowCut: 420, highCut: 4000 }],
    clarinet: [{ instrument: "hollow-reed", gain: 1.1, pan: -0.62, send: 0.3, lowCut: 280, highCut: 3000 }],
    flute: [{ instrument: "air-voice", gain: 0.95, pan: 0.72, send: 0.35, lowCut: 560, highCut: 5000 }],
    french_horns: [{ instrument: "horn-section", gain: 1, pan: -0.52, send: 0.3, lowCut: 220, highCut: 1800 }],
    trumpets: [{ instrument: "vangelis-brass", gain: 1.7, pan: 0.46, send: 0.3, lowCut: 450, highCut: 5000 }],
    trombones: [{ instrument: "low-brass", gain: 0.55, pan: 0.2, send: 0.1, lowCut: 110, highCut: 1000, duck: -4 }],
    tolls: [{ instrument: "bloom-toll", gain: 0.5, pan: -0.1, send: 0.4, lowCut: 150, highCut: 900 }],
    basses: [{ instrument: "deep-sub", gain: 1.3, pan: 0, send: 0, highCut: 260 }],
    timpani: [{ instrument: "felt-drum", gain: 0.75, pan: -0.08, send: 0.05, highCut: 400 }],
    cymbals: [{ instrument: "surf-wash", gain: 0.45, pan: 0, send: 0.3, lowCut: 420, highCut: 2600 }],
  },
};
