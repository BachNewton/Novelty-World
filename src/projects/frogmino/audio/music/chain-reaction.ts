import { GLOCKENSPIEL, HARPSICHORD, KICK, MARIMBA, UPRIGHT, WOOD_BLOCK } from "./instruments";
import type { Channel, Theme } from "./song";
import { delay, repeat, Scale, transpose } from "./writing";

// Chain Reaction (T and L): everything together, in a chain whose gaps
// shrink to a closing burst. A clockwork contraption: a toy round in which
// each voice sets off the next, a marimba, then a glockenspiel, then a
// harpsichord, over a ticking wood block. Each time round the entries come
// closer (two bars apart, then one, then half a bar: a stretto), as the
// course's gaps shrink, with the tempo steady throughout. Between, the
// machine winds back: the round in mirror image over the dominant, a voice
// turned upside down crossing the other. Then the last domino falls.
//
// The subject keeps to the major pentatonic over a tonic drone, so it sounds
// against itself at any distance.

const A_MAJOR = new Scale(["A", "B", "C#", "D", "E", "F#", "G#"]);

const [FIRST, SECOND, THIRD, BASS, TICK, THUMP] = [0, 1, 2, 3, 4, 5];
const REST = ". . . . . . . . . . . . . . . .";

// The subject: wind up, tip over, roll along and the dominoes fall.
const SUBJECT = [
  "A4 . C#5 . E5 . A5 . . . E5 . C#5 . . .",
  "F#5 . E5 . C#5 . B4 . A4 . . . - . . .",
  "E5 - E5 - F#5 - F#5 - A5 . . . B5 . . .",
  "C#6 . B5 . A5 . F#5 . E5 . C#5 . B4 . A4 .",
].join(" | ");
const TWICE = `${SUBJECT} | ${SUBJECT}`;

const TICK_TOCK = "C6 . . . G5 . . . C6 . . . G5 . . .";
const DRONE = "A1 . . . E2 . . . A1 . . . E2 . . .";
const PEDAL = "E2 . . . B1 . . . E2 . . . B1 . . .";

function machine(bars: number, bass: string): Channel[] {
  return [
    { instrument: BASS, pan: 0, notes: repeat(bass, bars) },
    { instrument: TICK, pan: 0.3, notes: repeat(TICK_TOCK, bars) },
    { instrument: THUMP, pan: 0, notes: repeat("x . . . . . . . x . . . . . . .", bars) },
  ];
}

// A round of the subject, the second voice an octave up, the third an
// octave down, each entering `gap` rows after the last.
function round(gap: number): Channel[] {
  return [
    { instrument: FIRST, pan: 0, notes: TWICE },
    { instrument: SECOND, pan: 0.45, notes: delay(transpose(TWICE, 12), gap) },
    { instrument: THIRD, pan: -0.45, notes: delay(transpose(TWICE, -12), 2 * gap) },
    ...machine(8, DRONE),
  ];
}

// Wind up: the clock starts ticking.
const WIND_UP: Channel[] = [
  { instrument: FIRST, pan: 0, notes: repeat(REST, 2) },
  { instrument: SECOND, pan: 0.45, notes: `${REST} | . . . . . . . . E6 . F#6 . A6 . B6 .` },
  { instrument: THIRD, pan: -0.45, notes: repeat(REST, 2) },
  ...machine(2, DRONE),
];

// Winding back: over the dominant, the round in mirror image, the
// glockenspiel's line upside down, crossing the marimba's.
const WIND_BACK: Channel[] = [
  { instrument: FIRST, pan: 0, notes: TWICE },
  { instrument: SECOND, pan: 0.45, notes: delay(transpose(A_MAJOR.mirror(TWICE, "E5"), 12), 32) },
  { instrument: THIRD, pan: -0.45, notes: repeat(REST, 8) },
  ...machine(8, PEDAL),
];

// The last domino falls: everyone together, down the scale and stop, and
// the ribbit.
const LAST_DOMINO: Channel[] = [
  { instrument: FIRST, pan: 0, notes: `C#6 B5 A5 F#5 E5 C#5 B4 A4 . . . . - . . . | . . . . . . . . A4 - A5 . . . - .` },
  { instrument: SECOND, pan: 0.45, notes: `C#7 B6 A6 F#6 E6 C#6 B5 A5 . . . . - . . . | ${REST}` },
  { instrument: THIRD, pan: -0.45, notes: `C#5 B4 A4 F#4 E4 C#4 B3 A3 . . . . - . . . | ${REST}` },
  { instrument: BASS, pan: 0, notes: `A1 . . . . . . . - . . . . . . . | ${REST}` },
  { instrument: TICK, pan: 0.3, notes: `${TICK_TOCK} | C6 . . . . . . . . . . . . . . .` },
  { instrument: THUMP, pan: 0, notes: `x . . . . . . . . . . . . . . . | ${REST}` },
];

export const CHAIN_REACTION: Theme = {
  id: "chain-reaction",
  name: "Chain Reaction",
  use: "Chain Reaction, the T and the L, everything together in a chain.",
  mood: "A ticking toy contraption, delighted with itself as each part sets off the next.",
  style: [
    "A clockwork round for marimba, glockenspiel and harpsichord over a ticking wood block",
    "The chain as a round: each voice sets off the next, and each time round the entries come closer, to a stretto, as the course's gaps shrink",
    "The tempo never changes: the chain tightens, the clock doesn't speed up",
    "A canon in mirror image over the dominant, one voice crossing the other upside down",
    "A bright major-pentatonic hook, so the round sounds against itself at any distance",
  ],
  key: "A major",
  kind: "loop",
  bpm: 116,
  beatsPerBar: 4,
  metre: "4/4",
  instruments: [MARIMBA, GLOCKENSPIEL, HARPSICHORD, UPRIGHT, WOOD_BLOCK, KICK],
  patterns: [WIND_UP, round(32), round(16), WIND_BACK, round(8), LAST_DOMINO],
  sequence: [0, 1, 2, 3, 4, 5],
};
