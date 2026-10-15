import { BASSOON, HAT, PICCOLO, UPRIGHT, WOOD_BLOCK } from "./instruments";
import type { Channel, Theme } from "./song";
import { repeat, retrograde, transpose } from "./writing";

// Zig Zag Alley (S and Z): the mirror pair climbs each other's steps, then
// crosses to the other side of the road and back, the climb one way unlike
// the climb back. A sneaky alley-cat swing on tiptoe: a staccato bassoon
// zig-zagging up and down in one speaker, a piccolo answering from the
// other, finger snaps and a walking bass. The tune crosses the road (the
// piccolo takes it, from the other side), then comes back in retrograde, its
// notes backwards, so the way back climbs where the way out fell.
//
// It swings in triplets: a bar is twelve rows, four beats of three, a swung
// pair of eighths a note of two rows and one of one.

const [BASSOON_SIDE, PICCOLO_SIDE, WALK, SNAP, RIDE] = [0, 1, 2, 3, 4];
const LEFT = -0.5;
const RIGHT = 0.5;
const REST = ". . . . . . . . . . . .";

function walk(notes: readonly string[]): string {
  return notes.map((bar) => bar.split(" ").map((note) => `${note} . .`).join(" ")).join(" | ");
}

const SNAPS = ". . . D6 . . . . . D6 . .";
const RIDE_BAR = "C6.3 . . C6 . C6.6 C6.3 . . C6 . C6.6";

function rhythm(bars: number): Channel[] {
  return [
    { instrument: SNAP, pan: 0.2, notes: repeat(SNAPS, bars) },
    { instrument: RIDE, pan: -0.2, notes: repeat(RIDE_BAR, bars) },
  ];
}

// The tune, zig-zagging up and down, and the answers between its phrases.
const TUNE = [
  "E3 - G3 F#3 - A3 G3 - B3 A3 - C4",
  "B3 . - . . . E4 . - . . .",
  "C4 - A3 B3 - G#3 A3 - F#3 G#3 - E3",
  "A3 . - . . . . . . C4 - E4",
  "G4 - E4 F4 - D4 E4 - C4 Bb3 . -",
  "B3 - D#4 C4 - A3 B3 . - . . .",
  "E3 - G3 B3 - E4 G4 . - . . .",
  ". . . F#4 - D#4 B3 - A3 F#3 . -",
].join(" | ");
const ANSWERS = [
  REST,
  ". . . . . . . . . G6 - F#6",
  REST,
  ". . . E6 - C6 B5 - A5 . . .",
  REST,
  ". . . . . . . . . F#6 - A6",
  REST,
  "B5 - D#6 F#6 . - . . . . . .",
].join(" | ");
const TUNE_WALK = walk(["E2 G2 B2 G2", "E2 F#2 G2 G#2", "A2 C3 E3 C3", "A2 G2 E2 B1", "C2 E2 G2 Bb2", "B1 D#2 F#2 A2", "E2 G2 D2 C2", "B1 D#2 F#2 D#2"]);

// Round the corner: the bass walks in, the snaps start.
const CORNER: Channel[] = [
  { instrument: BASSOON_SIDE, pan: LEFT, notes: repeat(REST, 2) },
  { instrument: PICCOLO_SIDE, pan: RIGHT, notes: repeat(REST, 2) },
  { instrument: WALK, pan: 0, notes: walk(["E2 G2 B2 G2", "E2 F#2 G2 D#2"]) },
  { instrument: SNAP, pan: 0.2, notes: repeat(SNAPS, 2) },
  { instrument: RIDE, pan: -0.2, notes: `${REST} | ${RIDE_BAR}` },
];

// This side of the road: the bassoon's tune, the piccolo answering.
const THIS_SIDE: Channel[] = [
  { instrument: BASSOON_SIDE, pan: LEFT, notes: TUNE },
  { instrument: PICCOLO_SIDE, pan: RIGHT, notes: ANSWERS },
  { instrument: WALK, pan: 0, notes: TUNE_WALK },
  ...rhythm(8),
];

// The crossing: the tune goes over to the piccolo's side, two octaves up,
// and the bassoon answers from where the piccolo was.
const CROSSING: Channel[] = [
  { instrument: PICCOLO_SIDE, pan: RIGHT, notes: transpose(TUNE, 24) },
  { instrument: BASSOON_SIDE, pan: LEFT, notes: transpose(ANSWERS, -24) },
  { instrument: WALK, pan: 0, notes: TUNE_WALK },
  ...rhythm(8),
];

