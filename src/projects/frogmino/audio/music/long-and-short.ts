import { HAT, KICK, PULSE, PULSE_PIP, SNARE, WAVE_BASS } from "./instruments";
import type { Channel, Theme } from "./song";
import { perBar, repeat, restrike, Scale, spread } from "./writing";

// Long and Short (I and O): a plank and a block learn to stack. A Game Boy
// quartet in which the two pulse voices are the pair: the long voice (the
// plank) only ever holds long notes, the short voice (the block) only ever
// bounces. They take turns at the tune, then the block stands on the plank,
// its hops a third above the plank's long notes, then both leap up a key for
// the double jump, and land home.

const G_MAJOR = new Scale(["G", "A", "B", "C", "D", "E", "F#"]);

const [LONG, SHORT, BASS, KICKS, SNARES, HATS] = [0, 1, 2, 3, 4, 5];

// A chord's bass, bouncing between its root, the octave and the fifth in
// eighths.
interface Bass {
  root: string;
  octave: string;
  fifth: string;
}

function bassBar({ root, octave, fifth }: Bass): string {
  return `${root} . ${octave} - ${fifth} . ${octave} - ${root} . ${octave} - ${fifth} . ${octave} -`;
}

// Half a bar of one chord's bass, then half of the next.
function splitBass(first: Bass, second: Bass): string {
  return `${first.root} . ${first.octave} - ${first.fifth} . ${first.octave} - ${second.root} . ${second.octave} - ${second.fifth} . ${second.octave} -`;
}

// The short voice's bounce through a chord, staccato eighths.
function arp([a, b, c, d]: readonly string[]): string {
  return `${a} - ${b} - ${c} - ${b} - ${a} - ${b} - ${c} - ${d} -`;
}

const G: Bass = { root: "G2", octave: "G3", fifth: "D3" };
const D_OVER_FS: Bass = { root: "F#2", octave: "D3", fifth: "A2" };
const EM: Bass = { root: "E2", octave: "E3", fifth: "B2" };
const C: Bass = { root: "C2", octave: "C3", fifth: "G2" };
const BM: Bass = { root: "B1", octave: "B2", fifth: "F#2" };
const D: Bass = { root: "D2", octave: "D3", fifth: "A2" };
const A7: Bass = { root: "A1", octave: "A2", fifth: "E2" };

const VERSE_CHORDS = [G, D_OVER_FS, EM, C, G, BM, C, D];
const VERSE_ARPS = [
  ["G4", "B4", "D5", "G5"],
  ["F#4", "A4", "D5", "F#5"],
  ["E4", "G4", "B4", "E5"],
  ["E4", "G4", "C5", "E5"],
  ["G4", "B4", "D5", "G5"],
  ["F#4", "B4", "D5", "F#5"],
  ["E4", "G4", "C5", "E5"],
  ["F#4", "A4", "D5", "C5"],
];

// The plank's tune: long notes that stretch, a leap further each phrase.
const VERSE_TUNE = spread("B4 . . D5 | A5 . . . | G5 . . F#5 | E5 . . . | B4 . . D5 | B5 . . . | A5 . . G5 | F#5 . . .", 4);

const DRUMS_STRAIGHT = {
  kick: "x . . . . . x . x . . . . . . .",
  snare: ". . . . x . . . . . . . x . . .",
  hat: "C6 . C6.6 . C6.3 . C6.6 . C6 . C6.6 . C6.3 . C6.6 .",
};
const DRUMS_BUSY = { ...DRUMS_STRAIGHT, hat: "C6 C6.7 C6.5 C6.7 C6.3 C6.7 C6.5 C6.7 C6 C6.7 C6.5 C6.7 C6.3 C6.7 C6.5 C6.7" };
const DRUMS_HALF = {
  kick: "x . . . . . . . . . . . . . . .",
  snare: ". . . . . . . . x . . . . . . .",
  hat: "C6 . C6.6 . C6.3 . C6.6 . C6 . C6.6 . C6.3 . C6.6 .",
};

function drums(bars: number, { kick, snare, hat }: { kick: string; snare: string; hat: string }): Channel[] {
  return [
    { instrument: KICKS, pan: 0, notes: repeat(kick, bars) },
    { instrument: SNARES, pan: 0, notes: repeat(snare, bars) },
    { instrument: HATS, pan: 0.25, notes: repeat(hat, bars) },
  ];
}

// The groove alone, the block tapping its foot.
const INTRO: Channel[] = [
  { instrument: LONG, pan: -0.3, notes: repeat(". . . . . . . . . . . . . . . .", 2) },
  { instrument: SHORT, pan: 0.3, notes: ". . G5 - . . G5 - . . G5 - . . A5 - | . . B5 - . . A5 - . . G5 - D5 - . ." },
  { instrument: BASS, pan: 0, notes: repeat(bassBar(G), 2) },
  ...drums(2, DRUMS_STRAIGHT),
];

// The plank sings, the block bounces underneath.
const VERSE: Channel[] = [
  { instrument: LONG, pan: -0.3, notes: VERSE_TUNE },
  { instrument: SHORT, pan: 0.3, notes: perBar(VERSE_ARPS, arp) },
  { instrument: BASS, pan: 0, notes: perBar(VERSE_CHORDS, bassBar) },
  ...drums(8, DRUMS_STRAIGHT),
];

