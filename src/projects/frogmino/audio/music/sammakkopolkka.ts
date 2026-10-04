import { BASS, LEAD, PAD, TICK } from "./instruments";
import type { Theme } from "./song";

// Each chord's oom-pah: the bass on the beat, two chord tones off it.
const CHORDS: Record<string, { oom: string; low: string; high: string }> = {
  d: { oom: "D3 . . . A2 . . .", low: "F4", high: "A4" },
  c: { oom: "C3 . . . G2 . . .", low: "E4", high: "G4" },
  b: { oom: "Bb2 . . . F2 . . .", low: "D4", high: "F4" },
  a: { oom: "A2 . . . E2 . . .", low: "C#4", high: "E4" },
};

// A phrase's harmony as a chord a bar: d D minor, c C major, b Bb major, a A major.
const each = (chords: string, bar: (chord: (typeof CHORDS)[string]) => string): string =>
  chords
    .split("")
    .map((chord) => bar(CHORDS[chord]))
    .join(" | ");

const oompah = (chords: string) => [
  { instrument: 1, pan: 0, notes: each(chords, (c) => c.oom) },
  { instrument: 2, pan: 0.3, notes: each(chords, (c) => `. . ${c.low} - . . ${c.high} -`) },
];
// Under the long notes, the backing chatters instead.
const chatter = (chords: string) => [
  { instrument: 1, pan: 0, notes: each(chords, (c) => c.oom) },
  { instrument: 2, pan: 0.3, notes: each(chords, (c) => `. . ${c.low} ${c.low}.3 . . ${c.high} ${c.high}.3`) },
];
const TICKS = { instrument: 3, pan: -0.3, notes: ". . x . . . x . | ".repeat(8) };

const HOPS = "ddcdbcda";
const RIDE = "bcddbcaa";
const CROAKS = "dcdcbcdd";

export const SAMMAKKOPOLKKA: Theme = {
  id: "sammakkopolkka",
  name: "Sammakkopolkka",
  use: "The main run loop, under the traffic.",
  mood: "Cheeky and nimble: a frog dancing a polka between the cars.",
  style: [
    "Ievan Polkka: a Finnish polka in D minor and brisk 2/4, its harmony swinging between D minor and C major, but an original tune, never its melody",
    "Ievan Polkka: chattering repeated notes, and a last section of rapid sixteenths in the manner of its scat singing",
    "Frogger (arcade): staccato leaps up the chord, a hop in the tune, and an oom-pah bass",
    "Made for play: short phrases with rests between, and long notes over a chattering backing, leaving room for the sound effects",
  ],
  key: "D minor",
  kind: "loop",
  bpm: 144,
  beatsPerBar: 2,
  instruments: [LEAD, BASS, PAD, TICK],
  patterns: [
    // The hops: a leap up the chord, answered by chatter.
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "D4 - A4 - D5 - . . | C5 C5 E5 - C5 - . . | D4 - A4 - D5 - F5 - | E5 E5 E5 - C5 - . . | F5 - A5 - F5 F5 D5 - | E5 - G5 - E5 E5 C5 - | D5 - Bb4 - G4 - Bb4 - | A4 A4 C#5 - E5 - . .",
      },
      ...oompah(HOPS),
      TICKS,
    ],
    // The ride: long notes over the chatter, like a frog gliding on a bonnet.
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "F5 . . . D5 . . . | E5 . . . G5 . . . | A5 . . . F5 . D5 . | A4 . . . - . . . | F5 . . . D5 . . . | E5 . . . C5 . E5 . | C#5 . . . E5 . . . | A5 - A5 - . . - .",
      },
      ...chatter(RIDE),
      TICKS,
    ],
    // The croaks: the tune breaks into quick pairs of notes, and hops home.
    [
      {
        instrument: 0,
        pan: 0,
        notes:
          "D5 D5 F5 - D5 D5 A4 - | C5 C5 E5 - C5 C5 G4 - | D5 D5 F5 - A5 - F5 - | E5 E5 G5 - E5 - C5 - | D5 D5 F5 - D5 - Bb4 - | E5 E5 G5 - E5 - C5 - | D5 - A4 - D5 - A5 - | D5 . . . - . . .",
      },
      ...oompah(CROAKS),
      TICKS,
    ],
  ],
  sequence: [0, 1, 0, 2],
};
