import { BRUSH, CLARINET, MUSIC_BOX, PIZZICATO, UPRIGHT } from "./instruments";
import type { Channel, Theme } from "./song";
import { perBar, repeat, spread, transpose } from "./writing";

// Tea for Two (T and T): two Ts and a staircase, one pointing up while the
// other climbs onto its arm or is lifted onto its nose. A parlour waltz for a
// tea party, the clarinet and the music box its two Ts: the tune is a
// staircase, each phrase starting a step higher than the last, and the two
// swap who climbs and who stands holding the long notes. Then they nest,
// turning in to each other in a minor key, and one is lifted onto the other's
// nose: the tune a tone higher, the music box an octave over it.

const [CLIMBER, TEACUP, BASS, PAH, SWISH] = [0, 1, 2, 3, 4];
const REST = ". . . . . . . . . . . .";

// A chord as the waltz plays it: the bass on one, the pizzicato on two and
// three, and a teacup's clink.
interface Chord {
  root: string;
  pah: readonly [string, string];
  clink: string;
}

function oom({ root }: Chord): string {
  return `${root} . . . . . . . - . . .`;
}

function pahPah({ pah: [two, three] }: Chord): string {
  return `. . . . ${two} - . . ${three} - . .`;
}

function clink({ clink: note }: Chord, i: number): string {
  return i % 2 === 0 ? `. . . . . . . . ${note} . . .` : `. . . . . . . . . . ${note} .`;
}

const F: Chord = { root: "F2", pah: ["A3", "C4"], clink: "F6" };
const C7: Chord = { root: "C2", pah: ["Bb3", "E4"], clink: "G6" };
const GM: Chord = { root: "G2", pah: ["Bb3", "D4"], clink: "D6" };
const D7: Chord = { root: "D2", pah: ["C4", "F#4"], clink: "A6" };
const AM: Chord = { root: "A1", pah: ["C4", "E4"], clink: "E6" };
const E7: Chord = { root: "E2", pah: ["D4", "G#4"], clink: "B6" };
const A7: Chord = { root: "A1", pah: ["C#4", "G4"], clink: "C#7" };
const BB: Chord = { root: "Bb1", pah: ["D4", "F4"], clink: "F6" };
const BBM: Chord = { root: "Bb1", pah: ["Db4", "F4"], clink: "F6" };
const DM: Chord = { root: "D2", pah: ["F3", "A3"], clink: "D7" };

const STAIR_CHORDS = [F, C7, F, F, GM, D7, GM, C7, AM, E7, AM, A7, BB, BBM, C7, F];

// The staircase: each phrase climbs a step up to the nose and comes back
// down, starting a step higher than the one before.
const STAIRS = spread(
  [
    "C5 . D5 E5 F5 . | G5 . . E5 . . | F5 . A5 . C6 . | A5 . . . - .",
    "D5 . E5 F5 G5 . | A5 . . F#5 . . | G5 . Bb5 . D6 . | Bb5 . . . - .",
    "E5 . F5 G5 A5 . | B5 . . G#5 . . | A5 . C6 . E6 . | C#6 . . . - .",
    "F5 . G5 A5 Bb5 . | Db6 . . Bb5 . . | A5 . G5 . E5 . | F5 . . . - .",
  ].join(" | "),
  2,
);

function waltz(chords: readonly Chord[], clinks: boolean): Channel[] {
  return [
    { instrument: BASS, pan: 0, notes: perBar(chords, oom) },
    { instrument: PAH, pan: 0.2, notes: perBar(chords, pahPah) },
    { instrument: SWISH, pan: -0.2, notes: repeat(". . . . C5 . . . C5.4 . . .", chords.length) },
    ...(clinks ? [{ instrument: TEACUP, pan: 0.45, notes: perBar(chords, clink) }] : []),
  ];
}

// The kettle on: the waltz and the teacups, nobody climbing yet.
const KETTLE: Channel[] = [
  { instrument: CLIMBER, pan: -0.3, notes: `${repeat(REST, 3)} | . . . . . . . . C5 . . .` },
  ...waltz([F, C7, F, C7], true),
];