// And back: the tune home on the bassoon's side, backwards, so where it fell
// it climbs.
const AND_BACK: Channel[] = [
  { instrument: BASSOON_SIDE, pan: LEFT, notes: retrograde(TUNE) },
  { instrument: PICCOLO_SIDE, pan: RIGHT, notes: retrograde(ANSWERS) },
  { instrument: WALK, pan: 0, notes: walk(["B1 D#2 F#2 D#2", "E2 G2 B2 G2", "B1 D#2 F#2 A2", "C2 E2 G2 Bb2", "A2 C3 E3 C3", "A2 G2 E2 B1", "E2 G2 B2 G2", "E2 F#2 G2 B1"]) },
  ...rhythm(8),
];

// Over the van: stop time on tiptoe, the band landing on the bassoon's
// steps, the piccolo leaping over.
const OVER_THE_VAN: Channel[] = [
  {
    instrument: BASSOON_SIDE,
    pan: LEFT,
    notes: [
      "E3 - . . . G3 - . . Bb3 - .",
      "C4 - . . . . . . . . . .",
      "D#3 - . . . F#3 - . . A3 - .",
      "B3 - . . . . . . . . . .",
      "E3 - . . . A3 - . . C4 - .",
      "C4 - . . . A3 - . . F#3 - .",
      "D#4 - . C4 - . A3 - . F#3 - .",
      "B3 . . . . . - . . . . .",
    ].join(" | "),
  },
  {
    instrument: PICCOLO_SIDE,
    pan: RIGHT,
    notes: [
      REST,
      ". . . G5 A5 Bb5 C6 . - E6 - .",
      REST,
      ". . . F#5 G#5 A5 B5 . - D#6 - .",
      REST,
      ". . . A5 B5 C6 E6 . - A6 - .",
      REST,
      "B5 - . D#6 - . F#6 - . A6 . -",
    ].join(" | "),
  },
  { instrument: WALK, pan: 0, notes: ["C2", "C2", "B1", "B1", "A1", "F#2", "B1", "B1"].map((root) => `${root} - . . . . . . . . . .`).join(" | ") },
  { instrument: SNAP, pan: 0.2, notes: repeat(SNAPS, 8) },
];

// Slipping off down the alley, and the ribbit.
const SLIP_AWAY: Channel[] = [
  { instrument: BASSOON_SIDE, pan: LEFT, notes: "B3 - A3 G3 - F#3 E3 . - . . . | . . . . . . E3 - E4 . . -" },
  { instrument: PICCOLO_SIDE, pan: RIGHT, notes: repeat(REST, 2) },
  { instrument: WALK, pan: 0, notes: `${walk(["E2 B1 G1 F#1"])} | E1 . . . . . - . . . . .` },
  { instrument: SNAP, pan: 0.2, notes: `${SNAPS} | ${REST}` },
  { instrument: RIDE, pan: -0.2, notes: `${RIDE_BAR} | ${REST}` },
];

export const ZIG_ZAG_ALLEY: Theme = {
  id: "zig-zag-alley",
  name: "Zig Zag Alley",
  use: "Zig Zag Alley, the S and the Z, crossing over and back.",
  mood: "Sneaky, on tiptoe, grinning: an alley cat up to something.",
  style: [
    "A sneaky swing on tiptoe, Kirkhope-style: a staccato bassoon with chromatic steps, finger snaps and a walking bass",
    "The tune zig-zags, every step up answered by a step down",
    "The crossing in stereo: the tune leaves the bassoon's side for the piccolo's, and comes back",
    "The way back unlike the way out: the tune in retrograde, so where it fell it climbs",
    "Stop time on tiptoe for hopping over the van",
  ],
  key: "E minor",
  kind: "loop",
  bpm: 84,
  beatsPerBar: 3,
  metre: "4/4 swung (112 BPM)",
  instruments: [BASSOON, PICCOLO, UPRIGHT, WOOD_BLOCK, HAT],
  patterns: [CORNER, THIS_SIDE, CROSSING, AND_BACK, OVER_THE_VAN, SLIP_AWAY],
  sequence: [0, 1, 2, 3, 4, 5],
};
