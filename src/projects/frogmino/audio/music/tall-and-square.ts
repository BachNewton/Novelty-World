import { PAD, THUMP, TICK } from "./instruments";
import { Shape } from "../sounds";
import type { Channel, Instrument, Theme } from "./song";
import { perBar, transpose } from "./writing";

// The odd couple's theme: a long thin I and a round square O. The O is a
// tuba, plodding and proud; the I a piccolo, high and skinny. They take turns
// with the tune, then play it together, four octaves apart.

const TUBA: Instrument = {
  name: "Tuba",
  base: "B2",
  zzfx: {
    volume: 1,
    attack: 0.012,
    decay: 0.08,
    sustain: 0.12,
    sustainVolume: 0.7,
    release: 0.08,
    shape: Shape.triangle,
    filter: -900,
  },
};

const PICCOLO: Instrument = {
  name: "Piccolo",
  base: "B5",
  zzfx: { volume: 0.4, attack: 0.012, decay: 0.05, sustain: 0.08, sustainVolume: 0.6, release: 0.08 },
};

interface Chord {
  root: string;
  fifth: string;
  low: string;
  high: string;
}

const CHORDS: Record<string, Chord> = {
  Bb: { root: "Bb2", fifth: "F2", low: "D4", high: "F4" },
  G7: { root: "G2", fifth: "D3", low: "F4", high: "B4" },
  Cm: { root: "C3", fifth: "G2", low: "Eb4", high: "G4" },
  F7: { root: "F2", fifth: "C3", low: "Eb4", high: "A4" },
  Gm: { root: "G2", fifth: "D3", low: "D4", high: "Bb4" },
  D7: { root: "D3", fifth: "A2", low: "C4", high: "F#4" },
  C7: { root: "C3", fifth: "G2", low: "E4", high: "Bb4" },
  F: { root: "F2", fifth: "C3", low: "C4", high: "A4" },
};

const up = (chord: Chord, semitones: number): Chord => ({
  root: transpose(chord.root, semitones),
  fifth: transpose(chord.fifth, semitones),
  low: transpose(chord.low, semitones),
  high: transpose(chord.high, semitones),
});

const REST = ". . . . . . . . . . . . . . . .";

// The motif (`motif.ts`) on the tuba, swung, slipping chromatically
// through G7.
const TUBA_TUNE_1 =
  "Bb2 . . F2 Bb2 . . D3 F3 . . . . . . . | G3 . . F3 D3 . . B2 C3 . . . - . . . | C3 . . Eb3 G3 . . . C4 . . Bb3 G3 . . . | F3 . . . A3 . . . C4 . . . - . . .";
const TUBA_TUNE_2 =
  "Bb2 . . F2 Bb2 . . D3 F3 . . . . . . . | G3 . . F3 D3 . . B2 C3 . . Eb3 G3 . . . | C4 . . Bb3 G3 . . . F3 . . A3 C4 . . . | Bb3 . . . F3 . . . Bb2 . . . - . . .";
// The piccolo's twitter at the end of every other bar, answering the tuba.
const FILLS_1 = `${REST} | . . . . . . . . . . . . D6 F6 G6 . | ${REST} | . . . . . . . . . . . . A6 G6 F6 Eb6`;
const FILLS_2 = `${REST} | . . . . . . . . . . . . D6 F6 G6 . | ${REST} | . . . . . . . . . . . . F6 D6 Bb5 .`;
const PICCOLO_TUNE_1 =
  "D6 . . Bb5 G5 . . . D6 . . Eb6 D6 . . . | C6 . . A5 F#5 . . . D5 . . F#5 A5 . . . | Bb5 . . G5 D5 . . . G5 . . A5 Bb5 . . . | C6 . . . E6 . . . G6 . . . - . . .";
const PICCOLO_TUNE_2 =
  "A5 . . C6 F6 . . . E6 . . D6 C6 . . . | D6 . . . Bb5 . . . F5 . . G5 A5 . . . | Bb5 . . . G5 . . . E5 . . G5 C6 . . . | A5 . . . . . . . Eb6 . . C6 A5 . F5 .";

