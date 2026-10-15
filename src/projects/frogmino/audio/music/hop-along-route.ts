import { BASS, BELL, PULSE, SINE_LEAD, SNARE, THUMP, TICK } from "./instruments";
import { MOTIF_ANSWER, MOTIF_CALL } from "./motif";
import type { Channel, Theme } from "./song";
import { perBar, spread, transpose } from "./writing";

// A theme for a course still to come: setting out down the road. A route march, the motif
// in its plainest form, with a quiet town to pass through on the way.

interface Chord {
  root: string;
  fifth: string;
  low: string;
  high: string;
}

const CHORDS: Record<string, Chord> = {
  C: { root: "C3", fifth: "G2", low: "E4", high: "G4" },
  Am: { root: "A2", fifth: "E3", low: "E4", high: "A4" },
  F: { root: "F2", fifth: "C3", low: "F4", high: "A4" },
  G7: { root: "G2", fifth: "D3", low: "F4", high: "B4" },
  G: { root: "G2", fifth: "D3", low: "D4", high: "B4" },
  Em: { root: "E2", fifth: "B2", low: "E4", high: "G4" },
  Bb: { root: "Bb2", fifth: "F2", low: "D4", high: "F4" },
  Dm: { root: "D3", fifth: "A2", low: "D4", high: "F4" },
  C7: { root: "C3", fifth: "G2", low: "E4", high: "Bb4" },
};

const REST = ". . . . . . . . . . . . . . . .";
const RESTS = [REST, REST, REST, REST].join(" | ");

const chordsOf = (names: string): Chord[] => names.split(" ").map((name) => CHORDS[name]);

// The march: a punchy bass in eighths, the second pulse holding the chord, a
// kick and a snare with a little roll, and the hats.
function march(names: string): Channel[] {
  const chords = chordsOf(names);
  const bars = (bar: string): string => perBar(chords, () => bar);
  return [
    {
      instrument: 3,
      pan: 0,
      notes: perBar(
        chords,
        (c) => `${c.root} . ${c.fifth} . ${c.root} . ${c.fifth} . ${c.root} . ${c.fifth} . ${c.root} . ${transpose(c.root, 12)} .`,
      ),
    },
    { instrument: 0, pan: 0.35, notes: perBar(chords, (c) => `${c.high} . . . . . . - ${c.low} . . . . . . -`) },
    { instrument: 4, pan: 0, notes: bars("x . . . . . . . x . x . . . . .") },
    { instrument: 5, pan: -0.1, notes: bars(". . . . x . . . . . . . x . x x") },
    { instrument: 6, pan: 0.3, notes: bars("x . x . x . x . x . x . x . x .") },
  ];
}

// The town: the bass on the beat, the bell for chords, nothing to march to.
function town(names: string): Channel[] {
  const chords = chordsOf(names);
  return [
    { instrument: 3, pan: 0, notes: perBar(chords, (c) => `${c.root} . . . . . . . ${c.fifth} . . . . . . .`) },
    {
      instrument: 2,
      pan: 0.35,
      notes: perBar(chords, (c) => `. . . . ${transpose(c.high, 12)} . . . . . . . ${transpose(c.low, 12)} . . .`),
    },
    { instrument: 4, pan: 0, notes: RESTS },
    { instrument: 5, pan: -0.1, notes: RESTS },
    { instrument: 6, pan: 0.3, notes: perBar(chords, () => ". . . . x . . . . . . . x . . .") },
  ];
}

// The route's lead is the pulse; the town's, a soft sine.
const route = (eighths: string): Channel[] => [
  { instrument: 0, pan: -0.2, notes: spread(eighths, 2) },
  { instrument: 1, pan: -0.2, notes: RESTS },
];
const quiet = (eighths: string): Channel[] => [
  { instrument: 0, pan: -0.2, notes: RESTS },
  { instrument: 1, pan: -0.2, notes: spread(eighths, 2) },
];

const [MOTIF_START] = MOTIF_ANSWER.split(" | ");

export const HOP_ALONG_ROUTE: Theme = {
  id: "hop-along-route",
  name: "Hop Along Route",
  use: "No course yet: a run down the road, for a course to come.",
  mood: "Bright and adventurous: setting out, with somewhere to get to.",
  style: [
    "Pokémon's routes (Junichi Masuda, Go Ichinose): a catchy pulse-wave hook over a punchy marching bass and snare, in an adventurous major key",
    "Pokémon's town-to-route contrast: halfway, a quiet town in F, a soft sine tune over a bell, before the march picks up again",
    "The Frogmino motif in its plainest form, in C: hop, hop, leap, and tumble down",
  ],
  key: "C major, through A minor and F",
  kind: "loop",
  bpm: 138,
  beatsPerBar: 4,
  instruments: [PULSE, SINE_LEAD, BELL, BASS, THUMP, SNARE, TICK],
  patterns: [
    // 0: setting out.
    [...route("G4 . C5 . E5 . G5 . | C6 . . . . . - . | G4 . C5 . E5 . G5 . | A5 . G5 . F5 . D5 ."), ...march("C C C G7")],
    // 1, 2: the motif, and on down the road.
    [...route(`${MOTIF_CALL} | F5 . C5 F5 A5 . C6 . | B5 A5 G5 F5 D5 . G4 .`), ...march("C Am F G7")],
    [...route(`${MOTIF_START} | A5 G5 E5 C5 D5 . . . | E5 . D5 E5 G5 . C6 . | D6 . B5 . G5 . F5 .`), ...march("C Am C G7")],
    // 3, 4: further afield.
    [...route("E5 . . . A5 . . . | G5 . . . . . E5 . | F5 . . . A5 . C6 . | B5 . . . G5 . . ."), ...march("Am Em F G")],
    [...route("A5 . . . C6 . . . | B5 . . . D6 . . . | C6 . E6 . D6 . C6 . | B5 . A5 . G5 . . ."), ...march("F G Am G")],
    // 5, 6: through the town.
    [...quiet("F5 . C5 . F5 . A5 . | C6 . . . . . . . | D6 . C6 . A5 . F5 . | G5 . . . . . . ."), ...town("F F Bb C7")],
    [...quiet("F5 . C5 . F5 . A5 . | C6 . . . Bb5 . A5 . | G5 . A5 . Bb5 . E5 . | F5 . . . . . . ."), ...town("F Dm C7 F")],
  ],
  sequence: [0, 1, 2, 3, 4, 1, 2, 5, 6, 0, 1, 2, 3, 4],
};
