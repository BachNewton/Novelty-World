import { CALLIOPE, HAT, KAZOO, KICK, SNARE, TUBA } from "./instruments";
import type { Channel, Theme } from "./song";
import { perBar, repeat, Scale, spread } from "./writing";

// Leg Up (L and J): the mirror pair climbs onto each other's backs, hops off
// over a van, and crosses to the other side and back. A circus acrobats' jig
// in 6/8 for a kazoo and a calliope, the L and the J: every phrase the kazoo
// plays, the calliope answers in mirror image, turned upside down about the
// key's fifth, which turns the home chord into the dominant, so the mirror
// is the answer. Then the leg up: the calliope stands low while the kazoo
// climbs on its back, each bar starting where the last one topped out; then
// the two cross over each other and back, and swap who leads.

const B_FLAT = new Scale(["Bb", "C", "D", "Eb", "F", "G", "A"]);
const AXIS = "F5";

const [K, C, PAH, OOM, KICKS, SNARES, HATS] = [0, 1, 2, 3, 4, 5, 6];
const REST = ". . . . . . . . . . . .";

interface Chord {
  root: string;
  fifth: string;
  pah: readonly [string, string];
}

function oomPah({ root, fifth }: Chord): string {
  return `${root} . . . - . ${fifth} . . . - .`;
}

function pahs({ pah: [a, b] }: Chord): string {
  return `. . ${a} - ${b} - . . ${a} - ${b} -`;
}

const BB: Chord = { root: "Bb1", fifth: "F2", pah: ["D4", "F4"] };
const EB: Chord = { root: "Eb2", fifth: "Bb1", pah: ["Eb4", "G4"] };
const F: Chord = { root: "F2", fifth: "C2", pah: ["F4", "A4"] };
const F7: Chord = { root: "F2", fifth: "C2", pah: ["Eb4", "A4"] };
const CM: Chord = { root: "C2", fifth: "G2", pah: ["Eb4", "G4"] };
const GM: Chord = { root: "G2", fifth: "D2", pah: ["D4", "G4"] };
const C7: Chord = { root: "C2", fifth: "G2", pah: ["E4", "Bb4"] };

function band(chords: readonly Chord[]): Channel[] {
  const bars = chords.length;
  return [
    { instrument: PAH, pan: 0.35, notes: perBar(chords, pahs) },
    { instrument: OOM, pan: 0, notes: perBar(chords, oomPah) },
    { instrument: KICKS, pan: 0, notes: repeat("x . . . . . . . . . . .", bars) },
    { instrument: SNARES, pan: 0, notes: repeat(". . . . . . x . . . . .", bars) },
    { instrument: HATS, pan: -0.25, notes: repeat("C6 . C6.5 . C6.5 . C6 . C6.5 . C6.5 .", bars) },
  ];
}

// The kazoo's calls, two bars each, and the calliope's mirror answers; the
// last two bars land together.
const CALLS = [
  "Bb4 . D5 F5 . D5 | F5 D5 F5 Bb5 . .",
  "G5 . Eb5 Bb4 . Eb5 | C5 . A4 . C5 .",
  "D5 Eb5 F5 . Bb5 . | G5 . . Eb5 . .",
  "Bb4 . Eb5 G5 . Bb5 | A5 . F5 Eb5 . C5",
].map((call) => spread(call, 2));
const RESTS = `${REST} | ${REST}`;
const CALL_LINE = CALLS.flatMap((call, i) => (i < 3 ? [call, RESTS] : [call])).join(" | ");
const MIRROR_LINE = [...CALLS.slice(0, 3).flatMap((call) => [RESTS, B_FLAT.mirror(call, AXIS)]), RESTS].join(" | ");
const LANDING = { high: spread("F5 . . D5 . . | D5 . . - . .", 2), low: spread("D5 . . Bb4 . . | Bb4 . . - . .", 2) };
const MIRROR_CHORDS = [BB, BB, F, F, EB, F, CM, BB, BB, EB, F, CM, EB, F7, BB, BB];

// Roll up: the band, and a snare roll for the entrance.
const ROLL_UP: Channel[] = [
  ...band([BB, F7, BB, F7]).map((channel) =>
    channel.instrument === SNARES ? { ...channel, notes: `${repeat(REST, 3)} | G4.6 G4.5 G4.5 G4.4 G4.4 G4.3 G4.3 G4.2 G4.2 G4.1 x .` } : channel,
  ),
];

