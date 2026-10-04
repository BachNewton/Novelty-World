import { BASS, LEAD, PAD, TICK } from "./instruments";
import type { Theme } from "./song";

// The polka's oom-pah, in eighths: the bass on the beat, a chord tone off it.
const oom = (root: string, fifth: string): string => `${root} . . . ${fifth} . . .`;
const pah = (first: string, second: string): string => `. . ${first} - . . ${second} -`;

const DM = oom("D3", "A2");
const C = oom("C3", "G2");
const DM_PAH = pah("F4", "A4");
const C_PAH = pah("E4", "G4");

// The harmony of an eight-bar phrase, as a chord a bar.
const phrase = (chords: string, dm: string, c: string): string =>
  chords
    .split("")
    .map((chord) => (chord === "d" ? dm : c))
    .join(" | ");

const VERSE = "dccddccd";
const BRIDGE = "ddcdddcd";
const TICKS = ". . x . . . x . | ".repeat(8);

const backing = (chords: string) => [
  { instrument: 1, pan: 0, notes: phrase(chords, DM, C) },
  { instrument: 2, pan: 0.3, notes: phrase(chords, DM_PAH, C_PAH) },
  { instrument: 3, pan: -0.3, notes: TICKS },
];

export const FROG_POLKKA: Theme = {
  id: "frog-polkka",
  name: "Frog Polkka",
  use: "The main run loop, under the traffic: a candidate Frogmino theme.",
  mood: "Giddy and relentless: a village dance the frog can't stop hopping to.",
  style: [
    "Ievan Polkka: the traditional Finnish folk melody itself, in the public domain, as Tetris made a theme of the Russian Korobeiniki",
    "Finnish polka: a minor key in brisk 2/4, its tune swinging between D minor and C major",
    "An accordion band's oom-pah: the bass on the beat and a chord off it, with rapid repeated notes in the tune",
  ],
  key: "D minor",
  kind: "loop",
  bpm: 144,
  beatsPerBar: 2,
  instruments: [LEAD, BASS, PAD, TICK],
  patterns: [
    // The verse.
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "A5 - A5 - G5 - F5 F5 | E5 - C5 C5 C5 . E5 . | G5 - G5 G5 F5 . E5 . | F5 - D5 - D5 - F5 . | A5 A5 A5 A5 G5 . F5 . | E5 - C5 C5 C5 C5 E5 . | G5 G5 G5 . F5 - E5 E5 | F5 F5 D5 . D5 . . -",
      },
      ...backing(VERSE),
    ],
    // The second half, from the low A.
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "A4 - D5 - D5 . . E5 | F5 F5 D5 D5 D5 . F5 F5 | E5 - C5 - C5 - E5 - | F5 - D5 - D5 . D5 D5 | A4 - D5 - D5 . . E5 | F5 - D5 D5 . D5 D5 F5 | A5 A5 A5 G5 F5 - E5 - | F5 - D5 - D5 . D5 D5",
      },
      ...backing(BRIDGE),
    ],
    // The verse again, as the dance tune runs on to the cadence.
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "A5 . A5 . G5 . F5 . | E5 . C5 C5 . C5 C5 E5 | G5 G5 G5 G5 F5 F5 E5 E5 | F5 . D5 D5 . . . D5 | A5 . A5 . G5 . F5 . | E5 . C5 . C5 C5 C5 E5 | G5 G5 G5 G5 F5 . E5 . | F5 . D5 D5 . . - .",
      },
      ...backing(VERSE),
    ],
  ],
  sequence: [0, 1, 2],
};
