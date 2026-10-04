import { Shape } from "../sounds";
import { BASS, PAD } from "./instruments";
import type { Instrument, Theme } from "./song";

// A reedy, kazoo-like lead: a saw softened by a low-pass, short and perky.
const REED: Instrument = {
  name: "Reed",
  base: "B4",
  zzfx: {
    volume: 0.4,
    attack: 0.008,
    decay: 0.05,
    sustain: 0.1,
    sustainVolume: 0.55,
    release: 0.07,
    shape: Shape.saw,
    filter: -2000,
  },
};

// A marimba: a sine struck and left to ring away.
const MARIMBA: Instrument = {
  name: "Marimba",
  base: "B4",
  zzfx: { volume: 0.7, attack: 0.002, decay: 0.14, sustainVolume: 0, release: 0.04 },
};

// A comedy boing: a sine sliding up as it plays.
const BOING: Instrument = {
  name: "Boing",
  base: "B3",
  zzfx: { volume: 0.35, attack: 0.005, sustain: 0.06, release: 0.1, slide: 0.6, filter: -2500 },
};

// The pah: chord tones on beats two and four, one half-bar chord each.
const pah = (first: string, second = first): string => `. . . . ${first} - . . . . . . ${second} - . .`;
const REST = ". . . . . . . . . . . . . . . .";

// The four bars in C every time round: C | A7 | Dm7 G7 | C, the bass walking
// with chromatic steps into each chord.
const HOME_BASS =
  "C3 - . . G2 - . . C3 - . . Bb2 - . . | A2 - . . E2 - . . A2 - . . Eb3 - . . | D3 - . . A2 - . . G2 - . . D3 - . . | C3 - . . G2 - . . C3 - . . G2 - . .";
const HOME_LOW = [pah("E4"), pah("C#4"), pah("F4"), pah("E4")].join(" | ");
const HOME_HIGH = [pah("G4"), pah("G4"), pah("C5", "B4"), pah("G4")].join(" | ");

const OPENING = "E5 - D#5 E5 - . G5 - . . C6 - . . G5 - | A5 - G#5 A5 - . E5 - . . C#5 - . . E5 -";

export const CROAKERS_CROSSING: Theme = {
  id: "croakers-crossing",
  name: "Croaker's Crossing",
  use: "The lobby and menus, or a light-hearted run.",
  mood: "Cheeky and mischievous: a cartoon frog tiptoeing, then strutting, across the road.",
  style: [
    "Grant Kirkhope (Banjo-Kazooie, Donkey Kong 64): a bouncy, tuba-like bass walking with chromatic steps into each chord",
    "Grant Kirkhope: a cheeky staccato tune full of chromatic neighbour notes, and a sliding chromatic run down to the cadence",
    "Grant Kirkhope: jazzy secondary dominants (C, A7, Dm7, G7), and a sudden jump to a far key (A-flat major) with the lead swapped to a marimba, as his music changes instruments between areas",
    "Cartoon scoring: a comedy boing on the beat, to punctuate a phrase",
  ],
  key: "C major, with a bridge in A-flat major",
  kind: "loop",
  bpm: 132,
  beatsPerBar: 4,
  instruments: [REED, BASS, PAD, PAD, BOING, MARIMBA],
  patterns: [
    // A: the tune strutting out.
    [
      {
        instrument: 0,
        pan: 0,
        notes: `${OPENING} | F5 - E5 F5 - . A5 - G5 - F#5 G5 - . B4 - | C5 - . . G4 - . . C5 - E5 - G5 - . .`,
      },
      { instrument: 1, pan: 0, notes: HOME_BASS },
      { instrument: 2, pan: -0.4, notes: HOME_LOW },
      { instrument: 3, pan: 0.4, notes: HOME_HIGH },
      { instrument: 4, pan: 0.2, notes: `${REST} | ${REST} | ${REST} | . . . . . . . . . . . . . . C4 .` },
    ],
    // A': higher, and down a chromatic slide to land.
    [
      {
        instrument: 0,
        pan: 0,
        notes: `${OPENING} | F5 - E5 F5 - . D6 - C6 - B5 C6 - . G5 - | C6 - B5 Bb5 A5 Ab5 G5 - E5 - C5 - - . . .`,
      },
      { instrument: 1, pan: 0, notes: HOME_BASS },
      { instrument: 2, pan: -0.4, notes: HOME_LOW },
      { instrument: 3, pan: 0.4, notes: HOME_HIGH },
      { instrument: 4, pan: 0.2, notes: `${REST} | ${REST} | ${REST} | . . . . . . . . . . . . . C4 . .` },
    ],
    // B: tiptoeing off into A-flat on the marimba, then G7 marches it home.
    [
      {
        instrument: 5,
        pan: 0,
        notes:
          "C5 - Eb5 - Ab5 - Eb5 - C5 - Eb5 - Ab5 - G5 - | F5 - Ab5 - C6 - Ab5 - F5 - C5 - F5 - E5 - | Db5 - F5 - Ab5 - Db6 - C6 - Bb5 - Ab5 - F5 - | G5 - . . F5 - . . D5 - . . B4 - . .",
      },
      {
        instrument: 1,
        pan: 0,
        notes:
          "Ab2 - . . Eb3 - . . Ab2 - . . Eb2 - . . | F2 - . . C3 - . . F2 - . . C3 - . . | Db3 - . . Ab2 - . . Db3 - . . D3 - . . | G2 - . . B2 - . . D3 - . . F3 - . .",
      },
      { instrument: 2, pan: -0.4, notes: [pah("C4"), pah("Ab4"), pah("F4"), pah("F4")].join(" | ") },
      { instrument: 3, pan: 0.4, notes: [pah("Eb4"), pah("C5"), pah("Ab4"), pah("B4")].join(" | ") },
      { instrument: 4, pan: 0.2, notes: `${REST} | ${REST} | ${REST} | ${REST}` },
    ],
  ],
  sequence: [0, 1, 2, 1],
};
