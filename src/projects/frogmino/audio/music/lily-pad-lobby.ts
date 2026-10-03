import { BASS, LEAD, PAD } from "./instruments";
import type { Theme } from "./song";

// The oom: the chord's root on beats one and three, its fifth between.
const oom = (root: string, fifth: string): string => `${root} . . . ${fifth} . . . ${root} . . . ${fifth} . . .`;
// The pah: a short chord tone on beats two and four.
const pah = (first: string, second = first): string => `. . . . ${first} - . . . . . . ${second} - . .`;

const F = oom("F2", "C3");
const C7 = oom("C3", "G2");
const BB = oom("Bb2", "F2");
const G7 = oom("G2", "D3");
const F_BB = "F2 . . . C3 . . . Bb2 . . . F2 . . .";
const C7_F = "C3 . . . G2 . . . F2 . . . C3 . . .";

const OPENING = "C5 - . . F5 - . . A5 - G5 - F5 . . . | E5 - . . G5 - . . Bb5 - A5 - G5 . . .";

export const LILY_PAD_LOBBY: Theme = {
  id: "lily-pad-lobby",
  name: "Lily Pad Lobby",
  use: "The lobby and menus, while players gather.",
  mood: "Sunny, bouncy and unhurried: a frog idling on a lily pad.",
  style: [
    "Frogger (arcade): a cheerful major-key march with an oom-pah bass",
    "Frogger (arcade): short staccato notes and leaps up the chord, a hop in every bar",
    "Children's-song simplicity: four-bar phrases on plain tonic and dominant harmony",
  ],
  key: "F major",
  kind: "loop",
  bpm: 116,
  beatsPerBar: 4,
  instruments: [LEAD, BASS, PAD, PAD],
  patterns: [
    // A: F C7 F C7
    [
      {
        instrument: 0,
        pan: 0,
        notes: `${OPENING} | A5 - . . C6 - . . A5 - F5 - D5 - C5 - | E5 - G4 - . . C5 - F5 . . . - . . .`,
      },
      { instrument: 1, pan: 0, notes: [F, C7, F, C7].join(" | ") },
      { instrument: 2, pan: -0.4, notes: [pah("A4"), pah("E4"), pah("A4"), pah("E4")].join(" | ") },
      { instrument: 3, pan: 0.4, notes: [pah("C5"), pah("Bb4"), pah("C5"), pah("Bb4")].join(" | ") },
    ],
    // A': F C7 F-Bb C7-F
    [
      {
        instrument: 0,
        pan: 0,
        notes: `${OPENING} | A5 - . . C6 - . . D6 - C6 - A5 - . . | G5 - E5 - C5 - E5 - F5 . . . - . . .`,
      },
      { instrument: 1, pan: 0, notes: [F, C7, F_BB, C7_F].join(" | ") },
      { instrument: 2, pan: -0.4, notes: [pah("A4"), pah("E4"), pah("A4", "Bb4"), pah("E4", "A4")].join(" | ") },
      { instrument: 3, pan: 0.4, notes: [pah("C5"), pah("Bb4"), pah("C5", "D5"), pah("Bb4", "C5")].join(" | ") },
    ],
    // B: Bb F G7 C7
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "D5 - D5 - . . F5 - . . D5 - Bb4 . . . | C5 - C5 - . . F5 - . . A5 - . . . . | B4 - D5 - G5 - . . F5 - D5 - B4 . . . | C5 - . . E5 - . . G5 - Bb5 - . . . .",
      },
      { instrument: 1, pan: 0, notes: [BB, F, G7, C7].join(" | ") },
      { instrument: 2, pan: -0.4, notes: [pah("Bb4"), pah("A4"), pah("B4"), pah("E4")].join(" | ") },
      { instrument: 3, pan: 0.4, notes: [pah("D5"), pah("C5"), pah("F5"), pah("Bb4")].join(" | ") },
    ],
  ],
  sequence: [0, 1, 2, 1],
};
