import { BANJO, FIDDLE, HAT, KICK, SNARE, TUBA } from "./instruments";
import type { Channel, Theme } from "./song";
import { perBar, repeat, Scale, transpose } from "./writing";

// Block Party (O and O): two blocks that can't climb each other, so they
// stay side by side. A jug-band hoedown, a square dance for two squares: twin
// fiddles that play shoulder to shoulder in thirds and never cross, a banjo
// rolling, a tuba for a jug and a washboard. They make room for each other
// (call and answer), hop together (stop time, the whole band stomping on
// the same beats), then step up side by side, a key higher.

const D_MAJOR = new Scale(["D", "E", "F#", "G", "A", "B", "C#"]);

const [LEFT, RIGHT, ROLL, JUG, STOMP, CLAP, WASHBOARD] = [0, 1, 2, 3, 4, 5, 6];
const REST = ". . . . . . . .";

// A chord as the banjo rolls it and the tuba thumps it.
interface Chord {
  roll: readonly [string, string, string, string];
  root: string;
  fifth: string;
}

function roll({ roll: [a, b, c, d] }: Chord): string {
  return `${a} ${b}.3 ${c}.2 ${d} ${b}.3 ${c}.2 ${d}.1 ${c}.3`;
}

function boom({ root, fifth }: Chord): string {
  return `${root} . - . ${fifth} . - .`;
}

const D: Chord = { roll: ["D4", "F#4", "A4", "D5"], root: "D2", fifth: "A1" };
const G: Chord = { roll: ["D4", "G4", "B4", "D5"], root: "G2", fifth: "D2" };
const GM: Chord = { roll: ["D4", "G4", "Bb4", "D5"], root: "G2", fifth: "D2" };
const BM: Chord = { roll: ["D4", "F#4", "B4", "D5"], root: "B1", fifth: "F#2" };
const A: Chord = { roll: ["C#4", "E4", "A4", "C#5"], root: "A1", fifth: "E2" };
const A7: Chord = { roll: ["C#4", "E4", "G4", "C#5"], root: "A1", fifth: "E2" };
const E7: Chord = { roll: ["D4", "E4", "G#4", "B4"], root: "E2", fifth: "B1" };

const WASH = "C6.6 C6.8 C6 C6.8 C6.6 C6.8 C6 C6.8";
const STOMPS = "x . . . x . . .";
const CLAPS = ". . G4.5 . . . G4.5 .";

function band(chords: readonly Chord[]): Channel[] {
  const bars = chords.length;
  return [
    { instrument: ROLL, pan: 0.15, notes: perBar(chords, roll) },
    { instrument: JUG, pan: 0, notes: perBar(chords, boom) },
    { instrument: STOMP, pan: 0, notes: repeat(STOMPS, bars) },
    { instrument: CLAP, pan: -0.15, notes: repeat(CLAPS, bars) },
    { instrument: WASHBOARD, pan: 0.3, notes: repeat(WASH, bars) },
  ];
}

// The left fiddle's tune, and the right one's beside it a third below, but
// for the bars off the key, written out.
const TUNE_CHORDS = [D, D, G, G, D, BM, E7, A7, D, D, G, GM, D, A7, D, D];
const TUNE = [
  "A4 - D5 . F#5 . A5 .",
  "B5 A5 F#5 . D5 . E5 .",
  "D5 . B4 . G4 . B4 D5",
  "G5 . . . F#5 - E5 -",
  "F#5 . A5 . A5 - F#5 .",
  "D5 . B4 . D5 . F#5 .",
  "E5 G#5 B5 . D6 . B5 .",
  "A5 . . . E5 - C#5 -",
  "A4 - D5 . F#5 . A5 .",
  "B5 A5 F#5 . D5 . F#5 A5",
  "B5 . G5 . D5 . G5 .",
  "Bb5 . G5 . D5 . Bb4 .",
  "A4 . D5 . F#5 . A5 .",
  "G5 . E5 . C#5 . E5 .",
  "D5 - D5 - F#5 - A5 -",
  "D6 . . . - . . .",
];
const BESIDE: Readonly<Record<number, string>> = {
  6: "B4 E5 G#5 . B5 . G#5 .",
  11: "G5 . D5 . Bb4 . G4 .",
};
const TUNE_BESIDE = TUNE.map((bar, i) => BESIDE[i] ?? D_MAJOR.shift(bar, -2));

const INTRO: Channel[] = [
  { instrument: LEFT, pan: -0.4, notes: `${repeat(REST, 3)} | . . . . D5 - D5 -` },
  { instrument: RIGHT, pan: 0.4, notes: `${repeat(REST, 3)} | . . . . A4 - A4 -` },
  { instrument: ROLL, pan: 0.15, notes: repeat(roll(D), 4) },
  { instrument: JUG, pan: 0, notes: `${repeat(REST, 2)} | ${boom(D)} | ${boom(A7)}` },
  { instrument: STOMP, pan: 0, notes: `${repeat(REST, 2)} | ${repeat(STOMPS, 2)}` },
  { instrument: CLAP, pan: -0.15, notes: repeat(REST, 4) },
  { instrument: WASHBOARD, pan: 0.3, notes: repeat(WASH, 4) },
];

// Shoulder to shoulder: the tune in thirds.
const SIDE_BY_SIDE: Channel[] = [
  { instrument: LEFT, pan: -0.4, notes: TUNE.join(" | ") },
  { instrument: RIGHT, pan: 0.4, notes: TUNE_BESIDE.join(" | ") },
  ...band(TUNE_CHORDS),
];

