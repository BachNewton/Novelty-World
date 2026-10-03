import { BASS, LEAD, SINE_LEAD, TICK } from "./instruments";
import type { Theme } from "./song";

const walk = (root: string, fifth: string): string => `${root} . . . ${fifth} . . . ${root} . . . ${fifth} . . .`;
const G = walk("G2", "D3");
const C = walk("C3", "G2");
const D = walk("D3", "A2");
const EM = walk("E2", "B2");
// A then D, over Am-D and A7-D alike.
const A_D = "A2 . . . E3 . . . D3 . . . A2 . . .";
const D7 = "D3 . . . A2 . . . D3 . . . C3 . . .";

const REST = ". . . . . . . . . . . . . . . .";
const TICKS = ". . x . . . x . . . x . . . x . | ".repeat(4);
const CALL = "G4 - B4 - D5 - . . G5 - . . . . . .";

// Sprout (P1) on the left, Splash (P2) on the right.
const SPROUT = { instrument: 0, pan: -0.6 };
const SPLASH = { instrument: 1, pan: 0.6 };

export const TWO_FROGS: Theme = {
  id: "two-frogs",
  name: "Two Frogs, One Road",
  use: "Co-op: the waiting room, or the run when two frogs share the road.",
  mood: "Friendly and chatty: one frog calls, the other answers, then they hop together.",
  style: [
    "Game Boy music generally: two lead voices panned apart, as on the Game Boy's two pulse channels",
    "Frogger (arcade): a bouncy major key, staccato arpeggio hops up and down",
    "Call and response that ends in the two voices moving together in thirds",
  ],
  key: "G major",
  kind: "loop",
  bpm: 132,
  beatsPerBar: 4,
  instruments: [LEAD, SINE_LEAD, BASS, TICK],
  patterns: [
    // A: G C D G. Sprout calls, Splash answers.
    [
      { ...SPROUT, notes: `${CALL} | E5 - . . C5 - . . E5 - D5 - C5 . . . | ${REST} | ${REST}` },
      { ...SPLASH, notes: `${REST} | ${REST} | A5 - F#5 - D5 - . . A4 - . . . . . . | B4 - . . D5 - . . B4 - C5 - D5 . . .` },
      { instrument: 2, pan: 0, notes: [G, C, D, G].join(" | ") },
      { instrument: 3, pan: 0, notes: TICKS },
    ],
    // A': G Em Am-D G
    [
      { ...SPROUT, notes: `${CALL} | E5 - . . G5 - . . B5 - A5 - G5 . . . | ${REST} | ${REST}` },
      { ...SPLASH, notes: `${REST} | ${REST} | C6 - A5 - E5 - . . F#5 - . . D5 . . . | G5 - . . D5 - . . G4 . . . - . . .` },
      { instrument: 2, pan: 0, notes: [G, EM, A_D, G].join(" | ") },
      { instrument: 3, pan: 0, notes: TICKS },
    ],
    // B: C G A7-D D7. Together, in thirds.
    [
      {
        ...SPROUT,
        notes:
          "E5 . . . G5 . . . C6 . . . G5 . . . | D5 . . . B4 . . . D5 . . . G5 . . . | C#5 . E5 . A5 . . . F#5 . E5 . D5 . . . | D5 - F#5 - A5 - C6 - B5 . . . A5 . . .",
      },
      {
        ...SPLASH,
        notes:
          "C5 . . . E5 . . . A5 . . . E5 . . . | B4 . . . G4 . . . B4 . . . D5 . . . | A4 . C#5 . E5 . . . D5 . C#5 . A4 . . . | F#4 - A4 - C5 - F#5 - G5 . . . F#5 . . .",
      },
      { instrument: 2, pan: 0, notes: [C, G, A_D, D7].join(" | ") },
      { instrument: 3, pan: 0, notes: TICKS },
    ],
  ],
  sequence: [0, 1, 2, 1],
};