// The clarinet climbs while the music box clinks.
const CLARINET_CLIMBS: Channel[] = [{ instrument: CLIMBER, pan: -0.3, notes: STAIRS }, ...waltz(STAIR_CHORDS, true)];

// Swap: the music box climbs, an octave up, and the clarinet stands, holding
// long notes with a cheeky turn at each landing.
const BOX_CLIMBS: Channel[] = [
  {
    instrument: CLIMBER,
    pan: -0.3,
    notes: spread(
      "A4 . . . . . | Bb4 . . . . . | A4 . . . . . | C5 . B4 . C5 . | Bb4 . . . . . | C5 . . . . . | Bb4 . . . . . | Bb4 . A4 . Bb4 . | C5 . . . . . | D5 . . . . . | C5 . . . . . | E5 . D#5 . E5 . | D5 . . . . . | Db5 . . . . . | C5 . . . Bb4 . | A4 . . . - .",
      2,
    ),
  },
  { instrument: TEACUP, pan: 0.45, notes: transpose(STAIRS, 12) },
  ...waltz(STAIR_CHORDS, false),
];

// The nest: in D minor the two turn in to each other, one falling as the
// other rises, meeting and parting.
const NEST: Channel[] = [
  { instrument: CLIMBER, pan: -0.3, notes: spread("A5 . . G5 F5 . | E5 . . . C#5 . | D5 . F5 . A5 . | G5 . . . D5 . | F5 . E5 . D5 . | C#5 . E5 . G5 . | F5 . . . D5 . | E5 . . . - .", 2) },
  { instrument: TEACUP, pan: 0.45, notes: spread("D6 . . E6 F6 . | G6 . . . E6 . | F6 . D6 . A5 . | Bb5 . . . D6 . | A5 . . . F5 . | A5 . G5 . E5 . | F5 . . . A5 . | G5 . . . - .", 2) },
  ...waltz([DM, A7, DM, GM, DM, A7, DM, C7], false),
];

// Lifted onto the nose: the staircase a tone higher, the music box riding an
// octave over the clarinet.
const LIFTED: Channel[] = [
  { instrument: CLIMBER, pan: -0.3, notes: transpose(STAIRS, 2) },
  { instrument: TEACUP, pan: 0.45, notes: transpose(STAIRS, 14) },
  ...waltz(STAIR_CHORDS, false).map((channel) => (channel.instrument === SWISH ? channel : { ...channel, notes: transpose(channel.notes, 2) })),
];

// Down a step, home to F, and the ribbit.
const HOME: Channel[] = [
  { instrument: CLIMBER, pan: -0.3, notes: `${spread("G5 . . E5 . . | Bb5 . . G5 . . | A5 . F5 . C5 .", 2)} | F4 - F5 . . . . . - . . .` },
  { instrument: TEACUP, pan: 0.45, notes: `${repeat(REST, 3)} | . . . . . . . . F6 . . .` },
  ...waltz([C7, C7, F], false).map((channel) => ({ ...channel, notes: `${channel.notes} | ${channel.instrument === BASS ? "F2 . . . . . . . - . . ." : REST}` })),
];

export const TEA_FOR_TWO: Theme = {
  id: "tea-for-two",
  name: "Tea for Two",
  use: "Tea for Two, the two Ts and their staircase.",
  mood: "A genteel tea-party waltz with its little finger up, and a wink.",
  style: [
    "A parlour waltz, as gentle as a Pokémon town: clarinet, music box, pizzicato and a brushed snare",
    "The tune is a staircase: each phrase climbs to the nose, and the next starts a step higher",
    "The pair as two voices that swap who climbs and who stands holding the long notes",
    "Kirkhope's cheek: chromatic turns at the landings and a sudden minor chord at the top of the stairs",
    "Lifted onto the nose: a tone higher, with the music box an octave over the clarinet",
  ],
  key: "F major, lifting to G",
  kind: "loop",
  bpm: 138,
  beatsPerBar: 3,
  metre: "3/4",
  instruments: [CLARINET, MUSIC_BOX, UPRIGHT, PIZZICATO, BRUSH],
  patterns: [KETTLE, CLARINET_CLIMBS, BOX_CLIMBS, NEST, LIFTED, HOME],
  sequence: [0, 1, 2, 3, 4, 5],
};