function chordsOf(names: string, semitones: number): Chord[] {
  return names.split(" ").map((name) => up(CHORDS[name], semitones));
}

// Pahs on two and four, a swung shaker and a soft kick.
function backing(chords: readonly Chord[]): Channel[] {
  const bars = (bar: string): string => perBar(chords, () => bar);
  return [
    { instrument: 2, pan: -0.3, notes: perBar(chords, (c) => `. . . . ${c.low} - . . . . . . ${c.low} - . .`) },
    { instrument: 2, pan: 0.3, notes: perBar(chords, (c) => `. . . . ${c.high} - . . . . . . ${c.high} - . .`) },
    { instrument: 3, pan: 0.2, notes: bars("x . . x x . . x x . . x x . . x") },
    { instrument: 4, pan: 0, notes: bars("x . . . . . . . x . . . . . . .") },
  ];
}

// The tuba keeping time, root and fifth, while the piccolo has the tune.
const oom = (chords: readonly Chord[]): string => perBar(chords, (c) => `${c.root} . . . - . . . ${c.fifth} . . . - . . .`);

const tubaLeads = (tune: string, fills: string, names: string): Channel[] => [
  { instrument: 0, pan: -0.15, notes: tune },
  { instrument: 1, pan: 0.4, notes: fills },
  ...backing(chordsOf(names, 0)),
];

const piccoloLeads = (tune: string, names: string, semitones: number): Channel[] => {
  const chords = chordsOf(names, semitones);
  return [{ instrument: 0, pan: -0.15, notes: oom(chords) }, { instrument: 1, pan: 0.4, notes: tune }, ...backing(chords)];
};

const both = (tune: string, names: string): Channel[] => [
  { instrument: 0, pan: -0.15, notes: tune },
  { instrument: 1, pan: 0.4, notes: transpose(tune, 36) },
  ...backing(chordsOf(names, 0)),
];

export const TALL_AND_SQUARE: Theme = {
  id: "tall-and-square",
  name: "Tall and Square",
  use: "Co-op course E3, the odd couple: an I and an O.",
  mood: "Comic and good-natured: a plodding tuba and a twittering piccolo who turn out to make a fine pair.",
  style: [
    "Grant Kirkhope (Banjo-Kazooie): a proud, waddling tuba carrying the tune, and a piccolo chirping back, a cartoon double act",
    "Grant Kirkhope: jazzy secondary dominants (B-flat, G7, C minor, F7) and a sudden lift into a far key, D-flat, for the piccolo's turn",
    "The Frogmino motif on the tuba, swung, with a chromatic slip through G7",
    "A swung, shuffling beat (long-short), and the tune at last in both voices together, four octaves apart",
  ],
  key: "B-flat major, lifting to D-flat",
  kind: "loop",
  bpm: 108,
  beatsPerBar: 4,
  instruments: [TUBA, PICCOLO, PAD, TICK, THUMP],
  patterns: [
    // 0, 1: the tuba's tune, the piccolo chirping back.
    tubaLeads(TUBA_TUNE_1, FILLS_1, "Bb G7 Cm F7"),
    tubaLeads(TUBA_TUNE_2, FILLS_2, "Bb G7 Cm Bb"),
    // 2, 3: the piccolo's own tune, the tuba keeping time.
    piccoloLeads(PICCOLO_TUNE_1, "Gm D7 Gm C7", 0),
    piccoloLeads(PICCOLO_TUNE_2, "F Bb C7 F7", 0),
    // 4, 5: up to D-flat, the piccolo borrowing the tuba's tune.
    piccoloLeads(transpose(TUBA_TUNE_1, 39), "Bb G7 Cm F7", 3),
    piccoloLeads(transpose(TUBA_TUNE_2, 39), "Bb G7 Cm Bb", 3),
    // 6, 7: back in B-flat, the two of them on it together.
    both(TUBA_TUNE_1, "Bb G7 Cm F7"),
    both(TUBA_TUNE_2, "Bb G7 Cm F7"),
  ],
  sequence: [0, 1, 2, 3, 4, 5, 6, 7, 2, 3],
};
