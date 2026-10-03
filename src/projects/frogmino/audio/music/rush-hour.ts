import { BASS, LEAD, PAD, TICK } from "./instruments";
import type { Theme } from "./song";

const DM = "D2 . D3 . D2 . D3 .";
const F = "F2 . F3 . F2 . F3 .";
const GM = "G2 . G3 . G2 . G3 .";
const A = "A2 . A3 . A2 . A3 .";
const BB = "Bb2 . Bb3 . Bb2 . Bb3 .";
const C = "C3 . C4 . C3 . C4 .";
const TICKS = ". . x . . . x . | ".repeat(8);

export const RUSH_HOUR: Theme = {
  id: "rush-hour",
  name: "Rush Hour",
  use: "The main run loop, under the traffic.",
  mood: "Brisk and determined, a little cheeky: keep hopping.",
  style: [
    "Tetris (Game Boy): a brisk minor key in 2/4, with the raised seventh of the harmonic minor for an old-world folk colour",
    "Tetris (Game Boy): a driving bass pumping octaves in eighth notes, and offbeat chord stabs",
    "Russian folk dance: dotted figures and a phrase that winds down to the tonic and holds",
  ],
  key: "D minor",
  kind: "loop",
  bpm: 152,
  beatsPerBar: 2,
  instruments: [LEAD, BASS, PAD, TICK],
  patterns: [
    // A: Dm Dm Gm A | Dm Gm A Dm
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "D5 . . . A4 . D5 . | F5 . E5 . D5 . C#5 . | D5 . Bb4 . G4 . Bb4 D5 | C#5 . . . E5 . . . | F5 . . E5 D5 . A4 . | G4 . Bb4 . A4 . F4 . | E4 . G4 . C#5 . E5 . | D5 . . . - . . .",
      },
      { instrument: 1, pan: 0, notes: [DM, DM, GM, A, DM, GM, A, DM].join(" | ") },
      {
        instrument: 2,
        pan: 0.3,
        notes:
          ". . F4 - . . A4 - | . . F4 - . . A4 - | . . G4 - . . Bb4 - | . . E4 - . . G4 - | . . F4 - . . A4 - | . . G4 - . . Bb4 - | . . E4 - . . G4 - | . . F4 - . . A4 -",
      },
      { instrument: 3, pan: -0.3, notes: TICKS },
    ],
    // B: F C Bb A | Dm Gm A Dm
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "A4 . C5 . F5 . . . | E5 . D5 . C5 . G4 . | Bb4 . D5 . F5 . D5 . | E5 . C#5 . A4 . . . | D5 . F5 . A5 . . G5 | Bb5 . A5 . G5 . D5 . | E5 . F5 . G5 . C#5 . | D5 . . . - . . .",
      },
      { instrument: 1, pan: 0, notes: [F, C, BB, A, DM, GM, A, DM].join(" | ") },
      {
        instrument: 2,
        pan: 0.3,
        notes:
          ". . A4 - . . C5 - | . . G4 - . . C5 - | . . F4 - . . Bb4 - | . . E4 - . . A4 - | . . F4 - . . A4 - | . . G4 - . . Bb4 - | . . E4 - . . G4 - | . . F4 - . . A4 -",
      },
      { instrument: 3, pan: -0.3, notes: TICKS },
    ],
  ],
  sequence: [0, 0, 1, 0],
};
