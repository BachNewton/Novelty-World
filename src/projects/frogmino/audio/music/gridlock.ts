import { BASS, LEAD, PAD, THUMP, TICK } from "./instruments";
import type { Theme } from "./song";

const pump = (low: string, high: string): string => `${low} . ${high} . ${low} . ${high} .`;
const DM = pump("D2", "D3");
const EB = pump("Eb2", "Eb3");
const F = pump("F2", "F3");
const GM = pump("G2", "G3");
const A = pump("A2", "A3");
const TICKS = "x . x x x . x x | ".repeat(4);
const THUMPS = "x . . . x . . . | ".repeat(4);

export const GRIDLOCK: Theme = {
  id: "gridlock",
  name: "Gridlock",
  use: "The hard waves: a tense variant of Rush Hour for when the rows tighten.",
  mood: "Urgent and on edge, but still playful: the traffic is closing in.",
  style: [
    "Tetris (Game Boy): the music speeding up as the danger rises, here a faster cousin of Rush Hour on its opening figure",
    "Tetris (Game Boy): octave-pumping bass, now on a pedal that lurches up a half step for tension",
    "Driving sixteenth-note hi-hats and a kick on the beat, under long dissonant held tones",
  ],
  key: "D minor",
  kind: "loop",
  bpm: 176,
  beatsPerBar: 2,
  instruments: [LEAD, BASS, PAD, TICK, THUMP],
  patterns: [
    // X: Dm Dm A A
    [
      { instrument: 0, pan: 0, notes: "D5 . . . A4 . D5 . | F5 . E5 . F5 . A5 . | G5 . F5 . E5 . C#5 . | D5 . A4 . F4 . A4 ." },
      { instrument: 1, pan: 0, notes: [DM, DM, A, A].join(" | ") },
      { instrument: 2, pan: 0.3, notes: "A4 . . . . . . . | Bb4 . . . . . . . | C#5 . . . . . . . | A4 . . . . . . ." },
      { instrument: 3, pan: -0.3, notes: TICKS },
      { instrument: 4, pan: 0, notes: THUMPS },
    ],
    // Y: Eb Eb A A
    [
      { instrument: 0, pan: 0, notes: "Eb5 . . . Bb4 . Eb5 . | Gb5 . F5 . Gb5 . Bb5 . | A5 . G5 . F5 . E5 . | C#5 . E5 . A5 . . ." },
      { instrument: 1, pan: 0, notes: [EB, EB, A, A].join(" | ") },
      { instrument: 2, pan: 0.3, notes: "Bb4 . . . . . . . | Gb4 . . . . . . . | C#5 . . . . . . . | E4 . . . . . . ." },
      { instrument: 3, pan: -0.3, notes: TICKS },
      { instrument: 4, pan: 0, notes: THUMPS },
    ],
    // Z: F Gm A A
    [
      { instrument: 0, pan: 0, notes: "A5 . G5 . F5 . E5 . | F5 . E5 . D5 . C#5 . | D5 . E5 . F5 . G5 . | A5 . . . A4 . . ." },
      { instrument: 1, pan: 0, notes: [F, GM, A, A].join(" | ") },
      { instrument: 2, pan: 0.3, notes: "C5 . . . . . . . | Bb4 . . . . . . . | C#5 . . . . . . . | E5 . . . . . . ." },
      { instrument: 3, pan: -0.3, notes: TICKS },
      { instrument: 4, pan: 0, notes: THUMPS },
    ],
  ],
  sequence: [0, 1, 0, 2, 0, 1, 0, 2],
};
