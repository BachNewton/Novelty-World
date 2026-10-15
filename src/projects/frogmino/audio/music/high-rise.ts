import { BELL, KICK, NYLON, SHAKER, UPRIGHT, VIBES, WOOD_BLOCK } from "./instruments";
import type { Channel, Theme } from "./song";
import { perBar, repeat, transpose } from "./writing";

// High Rise (I and I): two Is, towers and planks, standing tall in slots or
// lifting each other over the garage. Lift music, literally: a lounge bossa
// for a high-rise's elevator, vibraphone over a nylon guitar and an upright
// bass, with the lift's bell. The tower section builds a tower of fourths a
// floor a bar until it tumbles down over the garage; then the elevator goes
// up a floor every two bars, the same phrase a minor third higher each time,
// with a ding at each floor, and comes back down to the lobby.

const [VIBE, LOW_SHELL, HIGH_SHELL, BASS, RIM, SHAKE, KICKS, DING] = [0, 1, 2, 3, 4, 5, 6, 7];
const REST = ". . . . . . . . . . . . . . . .";

// A chord as the bossa plays it: the bass's root and fifth, and the guitar's
// shell, its third and seventh.
interface Chord {
  root: string;
  fifth: string;
  shell: readonly [string, string];
}

const COMP = "S . . S . . S . . . S . . S . .";

function bassBar({ root, fifth }: Chord): string {
  return `${root} . . . . . ${fifth} - ${fifth} . . . . . ${root} -`;
}

function shell(chord: Chord, voice: 0 | 1): string {
  return COMP.replaceAll("S", chord.shell[voice]);
}

const EBMAJ7: Chord = { root: "Eb2", fifth: "Bb1", shell: ["G3", "D4"] };
const FM7: Chord = { root: "F2", fifth: "C2", shell: ["Ab3", "Eb4"] };
const BB7: Chord = { root: "Bb1", fifth: "F2", shell: ["Ab3", "D4"] };
const GM7: Chord = { root: "G2", fifth: "D2", shell: ["Bb3", "F4"] };
const C7: Chord = { root: "C2", fifth: "G2", shell: ["Bb3", "E4"] };
const AB7: Chord = { root: "Ab1", fifth: "Eb2", shell: ["C4", "Gb4"] };
const EB6: Chord = { root: "Eb2", fifth: "Bb1", shell: ["G3", "C4"] };
const ABMAJ7: Chord = { root: "Ab1", fifth: "Eb2", shell: ["C4", "G4"] };
const BMAJ7: Chord = { root: "B1", fifth: "F#2", shell: ["D#4", "A#4"] };
const DMAJ7: Chord = { root: "D2", fifth: "A2", shell: ["F#4", "C#5"] };
const E7: Chord = { root: "E2", fifth: "B1", shell: ["G#3", "D4"] };
const BB13SUS: Chord = { root: "Bb1", fifth: "F2", shell: ["Ab3", "Eb4"] };

function band(chords: readonly Chord[]): Channel[] {
  const bars = chords.length;
  return [
    { instrument: LOW_SHELL, pan: -0.25, notes: chords.map((chord) => shell(chord, 0)).join(" | ") },
    { instrument: HIGH_SHELL, pan: 0.25, notes: chords.map((chord) => shell(chord, 1)).join(" | ") },
    { instrument: BASS, pan: 0, notes: perBar(chords, bassBar) },
    { instrument: RIM, pan: 0.3, notes: repeat("G5 . . G5.3 . . G5 . . . G5.3 . G5 . . .", bars) },
    { instrument: SHAKE, pan: -0.35, notes: repeat("C6.5 C6.8 C6 C6.8 C6.5 C6.8 C6 C6.8 C6.5 C6.8 C6 C6.8 C6.5 C6.8 C6 C6.8", bars) },
    { instrument: KICKS, pan: 0, notes: repeat("x . . . . . x . x . . . . . x .", bars) },
  ];
}

// The doors open on the lobby.
const LOBBY: Channel[] = [
  { instrument: VIBE, pan: 0.15, notes: repeat(REST, 2) },
  ...band([EBMAJ7, EBMAJ7]),
  { instrument: DING, pan: 0.4, notes: `G6 . . . Eb6 . . . . . . . . . . . | ${REST}` },
];

// The tune, a lazy climb up each chord and down again.
const TUNE: Channel[] = [
  {
    instrument: VIBE,
    pan: 0.15,
    notes: [
      ". . G5 . . . Bb5 . . . D6 . . . . .",
      "C6 . . . Bb5 . . . G5 . . . . . . .",
      ". . Ab5 . . . C6 . . . Eb6 . . . . .",
      "D6 . . . C6 . . . Ab5 . . . F5 . . .",
      ". . Bb5 . . . D6 . . . F6 . . . . .",
      "E6 . . . D6 . . . Bb5 . . . G5 . . .",
      ". . Ab5 . . . G5 . . . F5 . . . Eb5 .",
      "D5 . . . . . . . - . . . . . . .",
    ].join(" | "),
  },
  ...band([EBMAJ7, EBMAJ7, FM7, BB7, GM7, C7, FM7, BB7]),
];

