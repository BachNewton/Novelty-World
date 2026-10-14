import { BASS, PAD, TICK } from "./instruments";
import { Shape } from "../sounds";
import type { Channel, Instrument, Theme } from "./song";
import { perBar, Scale, spread, transpose } from "./writing";

// The mirror pair's theme: an S and a Z, each the other's reflection. A
// two-part invention where one voice plays a phrase and the other answers
// with its mirror image, rising where it fell, note for note along the scale.

// A harpsichord: a bright pluck, softened.
const HARPSICHORD: Instrument = {
  name: "Harpsichord",
  base: "B4",
  zzfx: {
    volume: 0.32,
    attack: 0.002,
    decay: 0.12,
    sustain: 0.03,
    sustainVolume: 0.25,
    release: 0.12,
    shape: Shape.saw,
    filter: -2600,
  },
};

const E_MINOR = new Scale(["E", "F#", "G", "A", "B", "C", "D"]);

interface Chord {
  root: string;
  fifth: string;
  low: string;
  high: string;
}

const CHORDS: Record<string, Chord> = {
  Em: { root: "E2", fifth: "B2", low: "G4", high: "B4" },
  Am: { root: "A2", fifth: "E3", low: "A4", high: "C5" },
  G: { root: "G2", fifth: "D3", low: "G4", high: "B4" },
  Bm: { root: "B2", fifth: "F#3", low: "F#4", high: "B4" },
  C: { root: "C3", fifth: "G2", low: "G4", high: "C5" },
  D: { root: "D3", fifth: "A2", low: "F#4", high: "A4" },
  D7: { root: "D3", fifth: "A2", low: "F#4", high: "C5" },
  B7: { root: "B2", fifth: "F#2", low: "D#4", high: "A4" },
};

// The continuo: the bass leaping octaves in eighths, a plucked chord on each
// beat, and a tick.
function continuo(names: string): Channel[] {
  const chords = names.split(" ").map((name) => CHORDS[name]);
  return [
    {
      instrument: 1,
      pan: 0,
      notes: perBar(chords, (c) => {
        const octave = transpose(c.root, 12);
        return `${c.root} . ${octave} . ${c.fifth} . ${octave} . ${c.root} . ${octave} . ${c.fifth} . ${octave} .`;
      }),
    },
    { instrument: 2, pan: 0.15, notes: perBar(chords, (c) => `${c.low} - . . ${c.high} - . . ${c.low} - . . ${c.high} - . .`) },
    { instrument: 3, pan: 0.3, notes: perBar(chords, () => ". . x . . . x . . . x . . . x .") },
  ];
}

const QUIET = ". . . . . . . . . . . . . . . . | . . . . . . . . . . . . . . . .";

// A two-bar phrase in sixteenths on one side, then its mirror on the other.
function phraseAndMirror(phrase: string, axis: string, leader: "left" | "right"): Channel[] {
  const mirrored = E_MINOR.mirror(phrase, axis);
  const leading = { instrument: 0, notes: `${phrase} | ${QUIET}` };
  const answering = { instrument: 0, notes: `${QUIET} | ${mirrored}` };
  return leader === "left"
    ? [{ ...leading, pan: -0.6 }, { ...answering, pan: 0.6 }]
    : [{ ...answering, pan: -0.6 }, { ...leading, pan: 0.6 }];
}

const both = (left: string, right: string): Channel[] => [
  { instrument: 0, pan: -0.6, notes: spread(left, 2) },
  { instrument: 0, pan: 0.6, notes: spread(right, 2) },
];

// The motif (`motif.ts`) in E minor: the call, then the answer.
const CALL = spread("E5 . B4 E5 G5 . B5 . | C6 B5 G5 E5 F#5 . . .", 2);
const ANSWER = spread("E5 . B4 E5 G5 . B5 . | C6 B5 G5 F#5 E5 . . .", 2);
// The motif's leap, run up and down in sixteenths.
const RUN =
  "B5 A5 G5 F#5 E5 F#5 G5 A5 B5 . E5 . B4 . . . | C6 B5 A5 G5 F#5 G5 A5 B5 C6 . A5 . E5 . . .";
// In G, its relative major, for the right-hand voice to lead.
const G_CALL = spread("G5 . D5 G5 B5 . D6 . | E6 D6 B5 G5 A5 . . .", 2);
const G_RUN = "D6 C6 B5 A5 G5 A5 B5 C6 D6 . G5 . D5 . . . | E6 D6 C6 B5 A5 B5 C6 D6 E6 . C6 . G5 . . .";

export const MIRROR_MIRROR: Theme = {
  id: "mirror-mirror",
  name: "Mirror, Mirror",
  use: "Co-op course M1, the mirror pair: an S and a Z.",
  mood: "Clever and a little spooky: two voices that copy each other, upside down.",
  style: [
    "Grant Kirkhope's haunted-house worlds (Mad Monster Mansion): the world theme reorchestrated for harpsichord in a minor key, creeping and playful",
    "A Baroque two-part invention: a continuo bass leaping octaves, and each phrase answered by its mirror image (inversion) in the other voice",
    "The Frogmino motif in E minor, and in G for the turn where the voices swap roles",
    "Grant Kirkhope: a sudden lurch up a semitone, into F minor, before the cadence pulls it home",
  ],
  key: "E minor, through G major and F minor",
  kind: "loop",
  bpm: 120,
  beatsPerBar: 4,
  instruments: [HARPSICHORD, BASS, PAD, TICK],
  patterns: [
    // 0, 1, 2: the left voice leads, the right mirrors it about G.
    [...phraseAndMirror(CALL, "G5", "left"), ...continuo("Em Am Em G")],
    [...phraseAndMirror(ANSWER, "G5", "left"), ...continuo("Em Am Em Em")],
    [...phraseAndMirror(RUN, "G5", "left"), ...continuo("Em Am Em Bm")],
    // 3: the cadence, both voices together, moving apart and back.
    [
      ...both(
        "C6 . . . G5 . E5 . | A5 . . . C6 . B5 A5 | B5 . A5 . F#5 . D#5 . | E5 . . . . . - .",
        "E5 . G5 . C6 . G5 . | C5 . E5 . A5 . E5 . | D#5 . F#5 . A5 . B5 . | B4 . . . . . - .",
      ),
      ...continuo("C Am B7 Em"),
    ],
    // 4, 5: in G, the right voice leads and the left mirrors it about B.
    [...phraseAndMirror(G_CALL, "B5", "right"), ...continuo("G C G D7")],
    [...phraseAndMirror(G_RUN, "B5", "right"), ...continuo("G C G D")],
    // 6: the way back to E minor.
    [
      ...both(
        "E6 . . . C6 . G5 . | F#5 . . . A5 . D6 . | D#6 . . . B5 . A5 . | F#5 . D#5 . B4 . . .",
        "C5 . E5 . G5 . E5 . | D5 . F#5 . A5 . F#5 . | B4 . D#5 . F#5 . A5 . | B5 . A5 . F#5 . D#5 .",
      ),
      ...continuo("C D B7 B7"),
    ],
    // 7: the run again, lurched up a semitone into F minor.
    [...phraseAndMirror(RUN, "G5", "left"), ...continuo("Em Am Em Bm")].map((channel) =>
      channel.instrument === 3 ? channel : { ...channel, notes: transpose(channel.notes, 1) },
    ),
  ],
  sequence: [0, 1, 2, 3, 4, 5, 6, 0, 1, 7, 3],
};
