import { BASS, LEAD, PAD, THUMP } from "./instruments";
import type { Theme } from "./song";

// The jingles: short, played once, for moments rather than for a mood.

export const GANTRY_FANFARE: Theme = {
  id: "gantry-fanfare",
  name: "Gantry Fanfare",
  use: "The finish, as the frog lands on the gantry (a fuller take on the finish sound).",
  mood: "Proud and bright, a little silly: made it!",
  style: [
    "Frogger (arcade): a bright major-key stage-clear tune, short and bouncy",
    "A brass-band fanfare's repeated opening notes and a march bass, in triangle and sine rather than brass",
    "Two voices in thirds climbing to the top note, with a kick on the strong beats",
  ],
  key: "C major",
  kind: "jingle",
  bpm: 120,
  beatsPerBar: 4,
  instruments: [LEAD, PAD, BASS, THUMP],
  patterns: [
    [
      { instrument: 0, pan: 0, notes: "C5 - C5 - D5 - E5 . G5 - . . E5 . . . | F5 - A5 - G5 - E5 - C6 . . . . . . ." },
      { instrument: 1, pan: 0.3, notes: "E4 - E4 - G4 - G4 . C5 - . . G4 . . . | C5 - F5 - E5 - C5 - E5 . . . . . . ." },
      { instrument: 2, pan: 0, notes: "C3 . . . . . . . G2 . . . C3 . . . | F2 . . . G2 . . . C3 . . . . . . ." },
      { instrument: 3, pan: 0, notes: "x . . . . . . . x . . . . . . . | x . . . x . . . x . . . . . . ." },
    ],
  ],
  sequence: [0],
};
