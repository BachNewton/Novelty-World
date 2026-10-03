import { BASS, BELL, LEAD, PAD, THUMP } from "./instruments";
import type { Theme } from "./song";

// The two jingles: short, played once, for moments rather than for a mood.

export const GATE_SHIMMER: Theme = {
  id: "gate-shimmer",
  name: "Gate Shimmer",
  use: "A gate jingle, as the frog becomes the gate's piece (a fuller take on the gate sound).",
  mood: "Magical and quick: a sparkle that rises and rings out.",
  style: [
    "Frogger (arcade): a short arcade jingle marking an event, over in a breath",
    "A rising arpeggio with the lydian raised fourth (F#), the classic sound of a transformation",
    "Bell echoes that fade down, echoing the gate sound's sparkle",
  ],
  key: "C lydian",
  kind: "jingle",
  bpm: 140,
  beatsPerBar: 4,
  instruments: [BELL, PAD, BASS],
  patterns: [
    [
      { instrument: 0, pan: 0, notes: "C5 E5 G5 B5 D6 F#6 . . G6 . . . . . . . | B6.3 . . . G6.5 . . . . . . . . . . ." },
      { instrument: 1, pan: -0.3, notes: "E4 . . . . . . . G4 . . . . . . . | B4.4 . . . . . . . . . . . . . . ." },
      { instrument: 2, pan: 0, notes: "C3 . . . . . . . . . . . . . . . | C3.5 . . . . . . . . . . . . . . ." },
    ],
  ],
  sequence: [0],
};

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