// The kazoo calls and the calliope answers in mirror image.
function mirrors(caller: number, answerer: number): Channel[] {
  return [
    { instrument: caller, pan: caller === K ? -0.3 : 0.3, notes: `${CALL_LINE} | ${LANDING.low}` },
    { instrument: answerer, pan: answerer === K ? -0.3 : 0.3, notes: `${MIRROR_LINE} | ${LANDING.high}` },
    ...band(MIRROR_CHORDS),
  ];
}

// The leg up: the calliope stands low, and the kazoo climbs onto its back,
// each bar starting on the note the last one topped out on.
const CLIMB: Channel[] = [
  { instrument: K, pan: -0.3, notes: spread("G4 . Bb4 . D5 . | D5 . Eb5 . G5 . | G5 . F5 . Bb5 . | Bb5 . A5 . C6 . | C6 . Bb5 . D6 . | D6 . Eb6 . G6 . | G6 . E6 . C6 . | A5 . F5 . Eb5 .", 2) },
  { instrument: C, pan: 0.3, notes: spread("G4 | G4 | F4 | F4 | G4 | G4 | E4 | Eb4", 12) },
  ...band([GM, EB, BB, F, GM, EB, C7, F7]),
];

// Cross over and back: one falls as the other climbs, through each other
// and out the far side, then back again.
const CROSSING: Channel[] = [
  { instrument: K, pan: -0.3, notes: spread("D6 . C6 . Bb5 . | G5 . F5 . Eb5 . | C5 . A4 . F4 . | D4 . . F4 . . | F4 . Bb4 . D5 . | Eb5 . G5 . Bb5 . | A5 . C6 . Eb6 . | D6 . . . - .", 2) },
  { instrument: C, pan: 0.3, notes: spread("D4 . F4 . Bb4 . | Bb4 . Eb5 . G5 . | A5 . C6 . . . | Bb5 . . D6 . . | D6 . Bb5 . F5 . | Eb5 . Bb4 . G4 . | F4 . A4 . Eb4 . | D4 . . . - .", 2) },
  ...band([BB, EB, F, BB, BB, EB, F7, BB]),
];

// Take a bow, and the ribbit.
const BOW: Channel[] = [
  { instrument: K, pan: -0.3, notes: `${spread("G5 . Eb5 . Bb4 . | A4 . C5 . Eb5 . | D5 . . . . .", 2)} | Bb4 - Bb5 . . . . . - . . .` },
  { instrument: C, pan: 0.3, notes: `${spread("Eb5 . Bb4 . G4 . | F4 . A4 . C5 . | Bb4 . . . . .", 2)} | ${REST}` },
  ...band([EB, F7, BB]).map((channel) => ({
    ...channel,
    notes: `${channel.notes} | ${channel.instrument === OOM ? "Bb1 . . . . . . . - . . ." : channel.instrument === KICKS ? "x . . . . . . . . . . ." : REST}`,
  })),
];

export const LEG_UP: Theme = {
  id: "leg-up",
  name: "Leg Up",
  use: "Leg Up, the L and the J, the mirror pair, climbing on each other's backs.",
  mood: "A big-top acrobat act: show-offy, wobbly and pleased with itself.",
  style: [
    "A circus jig in 6/8: a buzzing kazoo and a fluttering calliope over a tuba's oom-pah",
    "Kirkhope's cheek: a kazoo for a lead, as Banjo-Kazooie's cheeky woodwinds are",
    "The mirror pair as mirror images: each call answered upside down about the fifth, the home chord turned into the dominant",
    "Piggyback climbing, each bar starting on the last one's top note, then the two voices crossing over each other and back",
  ],
  key: "B-flat major",
  kind: "loop",
  bpm: 168,
  beatsPerBar: 3,
  metre: "6/8",
  instruments: [KAZOO, CALLIOPE, CALLIOPE, TUBA, KICK, SNARE, HAT],
  patterns: [ROLL_UP, mirrors(K, C), CLIMB, CROSSING, mirrors(C, K), BOW],
  sequence: [0, 1, 2, 3, 4, 5],
};