const TUNE_HOME: Channel[] = [
  {
    instrument: VIBE,
    pan: 0.15,
    notes: [
      ". . G5 . . . Bb5 . . . D6 . . . . .",
      "C6 . . . Bb5 . . . Gb5 . . . . . . .",
      ". . F5 . . . G5 . . . Bb5 . . . D6 .",
      "Db6 . . . C6 . . . Bb5 . . . E5 . . .",
      ". . Ab5 . . . C6 . . . Eb6 . . . . .",
      "D6 . . . F6 . . . Ab5 . . . D6 . . .",
      "Eb6 . . . . . . . C6 . . . . . . .",
      "Bb5 . . . . . . . - . . . . . . .",
    ].join(" | "),
  },
  ...band([EBMAJ7, AB7, GM7, C7, FM7, BB7, EB6, EB6]),
];

// The towers: a stack of fourths, a floor taller every bar, until it
// tumbles down over the garage.
const FLOORS = ["F4", "Bb4", "Eb5", "Ab5", "D6", "G6", "C7"];
function tower(height: number): string {
  const climb = FLOORS.slice(0, height).flatMap((note) => [note, "."]);
  return [...climb, ...Array.from({ length: 16 - climb.length }, () => ".")].join(" ");
}
const TOWERS: Channel[] = [
  {
    instrument: VIBE,
    pan: 0.15,
    notes: [
      tower(2),
      tower(3),
      tower(4),
      tower(5),
      tower(6),
      tower(7).replace(/ \. \. \.$/, " - . ."),
      "C7 G6 D6 Ab5 Eb5 Bb4 F4 . . . . . . . . .",
      "F4 . Bb4 . D5 . F5 . Ab5 . . . - . . .",
    ].join(" | "),
  },
  ...band([ABMAJ7, ABMAJ7, GM7, GM7, FM7, FM7, BB13SUS, BB7]),
];

// Going up: a floor every two bars, a minor third higher each time, with a
// ding at each, then down to the lobby through the tritone's back door.
const FLOOR_PHRASE = "Eb5 . G5 . C6 . . . Bb5 . G5 . Eb5 . . . | F5 . . . G5 . . . - . . . . . . .";
const ELEVATOR: Channel[] = [
  {
    instrument: VIBE,
    pan: 0.15,
    notes: [
      FLOOR_PHRASE,
      transpose(FLOOR_PHRASE, 3),
      transpose(FLOOR_PHRASE, 6),
      "D6 . . . B5 . . . G#5 . . . E5 . . . | F5 . . . Ab5 . . . D5 . . . - . . .",
    ].join(" | "),
  },
  ...band([ABMAJ7, ABMAJ7, BMAJ7, BMAJ7, DMAJ7, DMAJ7, E7, BB7]),
  {
    instrument: DING,
    pan: 0.4,
    notes: [REST, REST, "D#6 . . . B5 . . . . . . . . . . .", REST, "F#6 . . . D6 . . . . . . . . . . .", REST, REST, REST].join(" | "),
  },
];

// Back in the lobby: the ribbit, and the doors close.
const DOORS: Channel[] = [
  { instrument: VIBE, pan: 0.15, notes: `Eb5 - Eb6 . . . . . . . . . - . . . | ${REST}` },
  ...band([EB6, EB6]).map((channel) => (channel.instrument === BASS ? { ...channel, notes: `${bassBar(EB6)} | Eb2 . . . . . . . - . . . . . . .` } : channel)),
  { instrument: DING, pan: 0.4, notes: `${REST} | G6 . . . Eb6 . . . . . . . . . . .` },
];

export const HIGH_RISE: Theme = {
  id: "high-rise",
  name: "High Rise",
  use: "High Rise, the two Is, towers and planks.",
  mood: "Cool, unhurried and a little smug, riding the lift to the top floor.",
  style: [
    "Lift music on purpose: a lounge bossa nova with vibraphone, nylon guitar, upright bass and the lift's bell",
    "Kirkhope's jazzy changes: seventh chords, a flattened ninth and a tritone substitution home",
    "Towers as a stack of fourths built a floor a bar, tumbling down over the garage",
    "An elevator ride: the same phrase a minor third higher every two bars, with a ding at each floor",
  ],
  key: "E-flat major, riding up through A-flat, B and D",
  kind: "loop",
  bpm: 100,
  beatsPerBar: 4,
  metre: "4/4",
  instruments: [VIBES, NYLON, NYLON, UPRIGHT, WOOD_BLOCK, SHAKER, KICK, BELL],
  patterns: [LOBBY, TUNE, TUNE_HOME, TOWERS, ELEVATOR, DOORS],
  sequence: [0, 1, 2, 3, 4, 2, 5],
};