// Make room: each fiddle steps aside for the other's answer, then both
// again.
const MAKE_ROOM: Channel[] = [
  {
    instrument: LEFT,
    pan: -0.4,
    notes: [
      "B5 . A5 . G5 . D5 .", "E5 . G5 . B5 . . .", `- . . . . . .  .`, REST,
      "D6 . B5 . G5 . B5 .", "A5 . G5 . E5 . . .", "- . . . . . . .", REST,
      "F#5 . D5 . B4 . D5 .", "F#5 . B5 . . . A5 .", "- . . . . . . .", REST,
      "G#5 . B5 . D6 . B5 .", "E6 . D6 . B5 . G#5 .", "A5 . E5 . C#5 . E5 .", "G5 . . . A5 . . .",
    ].join(" | "),
  },
  {
    instrument: RIGHT,
    pan: 0.4,
    notes: [
      REST, REST, "F#4 . A4 . D5 . F#5 .", "E5 . D5 . A4 . - .",
      REST, REST, "E4 . A4 . C#5 . E5 .", "G5 . E5 . C#5 . - .",
      REST, REST, "G4 . B4 . D5 . G5 .", "B5 . A5 . G5 . - .",
      "E5 . G#5 . B5 . G#5 .", "B5 . B5 . G#5 . E5 .", "E5 . C#5 . A4 . C#5 .", "C#5 . . . E5 . . .",
    ].join(" | "),
  },
  ...band([G, G, D, D, G, G, A, A, BM, BM, G, G, E7, E7, A7, A7]),
];

// Hop together: stop time, the whole band landing on the fiddles' hops.
const HOP_LEFT = [
  "D5 - . . D5 - . .",
  "D5 - F#5 - A5 - . .",
  "G5 - . . G5 - . .",
  "G5 - B5 - D6 - . .",
  "A5 - . . A5 - . .",
  "A5 - C#6 - E6 - . .",
  "D6 - A5 - F#5 - E5 -",
  "D5 . . . - . . .",
];
const HOP_ROOTS = ["D2", "D2", "G2", "G2", "A1", "A1", "D2", "D2"];
const HOPS = "R - . . R - . .";
const HOP_TOGETHER: Channel[] = [
  { instrument: LEFT, pan: -0.4, notes: HOP_LEFT.join(" | ") },
  { instrument: RIGHT, pan: 0.4, notes: D_MAJOR.shift(HOP_LEFT.join(" | "), -2) },
  { instrument: ROLL, pan: 0.15, notes: `${repeat(REST, 7)} | ${roll(D)}` },
  { instrument: JUG, pan: 0, notes: HOP_ROOTS.map((root) => HOPS.replaceAll("R", root)).join(" | ") },
  { instrument: STOMP, pan: 0, notes: repeat(HOPS.replaceAll("R", "x"), 8) },
  { instrument: CLAP, pan: -0.15, notes: repeat(`${REST} | . . . . . . x .`, 4) },
  { instrument: WASHBOARD, pan: 0.3, notes: `${repeat(REST, 7)} | ${WASH}` },
];

// Step up side by side: the tune again, a tone higher.
const STEP_UP: Channel[] = SIDE_BY_SIDE.map((channel) =>
  channel.instrument === STOMP || channel.instrument === CLAP || channel.instrument === WASHBOARD
    ? channel
    : { ...channel, notes: transpose(channel.notes, 2) },
);

// Round the fifths home to D, and the ribbit.
const HOME: Channel[] = [
  { instrument: LEFT, pan: -0.4, notes: "E5 . C#5 . A4 . C#5 E5 | G5 . E5 . C#5 . A4 . | D5 . . . F#5 . A5 . | D4 - D5 . . . - ." },
  { instrument: RIGHT, pan: 0.4, notes: "C#5 . A4 . E4 . A4 C#5 | E5 . C#5 . A4 . E4 . | A4 . . . D5 . F#5 . | - . . . . . . ." },
  { instrument: ROLL, pan: 0.15, notes: `${roll(A7)} | ${roll(A7)} | ${roll(D)} | ${REST}` },
  { instrument: JUG, pan: 0, notes: `${boom(A7)} | ${boom(A7)} | ${boom(D)} | D2 . . . - . . .` },
  { instrument: STOMP, pan: 0, notes: `${repeat(STOMPS, 3)} | x . . . . . . .` },
  { instrument: CLAP, pan: -0.15, notes: `${repeat(CLAPS, 3)} | ${REST}` },
  { instrument: WASHBOARD, pan: 0.3, notes: `${repeat(WASH, 3)} | C6 . . . . . . .` },
];

export const BLOCK_PARTY: Theme = {
  id: "block-party",
  name: "Block Party",
  use: "Block Party, the two Os that can't climb each other.",
  mood: "A barn dance for two squares: stomping, clapping and grinning.",
  style: [
    "A jug-band hoedown: twin fiddles, a rolling banjo (the Banjo-Kazooie colour), a tuba for a jug and a washboard",
    "The pair as twin fiddles a third apart, side by side and never crossing, as two Os can't climb each other",
    "Call and answer as making room, and stop time as hopping together, the band landing on the fiddles' hops",
    "A step up a tone for stepping up side by side, then round the fifths home",
  ],
  key: "D major, stepping up to E",
  kind: "loop",
  bpm: 132,
  beatsPerBar: 2,
  metre: "2/4",
  instruments: [FIDDLE, FIDDLE, BANJO, TUBA, KICK, SNARE, HAT],
  patterns: [INTRO, SIDE_BY_SIDE, MAKE_ROOM, HOP_TOGETHER, STEP_UP, HOME],
  sequence: [0, 1, 2, 3, 4, 5],
};
