import type { Band } from "../synth/band";

// The River Under the Ice on the Sketchbook family: plain clear voices, each line
// one clean tone in its own place, a small short room, little above 6 kHz, and a
// real held floor: the basses' pedals drone on Ground Drone and the trombones
// stand on Standing Bass. Every note of the score is here, undoubled.

export const RIVER_SKETCHBOOK_BAND: Band = {
  name: "Sketchbook",
  hall: { size: 0.32, wet: 0.09, damp: 0.6, preDelay: 0.012 },
  level: 0.274,
  tune: ["violins", "oboe", "flute", "trumpets"],
  chairs: {
    piano_right_hand: [{ instrument: "cottage-keys", gain: 1.5, pan: 0.08, send: 0.2, keyPan: 0.2, lowCut: 160, highCut: 5600, duck: -5 }],
    piano_left_hand: [{ instrument: "cottage-keys", gain: 1.3, pan: -0.12, send: 0.1, keyPan: 0.2, lowCut: 70, highCut: 4200, duck: -4 }],
    violins: [{ instrument: "ribbon-strings", gain: 1.5, pan: 0.3, send: 0.28, lowCut: 300, highCut: 5600 }],
    cellos: [{ instrument: "ribbon-strings", gain: 1, pan: -0.36, send: 0.2, lowCut: 130, highCut: 4200 }],
    strings_inner: [{ instrument: "ribbon-strings", gain: 0.42, pan: -0.04, send: 0.25, lowCut: 200, highCut: 3400, duck: -4 }],
    oboe: [{ instrument: "apple-reed", gain: 0.95, pan: 0.58, send: 0.25, lowCut: 380, highCut: 5000 }],
    clarinet: [{ instrument: "apple-reed", gain: 0.9, pan: -0.6, send: 0.25, lowCut: 240, highCut: 4600 }],
    flute: [{ instrument: "meadow-flute", gain: 0.9, pan: 0.72, send: 0.3, lowCut: 500, highCut: 5600 }],
    french_horns: [{ instrument: "morning-brass", gain: 0.62, pan: -0.5, send: 0.25, lowCut: 200, highCut: 4200 }],
    trumpets: [{ instrument: "morning-brass", gain: 1.05, pan: 0.44, send: 0.25, lowCut: 400, highCut: 5600 }],
    trombones: [{ instrument: "standing-bass", gain: 0.3, pan: 0.2, send: 0.08, lowCut: 70, highCut: 1500, duck: -3 }],
    tolls: [{ instrument: "thumb-pluck", gain: 0.6, pan: -0.14, send: 0.35, lowCut: 200, highCut: 2400 }],
    basses: [{ instrument: "ground-drone", gain: 0.62, pan: 0, send: 0, highCut: 1500 }],
    timpani: [{ instrument: "hill-drum", gain: 0.6, pan: -0.08, send: 0.05, highCut: 1400 }],
    cymbals: [{ instrument: "sketch-kit", gain: 0.5, pan: 0.05, send: 0.2, lowCut: 500, highCut: 5600 }],
  },
};