// The block takes the tune, in hops; the plank lies under it, held.
const HOPS: Channel[] = [
  { instrument: LONG, pan: -0.3, notes: spread("B4 | C5 | B4 | A4 | B4 | C5 | C#5 | A4", 16) },
  {
    instrument: SHORT,
    pan: 0.3,
    notes: [
      "B4 - B4 - E5 . - . G5 - F#5 - E5 . - .",
      "C5 - C5 - G5 . - . E5 - D5 - C5 . - .",
      "D5 - D5 - B5 . - . A5 - G5 - D5 - B4 -",
      "A4 - D5 - F#5 - A5 . . . - . D5 - . .",
      "B4 - B4 - E5 . - . G5 - B5 - G5 . - .",
      "C6 - B5 - A5 - G5 - E5 - G5 - C5 . - .",
      "C#5 - E5 - G5 - A5 - . . G5 - E5 - C#5 -",
      "D5 . . . F#5 . . . A5 . . . - . . .",
    ].join(" | "),
  },
  { instrument: BASS, pan: 0, notes: perBar([EM, C, G, D, EM, C, A7, D], bassBar) },
  ...drums(8, DRUMS_STRAIGHT),
];

// The perch: the block stands on the plank, hopping a third above its tune.
const PERCH: Channel[] = [
  { instrument: LONG, pan: -0.3, notes: VERSE_TUNE },
  { instrument: SHORT, pan: 0.3, notes: restrike(G_MAJOR.shift(VERSE_TUNE, 2), 2) },
  { instrument: BASS, pan: 0, notes: perBar(VERSE_CHORDS, bassBar) },
  ...drums(8, DRUMS_BUSY),
];

// The double jump: a sudden lift to B-flat, the block hopping up two
// fourths at a time while the plank holds the landing, then C and D steer
// back home.
const DOUBLE_JUMP: Channel[] = [
  { instrument: LONG, pan: -0.3, notes: spread("D5 | Eb5 | D5 | C5 | D5 | Bb4 | E5 | F#5", 16) },
  {
    instrument: SHORT,
    pan: 0.3,
    notes: [
      "F4 - Bb4 - . . F5 . . . . . - . . .",
      "G4 - C5 - . . G5 . . . Eb5 . - . . .",
      "F4 - Bb4 - . . F5 . D5 . Bb4 . F5 . D5 .",
      "C5 . . . A4 . . . F4 . . . - . . .",
      "G4 - Bb4 - . . D5 . . . G5 . - . . .",
      "G4 - C5 - . . Eb5 . . . G5 . Bb5 . . .",
      "C6 . . . G5 . . . E5 . . . C5 . . .",
      "D5 - D5 - F#5 - A5 - C6 . . . - . . .",
    ].join(" | "),
  },
  {
    instrument: BASS,
    pan: 0,
    notes: perBar(
      [
        { root: "Bb1", octave: "Bb2", fifth: "F2" },
        { root: "Eb2", octave: "Eb3", fifth: "Bb2" },
        { root: "Bb1", octave: "Bb2", fifth: "F2" },
        { root: "F2", octave: "F3", fifth: "C3" },
        { root: "G2", octave: "G3", fifth: "D3" },
        { root: "Eb2", octave: "Eb3", fifth: "Bb2" },
        C,
        D,
      ],
      bassBar,
    ),
  },
  ...drums(8, DRUMS_HALF),
];

// Home again, landing on the ribbit.
const LANDING: Channel[] = [
  { instrument: LONG, pan: -0.3, notes: spread("B4 . . D5 | A5 . . . | G5 . . F#5 | E5 . . . | B4 . . D5 | B5 . . . | A5 . . F#5 | - . . .", 4) },
  {
    instrument: SHORT,
    pan: 0.3,
    notes: [
      ...VERSE_ARPS.slice(0, 6).map(arp),
      "E4 - G4 - C5 - G4 - F#4 - A4 - D5 - A4 -",
      "G4 - G5 . . . - . . . . . . . . .",
    ].join(" | "),
  },
  { instrument: BASS, pan: 0, notes: `${perBar([G, D_OVER_FS, EM, C, G, BM], bassBar)} | ${splitBass(C, D)} | G2 . . . . . . . - . . . . . . .` },
  ...drums(7, DRUMS_STRAIGHT).map((channel, i) => ({
    ...channel,
    notes: `${channel.notes} | ${["x . . . . . . . . . . . . . . .", ". . . . . . . . . . . . . . . .", "C6 . . . . . . . . . . . . . . ."][i]}`,
  })),
];

export const LONG_AND_SHORT: Theme = {
  id: "long-and-short",
  name: "Long and Short",
  use: "Long and Short, the I and the O learning to stack.",
  mood: "Bright and bouncy, a pair of opposites getting on famously.",
  style: [
    "A Game Boy quartet, as the Pokémon games' routes are: two pulse voices, a wave bass and noise drums",
    "The pair as two voices: the long one only holds, the short one only bounces",
    "Stacking as harmony: the short voice perches a third above the long one's tune",
    "A sudden lift to B-flat for the double jump, Kirkhope-style, steered home through C and D",
  ],
  key: "G major, with a lift to B-flat",
  kind: "loop",
  bpm: 126,
  beatsPerBar: 4,
  metre: "4/4",
  instruments: [PULSE, PULSE_PIP, WAVE_BASS, KICK, SNARE, HAT],
  patterns: [INTRO, VERSE, HOPS, PERCH, DOUBLE_JUMP, LANDING],
  sequence: [0, 1, 2, 3, 4, 5],
};
