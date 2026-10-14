import { BASS, BELL, PAD, SINE_LEAD, TICK } from "./instruments";
import type { Channel, Theme } from "./song";
import { perBar, spread } from "./writing";

// The gentlest course's theme: two O pieces, two square frogs learning to
// move as one, so a slow waltz with nothing to hurry it.

interface Chord {
  root: string;
  fifth: string;
  low: string;
  high: string;
}

const CHORDS: Record<string, Chord> = {
  F: { root: "F2", fifth: "C3", low: "A4", high: "C5" },
  Bb: { root: "Bb2", fifth: "F2", low: "Bb4", high: "D5" },
  C7: { root: "C3", fifth: "G2", low: "Bb4", high: "E5" },
  Dm: { root: "D3", fifth: "A2", low: "A4", high: "D5" },
  Gm: { root: "G2", fifth: "D3", low: "G4", high: "Bb4" },
  A7: { root: "A2", fifth: "E2", low: "G4", high: "C#5" },
  Eb: { root: "Eb3", fifth: "Bb2", low: "G4", high: "Bb4" },
  Cm: { root: "C3", fifth: "G2", low: "G4", high: "Eb5" },
  F7: { root: "F2", fifth: "C3", low: "A4", high: "Eb5" },
};

const REST = ". . . . . . . . . . . .";

// Oom on the bar's first beat, the root and the fifth by turns; pah, pah on
// the other two.
function waltz(names: string): Channel[] {
  const chords = names.split(" ").map((name) => CHORDS[name]);
  return [
    { instrument: 2, pan: 0, notes: perBar(chords, (c, i) => `${i % 2 === 0 ? c.root : c.fifth} . . . . . . . . . . .`) },
    { instrument: 3, pan: -0.35, notes: perBar(chords, (c) => `. . . . ${c.low} - . . ${c.low} - . .`) },
    { instrument: 3, pan: 0.35, notes: perBar(chords, (c) => `. . . . ${c.high} - . . ${c.high} - . .`) },
  ];
}

// A soft tick on the pahs, for the sections that move along.
const TICKS: Channel = { instrument: 4, pan: 0.2, notes: Array.from({ length: 4 }, () => ". . . . x . . . x . . .").join(" | ") };
const NO_TICKS: Channel = { instrument: 4, pan: 0.2, notes: [REST, REST, REST, REST].join(" | ") };

const tune = (eighths: string): Channel => ({ instrument: 0, pan: 0, notes: spread(eighths, 2) });
const bell = (eighths: string): Channel => ({ instrument: 1, pan: 0.25, notes: spread(eighths, 2) });
const quiet = (): Channel => bell(". . . . . . | . . . . . . | . . . . . . | . . . . . .");

// The motif (`motif.ts`) as a waltz in F: hop, hop, leap, and down, the
// call landing short on G and the answer home on F.
const A1 = "F5 . C5 F5 A5 . | C6 . . . D6 C6 | A5 . F5 . D5 . | G5 . . . . -";
const A2 = "F5 . C5 F5 A5 . | C6 . . . D6 C6 | A5 . G5 . E5 . | F5 . . . . -";
// The same, with a turn in every bar.
const A1_TURNS = "F5 G5 C5 F5 A5 . | C6 . Bb5 C6 D6 C6 | A5 G5 F5 . D5 . | G5 . . . . -";
const A2_TURNS = "F5 G5 C5 F5 A5 Bb5 | C6 . Bb5 C6 D6 C6 | A5 Bb5 G5 . E5 G5 | F5 . . . . -";

export const TWO_SQUARES_WALTZ: Theme = {
  id: "two-squares-waltz",
  name: "Two Squares Waltz",
  use: "Co-op course E1, the gentle start: two O pieces.",
  mood: "Warm and unhurried: two square frogs learning to step together, one-two-three.",
  style: [
    "Pokémon's towns (Junichi Masuda, Go Ichinose): a sleepy, homely major-key tune, the calm of a town before the route, nothing to hurry it",
    "A music box: glassy bell arpeggios to open, and the bell twinkling over the turnaround",
    "A ländler-like folk waltz, the bass stepping between root and fifth, and a gentle trip through the relative minor before a new tune in B-flat",
  ],
  key: "F major, through D minor and B-flat",
  kind: "loop",
  bpm: 144,
  beatsPerBar: 3,
  instruments: [SINE_LEAD, BELL, BASS, PAD, TICK],
  patterns: [
    // 0: the music box winds up.
    [
      { instrument: 0, pan: 0, notes: [REST, REST, REST, REST].join(" | ") },
      bell("F5 A5 C6 F6 C6 A5 | F5 Bb5 D6 F6 D6 Bb5 | E5 G5 C6 E6 C6 Bb5 | A5 C6 F6 . . -"),
      ...waltz("F Bb C7 F"),
      NO_TICKS,
    ],
    // 1, 2: the tune.
    [tune(A1), quiet(), ...waltz("F F Dm C7"), TICKS],
    [tune(A2), quiet(), ...waltz("F F C7 F"), TICKS],
    // 3, 4: the tune again, turning, the bell an echo behind it.
    [tune(A1_TURNS), bell(". . . . F6 . | . . . . D6 . | . . . . C6 . | . . . . A5 ."), ...waltz("F F Dm C7"), TICKS],
    [tune(A2_TURNS), bell(". . . . A6 . | . . . . F6 . | . . . . E6 . | . . . . F6 ."), ...waltz("F F C7 F"), TICKS],
    // 5, 6: a wistful turn through D minor.
    [tune("A5 . . . F5 D5 | Bb5 . . . G5 D5 | E5 . G5 . Bb5 . | A5 . . . . -"), quiet(), ...waltz("Dm Gm C7 F"), NO_TICKS],
    [tune("D6 . . . Bb5 F5 | G5 . Bb5 . D6 . | C#6 . A5 . G5 . | F5 . . . D5 -"), quiet(), ...waltz("Bb Gm A7 Dm"), NO_TICKS],
    // 7: the turnaround, the bell twinkling alone.
    [
      tune(". . . . . . | . . . . . . | . . . . . . | . . . . . ."),
      bell("D6 F6 Bb6 F6 D6 Bb5 | E6 G6 Bb6 G6 E6 C6 | D6 F6 Bb6 F6 D6 Bb5 | E6 . C6 . . -"),
      ...waltz("Bb C7 Bb C7"),
      NO_TICKS,
    ],
    // 8, 9: a new tune in B-flat, then home through C7.
    [tune("F5 . . . D5 F5 | G5 . . . Bb5 . | Eb5 . G5 . C6 . | A5 . . . . -"), quiet(), ...waltz("Bb Gm Cm F7"), TICKS],
    [tune("F5 . D5 . F5 Bb5 | D6 . . . Bb5 G5 | E5 . G5 . Bb5 . | C6 . . . . -"), quiet(), ...waltz("Bb Gm C7 C7"), TICKS],
    // 10: the bow, back to the music box.
    [tune("A5 . . . C6 . | G5 . . . E5 . | F5 . . . . . | . . . . . -"), quiet(), ...waltz("F C7 F C7"), NO_TICKS],
  ],
  sequence: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 10],
};
