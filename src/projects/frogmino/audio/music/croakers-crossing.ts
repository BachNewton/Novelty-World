import { Shape } from "../sounds";
import { BASS, PAD, SINE_LEAD } from "./instruments";
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
// A stop-time hit: one chord on the downbeat, then silence.
const hit = (note: string): string => `${note} - . . . . . . . . . . . . . .`;

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
    "Grant Kirkhope: the tune coming back in disguise, sneaking in C minor on the marimba, and a last return lifted a semitone to D-flat",
    "Grant Kirkhope: a world theme's length, about a minute and a half before it loops, kept fresh by new sections rather than repeats",
    "Cartoon scoring: a comedy boing on the beat, and a stop-time break where the band hits a chord and the boings answer",
  ],
  key: "C major, wandering to A-flat, C minor, F and D-flat",
  kind: "loop",
  bpm: 132,
  beatsPerBar: 4,
  instruments: [REED, BASS, PAD, PAD, BOING, MARIMBA, SINE_LEAD],
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
    // C: the tune sneaking back in C minor, on the marimba.
    [
      {
        instrument: 5,
        pan: 0,
        notes:
          "Eb5 - D5 Eb5 - . G5 - . . C6 - . . G5 - | Ab5 - G5 Ab5 - . Eb5 - . . C5 - . . Eb5 - | F5 - E5 F5 - . Ab5 - G5 - F#5 G5 - . B4 - | C5 - . . G4 - . . C5 - Eb5 - G5 - . .",
      },
      {
        instrument: 1,
        pan: 0,
        notes:
          "C3 - . . G2 - . . C3 - . . Eb3 - . . | Ab2 - . . Eb3 - . . Ab2 - . . A2 - . . | D3 - . . Ab2 - . . G2 - . . D3 - . . | C3 - . . G2 - . . C3 - . . G2 - . .",
      },
      { instrument: 2, pan: -0.4, notes: [pah("Eb4"), pah("C4"), pah("F4"), pah("Eb4")].join(" | ") },
      { instrument: 3, pan: 0.4, notes: [pah("G4"), pah("Gb4"), pah("Ab4", "B4"), pah("G4")].join(" | ") },
      { instrument: 4, pan: 0.2, notes: `${REST} | ${REST} | ${REST} | ${REST}` },
    ],
    // D: a broad, singing tune in F, the marimba filling the gap at its end.
    [
      {
        instrument: 6,
        pan: 0,
        notes:
          "A5 . . . . . . . C6 . . . A5 . . . | F5 . . . . . . . E5 . . . D5 . . . | Bb5 . . . A5 . . . G5 . . . E5 . . . | F5 . . . . . . . . . . . - . . .",
      },
      {
        instrument: 1,
        pan: 0,
        notes:
          "F2 . . . . . . . C3 . . . . . . . | D3 . . . . . . . A2 . . . . . . . | G2 . . . . . . . C3 . . . . . . . | F2 . . . . . . . C3 . . . E2 . . .",
      },
      { instrument: 2, pan: -0.4, notes: [pah("A4"), pah("F4"), pah("Bb4"), pah("A4")].join(" | ") },
      { instrument: 3, pan: 0.4, notes: [pah("C5"), pah("C5"), pah("D5", "E5"), pah("C5")].join(" | ") },
      { instrument: 5, pan: 0.2, notes: `${REST} | ${REST} | ${REST} | . . . . . . . . A4 - C5 - D5 - E5 -` },
    ],
    // D': the singing tune again, turning through a borrowed B-flat minor to G7.
    [
      {
        instrument: 6,
        pan: 0,
        notes:
          "A5 . . . . . . . C6 . . . A5 . . . | C#6 . . . . . . . E5 . . . G5 . . . | F5 . . . D5 . . . Db5 . . . . . . . | D5 . . . . . . . B4 . . . - . . .",
      },
      {
        instrument: 1,
        pan: 0,
        notes:
          "F2 . . . . . . . C3 . . . . . . . | A2 . . . . . . . E2 . . . . . . . | Bb2 . . . . . . . Bb2 . . . . . . . | G2 . . . . . . . D3 . . . B2 . . .",
      },
      { instrument: 2, pan: -0.4, notes: [pah("A4"), pah("C#5"), pah("Bb4"), pah("B4")].join(" | ") },
      { instrument: 3, pan: 0.4, notes: [pah("C5"), pah("E5"), pah("D5", "Db5"), pah("F5")].join(" | ") },
      { instrument: 5, pan: 0.2, notes: `${REST} | ${REST} | ${REST} | . . . . . . . . . . . . D5 - B4 -` },
    ],
    // E: the boing break. The band stops on each downbeat and the boings answer.
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "C5 - . . . . . . E5 G5 C6 - . . . . | C5 - . . . . . . E5 G5 Bb5 - A5 - . . | F5 - . . . . . . A5 - F#5 - . . . . | G5 - F5 - D5 - B4 - G4 - . . . . . .",
      },
      {
        instrument: 1,
        pan: 0,
        notes: `${hit("C3")} | ${hit("C3")} | F2 - . . . . . . F#2 - . . . . . . | G2 - . . F2 - . . D3 - . . B2 - . .`,
      },
      { instrument: 2, pan: -0.4, notes: `${hit("E4")} | ${hit("E4")} | F4 - . . . . . . A4 - . . . . . . | ${hit("F4")}` },
      { instrument: 3, pan: 0.4, notes: `${hit("G4")} | ${hit("Bb4")} | A4 - . . . . . . C5 - . . . . . . | ${hit("B4")}` },
      {
        instrument: 4,
        pan: 0.2,
        notes:
          ". . . . C4 . . . . . . . G4 . . . | . . . . E4 . . . . . . . . . . . | . . . . F4 . . . . . . . C4 . . . | . . . . . . . . . . . . C4 . E4 .",
      },
    ],
    // A, lifted: the tune a semitone up in D-flat, then G7 slips it home to C.
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "F5 - E5 F5 - . Ab5 - . . Db6 - . . Ab5 - | Bb5 - A5 Bb5 - . F5 - . . D5 - . . F5 - | Gb5 - F5 Gb5 - . Eb6 - Db6 - C6 Db6 - . Ab5 - | G5 - Ab5 G5 F5 - D5 - B4 - D5 - G5 - . .",
      },
      {
        instrument: 1,
        pan: 0,
        notes:
          "Db3 - . . Ab2 - . . Db3 - . . B2 - . . | Bb2 - . . F2 - . . Bb2 - . . E3 - . . | Eb3 - . . Bb2 - . . Ab2 - . . Eb3 - . . | G2 - . . B2 - . . D3 - . . F3 - . .",
      },
      { instrument: 2, pan: -0.4, notes: [pah("F4"), pah("D4"), pah("Gb4"), pah("F4")].join(" | ") },
      { instrument: 3, pan: 0.4, notes: [pah("Ab4"), pah("Ab4"), pah("Db5", "C5"), pah("B4")].join(" | ") },
      { instrument: 4, pan: 0.2, notes: `${REST} | ${REST} | ${REST} | ${REST}` },
    ],
  ],
  // Strut out, wander off, sneak back, break, and lift home.
  sequence: [0, 1, 2, 1, 4, 5, 3, 6, 2, 0, 7, 1],
};
