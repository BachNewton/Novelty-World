import { BASS, PAD, THUMP, TICK } from "./instruments";
import { type Channel, type Instrument, type Theme } from "./song";
import { perBar, spread, transpose } from "./writing";

// The interlocking course's theme: two T pieces nesting, one pointing up and
// one down. The tune is a hocket: its notes are dealt out to the two frogs by
// turns, left and right, so neither plays it alone and together they play it
// whole.

// A steel pan: a sine struck bright and left to ring a little.
const PAN: Instrument = {
  name: "Steel pan",
  base: "B4",
  zzfx: { volume: 0.65, attack: 0.002, decay: 0.12, sustain: 0.04, sustainVolume: 0.3, release: 0.16 },
};

// A wood-block clave: a short, high knock.
const CLAVE: Instrument = {
  name: "Clave",
  base: "B5",
  zzfx: { volume: 0.22, attack: 0.001, decay: 0.02, release: 0.02, filter: -4000 },
};

interface Chord {
  root: string;
  fifth: string;
  low: string;
  high: string;
}

const CHORDS: Record<string, Chord> = {
  G: { root: "G2", fifth: "D3", low: "B4", high: "D5" },
  C: { root: "C3", fifth: "G2", low: "C5", high: "E5" },
  D7: { root: "D3", fifth: "A2", low: "C5", high: "F#5" },
  Em: { root: "E2", fifth: "B2", low: "B4", high: "E5" },
  Am: { root: "A2", fifth: "E3", low: "C5", high: "E5" },
  B7: { root: "B2", fifth: "F#2", low: "A4", high: "D#5" },
};

const REST = ". . . . . . . . . . . . . . . .";
const RESTS = [REST, REST, REST, REST].join(" | ");

// The calypso band: the bass on three-three-two, the chords stabbing the
// off-beats, a shaker, a soft kick and the clave's three-two.
function band(names: string, drums = true): Channel[] {
  const chords = names.split(" ").map((name) => CHORDS[name]);
  const bars = (bar: string): string => perBar(chords, () => bar);
  return [
    { instrument: 1, pan: 0, notes: perBar(chords, (c) => `${c.root} . . . . . ${c.fifth} . . . . . ${c.root} . - .`) },
    { instrument: 2, pan: -0.25, notes: perBar(chords, (c) => `. . ${c.low} - . . ${c.low} - . . ${c.low} - . . ${c.low} -`) },
    { instrument: 2, pan: 0.25, notes: perBar(chords, (c) => `. . ${c.high} - . . ${c.high} - . . ${c.high} - . . ${c.high} -`) },
    { instrument: 3, pan: 0.3, notes: bars(drums ? "x . x x x . x x x . x x x . x x" : REST) },
    { instrument: 4, pan: 0, notes: bars(drums ? "x . . . . . . . x . . . . . . ." : REST) },
    { instrument: 5, pan: -0.3, notes: perBar(chords, (_, i) => (i % 2 === 0 ? "x . . . . . x . . . . . x . . ." : ". . . . x . . . x . . . . . . .")) },
  ];
}

// The tune in eighths, dealt out note by note: Sprout's notes on the left,
// Splash's on the right.
function hocket(eighths: string): Channel[] {
  const line = spread(eighths, 2);
  let turn = 0;
  const left: string[] = [];
  const right: string[] = [];
  for (const token of line.split(" ")) {
    if (token === "|" || token === "." || token === "-") {
      left.push(token);
      right.push(token);
      continue;
    }
    (turn % 2 === 0 ? left : right).push(token);
    (turn % 2 === 0 ? right : left).push(".");
    turn++;
  }
  return [
    { instrument: 0, pan: -0.6, notes: left.join(" ") },
    { instrument: 0, pan: 0.6, notes: right.join(" ") },
  ];
}

// One voice, the other resting.
function call(eighths: string, side: "left" | "right"): Channel[] {
  const line = { instrument: 0, notes: spread(eighths, 2) };
  const rest = { instrument: 0, notes: RESTS };
  return side === "left"
    ? [{ ...line, pan: -0.6 }, { ...rest, pan: 0.6 }]
    : [{ ...rest, pan: -0.6 }, { ...line, pan: 0.6 }];
}

// Both voices on the tune together, an octave apart.
function together(eighths: string, lower: string): Channel[] {
  return [
    { instrument: 0, pan: -0.6, notes: spread(eighths, 2) },
    { instrument: 0, pan: 0.6, notes: spread(lower, 2) },
  ];
}

// The motif (`motif.ts`) in G, calypso style.
const A1 = "G5 . D5 G5 B5 . D6 . | E6 D6 B5 G5 A5 . . . | F#5 . A5 F#5 . D5 E5 F#5 | G5 . D5 . G5 . - .";
const A2 = "G5 . D5 G5 B5 . D6 . | E6 D6 B5 A5 G5 . E5 . | F#5 A5 . D6 . C6 A5 F#5 | G5 . . . - . . .";

export const TEE_TIME: Theme = {
  id: "tee-time",
  name: "Tee Time",
  use: "Co-op course E2, the interlock: two T pieces.",
  mood: "Sunny and playful: two Ts nesting, each with half the tune, neither complete without the other.",
  style: [
    "Grant Kirkhope's beach and island worlds: the tune reorchestrated for steel pans, sunny and lazy",
    "The Frogmino motif in G, played calypso",
    "Calypso: steel pans over a bass on three-three-two, chords stabbing the off-beats, a shaker and the clave's three-two",
    "A hocket, as in medieval and Andean music: the tune dealt out note by note between two voices panned apart, so they interlock",
    "Call and response: one pan calls across the road and the other answers, then both play the tune together, an octave apart",
  ],
  key: "G major, through E minor",
  kind: "loop",
  bpm: 116,
  beatsPerBar: 4,
  instruments: [PAN, BASS, PAD, TICK, THUMP, CLAVE],
  patterns: [
    // 0, 1: the tune, dealt out between the two pans.
    [...hocket(A1), ...band("G C D7 G")],
    [...hocket(A2), ...band("G C D7 G")],
    // 2, 3: call and answer across the road, in E minor.
    [
      ...call("E5 G5 B5 . A5 G5 E5 . | A5 . C6 . B5 A5 E5 . | . . . . . . . . | . . . . . . . .", "left"),
      ...band("Em Am D7 G"),
    ],
    [
      ...call(". . . . . . . . | . . . . . . . . | F#5 D5 A4 . C5 D5 F#5 . | G5 . D5 . B4 . - .", "right"),
      ...band("Em Am D7 G"),
    ],
    // 4: the band alone, the pans trading single notes.
    [...hocket(". . G5 . . . D5 . | . . E5 . . . C5 . | . . F#5 . . . A5 . | G5 . . . B5 . . ."), ...band("G C D7 G", false)],
    // 5, 6: the tune with both pans together.
    [...together(A1, transpose(A1, -12)), ...band("G C D7 G")],
    [...together(A2, transpose(A2, -12)), ...band("G C D7 G")],
  ],
  sequence: [0, 1, 0, 1, 2, 3, 4, 2, 3, 5, 6],
};
