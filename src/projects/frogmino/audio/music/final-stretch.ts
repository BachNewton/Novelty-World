import { BASS, PLUCK, PULSE, SNARE, THUMP, TICK } from "./instruments";
import type { Channel, Theme } from "./song";
import { perBar, spread, transpose } from "./writing";

// The hard course's theme: everything the team has learned, at full tilt. A
// battle theme, driving and urgent, but still a game: it never stops being
// fun.

interface Chord {
  root: string;
  tones: readonly [string, string, string, string];
  low: string;
  high: string;
}

const CHORDS: Record<string, Chord> = {
  Am: { root: "A2", tones: ["A4", "C5", "E5", "A5"], low: "C5", high: "E5" },
  F: { root: "F2", tones: ["F4", "A4", "C5", "F5"], low: "C5", high: "F5" },
  G: { root: "G2", tones: ["G4", "B4", "D5", "G5"], low: "D5", high: "G5" },
  E: { root: "E2", tones: ["E4", "G#4", "B4", "E5"], low: "B4", high: "G#5" },
  Dm: { root: "D3", tones: ["D4", "F4", "A4", "D5"], low: "D5", high: "F5" },
  C: { root: "C3", tones: ["C4", "E4", "G4", "C5"], low: "E5", high: "G5" },
};

const REST = ". . . . . . . . . . . . . . . .";
const RESTS = [REST, REST, REST, REST].join(" | ");

// The battle band: a bass driving octaves in eighths, a kick on every beat,
// the snare on two and four and the hats in between.
function drive(chords: readonly Chord[], snare = ". . . . x . . . . . . . x . . ."): Channel[] {
  const bars = (bar: string): string => perBar(chords, () => bar);
  return [
    {
      instrument: 2,
      pan: 0,
      notes: perBar(chords, (c) => {
        const octave = transpose(c.root, 12);
        return `${c.root} . ${octave} . ${c.root} . ${octave} . ${c.root} . ${octave} . ${c.root} . ${octave} .`;
      }),
    },
    { instrument: 3, pan: 0, notes: bars("x . . . x . . . x . . . x . . .") },
    { instrument: 4, pan: -0.1, notes: bars(snare) },
    { instrument: 5, pan: 0.3, notes: bars(". . x . . . x . . . x . . . x .") },
  ];
}

const chordsOf = (names: string): Chord[] => names.split(" ").map((name) => CHORDS[name]);

// The second pulse holding the chord under the lead, two notes a bar.
const held = (chords: readonly Chord[]): Channel => ({
  instrument: 0,
  pan: 0.35,
  notes: perBar(chords, (c) => `${c.low} . . . . . . . ${c.high} . . . . . . -`),
});

// Sixteenth arpeggios up and down each chord.
const arpeggio = (chords: readonly Chord[]): Channel => ({
  instrument: 1,
  pan: -0.35,
  notes: perBar(chords, ({ tones: [a, b, c, d] }) => `${a} ${b} ${c} ${d} ${c} ${b} ${a} ${b} ${c} ${d} ${c} ${b} ${a} ${b} ${c} ${d}`),
});
const noArpeggio: Channel = { instrument: 1, pan: -0.35, notes: RESTS };

function section(tune: string, names: string, withArpeggio: boolean): Channel[] {
  const chords = chordsOf(names);
  return [
    { instrument: 0, pan: -0.15, notes: tune },
    held(chords),
    withArpeggio ? arpeggio(chords) : noArpeggio,
    ...drive(chords),
  ];
}

// The motif (`motif.ts`) in A minor, at a battle's pace.
const FIGHT_1 = spread("A5 . E5 A5 C6 . E6 . | F6 E6 C6 A5 B5 . . . | G5 . D5 G5 B5 . D6 . | E6 D6 B5 G#5 E5 . . .", 2);
const FIGHT_2 = spread("A5 . E5 A5 C6 . E6 . | F6 E6 C6 B5 A5 . . . | D6 . A5 D6 F6 . E6 D6 | B5 . G#5 . E5 . . .", 2);
// The heroic turn into C major.
const HERO_1 = spread("G5 . . . C6 . . . | B5 . . . D6 . . . | C6 . . . E6 . . . | F6 . . . . . E6 D6", 2);
const HERO_2 = spread("E6 . . . C6 . A5 . | D6 . . . B5 . G5 . | C6 . . . A5 . F5 . | E5 . . . G#5 . B5 .", 2);

// The intro: a chromatic plunge, then the band hits.
const PLUNGE = "E6 D#6 D6 C#6 C6 B5 A#5 A5 G#5 G5 F#5 F5 E5 D#5 D5 C#5";
const INTRO: Channel[] = [
  {
    instrument: 0,
    pan: -0.15,
    notes: `${PLUNGE} | ${transpose(PLUNGE, -12)} | A4 . . A4 . . A4 . A4 . . . E5 . . . | A4 . . A4 . . A4 . A4 . . . G#4 . . .`,
  },
  { instrument: 0, pan: 0.35, notes: `${REST} | ${REST} | E4 . . E4 . . E4 . E4 . . . B4 . . . | E4 . . E4 . . E4 . E4 . . . E4 . . .` },
  noArpeggio,
  ...drive(chordsOf("E E Am E"), "x x x x x x x x x x x x x x x x"),
];

// The break: the arpeggios alone with the bass, building back up.
const BREAK: Channel[] = [
  { instrument: 0, pan: -0.15, notes: RESTS },
  { instrument: 0, pan: 0.35, notes: RESTS },
  arpeggio(chordsOf("Am Am F E")),
  ...drive(chordsOf("Am Am F E"), REST),
];

// Up a whole tone, drums and all but the drums.
const lifted = (channels: readonly Channel[]): Channel[] =>
  channels.map((channel) => (channel.instrument >= 3 ? channel : { ...channel, notes: transpose(channel.notes, 2) }));

export const FINAL_STRETCH: Theme = {
  id: "final-stretch",
  name: "Final Stretch",
  use: "Co-op course H1, the hard course.",
  mood: "Driving and urgent but still fun: the big fight at the end of the road.",
  style: [
    "Pokémon's trainer battles (Junichi Masuda): a chromatic plunge to open, a bass driving octaves in eighths, a kick on every beat and pulse leads urgent in a minor key",
    "Pokémon's battle music: the hook turning heroic in the relative major, and a breakdown of racing arpeggios before the fight goes on",
    "The Frogmino motif in A minor, at full tilt",
    "Grant Kirkhope: the fight's last time round lifted a whole tone, into B minor, for the final push",
  ],
  key: "A minor, through C major, lifting to B minor",
  kind: "loop",
  bpm: 168,
  beatsPerBar: 4,
  instruments: [PULSE, PLUCK, BASS, THUMP, SNARE, TICK],
  patterns: [
    // 0: the plunge and the hits.
    INTRO,
    // 1, 2: the fight.
    section(FIGHT_1, "Am F G E", false),
    section(FIGHT_2, "Am F Dm E", true),
    // 3, 4: the heroic turn.
    section(HERO_1, "C G Am F", true),
    section(HERO_2, "Am G F E", true),
    // 5: the break.
    BREAK,
    // 6, 7: the fight a whole tone up.
    lifted(section(FIGHT_1, "Am F G E", true)),
    lifted(section(FIGHT_2, "Am F Dm E", true)),
  ],
  sequence: [0, 1, 2, 1, 2, 3, 4, 5, 6, 7, 3, 4],
};
