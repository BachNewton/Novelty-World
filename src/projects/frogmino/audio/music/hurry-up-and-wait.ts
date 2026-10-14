import { BASS, BELL, PULSE, SNARE, THUMP, TICK } from "./instruments";
import type { Channel, Theme } from "./song";
import { perBar, Scale, spread, transpose } from "./writing";

// The chains-and-pace course's theme: a T and an L whose gaps make the team
// hurry or wait as one. It changes pace the same way: a bouncy ride, a
// lilting half-time wait, a dash in sixteenths, and a stop-go where the band
// holds its breath.

const D_MAJOR = new Scale(["D", "E", "F#", "G", "A", "B", "C#"]);

interface Chord {
  root: string;
  fifth: string;
}

const CHORDS: Record<string, Chord> = {
  D: { root: "D3", fifth: "A2" },
  Bm: { root: "B2", fifth: "F#2" },
  G: { root: "G2", fifth: "D3" },
  A: { root: "A2", fifth: "E3" },
  Em: { root: "E2", fifth: "B2" },
};

const REST = ". . . . . . . . . . . . . . . .";
const RESTS = [REST, REST, REST, REST].join(" | ");

type Pace = "ride" | "wait" | "dash";

function rhythm(names: string, pace: Pace): Channel[] {
  const chords = names.split(" ").map((name) => CHORDS[name]);
  const bars = (bar: string): string => perBar(chords, () => bar);
  const bass =
    pace === "wait"
      ? perBar(chords, (c) => `${c.root} . . . . . . . . . . . ${c.fifth} . . .`)
      : perBar(chords, (c) => {
          const octave = transpose(c.root, 12);
          return `${c.root} . . ${octave} . . ${c.root} . ${c.fifth} . . ${octave} . . ${c.fifth} .`;
        });
  return [
    { instrument: 2, pan: 0, notes: bass },
    { instrument: 3, pan: 0, notes: bars(pace === "wait" ? "x . . . . . . . . . . . . . . ." : "x . . . . . x . x . . . . . . .") },
    { instrument: 4, pan: -0.1, notes: bars(pace === "wait" ? ". . . . . . . . x . . . . . . ." : ". . . . x . . . . . . . x . . .") },
    { instrument: 5, pan: 0.3, notes: bars(pace === "dash" ? "x x x x x x x x x x x x x x x x" : pace === "ride" ? "x . x . x . x . x . x . x . x ." : REST) },
  ];
}

// The lead, and the second pulse a third under it or resting.
function lead(notes: string, harmony: boolean): Channel[] {
  return [
    { instrument: 0, pan: -0.3, notes },
    { instrument: 0, pan: 0.3, notes: harmony ? D_MAJOR.shift(notes, -2) : RESTS },
  ];
}

const noBell: Channel = { instrument: 1, pan: 0.4, notes: RESTS };

// The motif (`motif.ts`) in D, out for a ride.
const RIDE_1 = spread("D5 . A4 D5 F#5 . A5 . | B5 A5 F#5 D5 E5 . . . | G5 . B5 . D6 . B5 G5 | A5 . . . C#6 . E6 .", 2);
const RIDE_2 = spread("D5 . A4 D5 F#5 . A5 . | B5 A5 F#5 E5 D5 . . . | G5 . E5 . B5 . G5 . | A5 . . . E5 . C#5 .", 2);
// The same motif, slowed to a wait.
const WAIT_1 =
  "B5 . . . . . . . A5 . . . F#5 . . . | A5 . . . . . . . D5 . . . . . . . | G5 . . . . . . . F#5 . . . E5 . . . | E5 . . . . . . . . . . . - . . .";
const WAIT_2 =
  "D5 . . . A4 . . . D5 . . . F#5 . . . | A5 . . . . . . . B5 . . . A5 . . . | F#5 . . . D5 . . . E5 . . . . . . . | . . . . . . . . . . . . - . . .";
// The bell ticking off the wait.
const TOCK = `${". . . . . . . . A6 . . . . . . . | ".repeat(3)}. . . . . . . . A6 . . . . . . .`;
// And dashing in sixteenths.
const DASH_1 =
  "D5 E5 F#5 A5 D6 A5 F#5 E5 D5 E5 F#5 A5 D6 . . . | G5 A5 B5 D6 G6 D6 B5 A5 G5 A5 B5 D6 G6 . . . | A5 B5 C#6 E6 A6 E6 C#6 B5 A5 B5 C#6 E6 A6 . . . | F#6 E6 D6 C#6 B5 A5 G5 F#5 E5 D5 C#5 B4 A4 . . .";
const DASH_2 =
  "B5 C#6 D6 F#6 B6 F#6 D6 C#6 B5 C#6 D6 F#6 B6 . . . | G5 A5 B5 D6 G6 D6 B5 A5 G5 A5 B5 D6 G6 . . . | A5 B5 C#6 E6 A6 E6 C#6 B5 A5 . E5 . A5 . . . | C#6 . . . E6 . . . A6 . . . - . . .";

// Stop, wait... go: the band hits a chord and holds its breath, twice, then
// the snare and a run up into the ride.
const STOP_GO: Channel[] = [
  { instrument: 0, pan: -0.3, notes: `A5 - . . . . . . . . . . . . . . | ${REST} | A5 - . . . . . . . . . . . . . . | . . . . . . . . A4 B4 C#5 D5 E5 F#5 G5 A5` },
  { instrument: 0, pan: 0.3, notes: `F#5 - . . . . . . . . . . . . . . | ${REST} | E5 - . . . . . . . . . . . . . . | ${REST}` },
  noBell,
  { instrument: 2, pan: 0, notes: `D3 - . . . . . . . . . . . . . . | ${REST} | A2 - . . . . . . . . . . . . . . | . . . . . . . . A2 . . . A2 . A2 .` },
  { instrument: 3, pan: 0, notes: `x . . . . . . . . . . . . . . . | ${REST} | x . . . . . . . . . . . . . . . | ${REST}` },
  { instrument: 4, pan: -0.1, notes: `${REST} | ${REST} | ${REST} | . . . . . . . . x . x . x x x x` },
  { instrument: 5, pan: 0.3, notes: RESTS },
];

export const HURRY_UP_AND_WAIT: Theme = {
  id: "hurry-up-and-wait",
  name: "Hurry Up and Wait",
  use: "Co-op course M2, chains and pace: a T and an L.",
  mood: "Bouncy and restless: cruising, waiting, then dashing, the team keeping pace together.",
  style: [
    "Pokémon's bicycle theme (Game Boy): two bright pulse leads in thirds over a bouncy, punchy bass, cruising in a sunny major key",
    "Pokémon's Surf theme: the pace dropping to a lilting half-time, long notes and a bell ticking off the wait",
    "Pokémon's battle music: a dash of rapid sixteenth runs over a busy hi-hat, and a stop-time break, hit and hold, before the band goes again",
    "The Frogmino motif in D, ridden, slowed down, and run up and down in sixteenths",
  ],
  key: "D major",
  kind: "loop",
  bpm: 150,
  beatsPerBar: 4,
  instruments: [PULSE, BELL, BASS, THUMP, SNARE, TICK],
  patterns: [
    // 0, 1: the ride, one lead.
    [...lead(RIDE_1, false), noBell, ...rhythm("D Bm G A", "ride")],
    [...lead(RIDE_2, false), noBell, ...rhythm("D Bm Em A", "ride")],
    // 2, 3: the wait, in half-time.
    [...lead(WAIT_1, true), { instrument: 1, pan: 0.4, notes: TOCK }, ...rhythm("G D Em A", "wait")],
    [...lead(WAIT_2, true), { instrument: 1, pan: 0.4, notes: TOCK }, ...rhythm("D G Em A", "wait")],
    // 4, 5: the dash.
    [...lead(DASH_1, false), noBell, ...rhythm("D G A D", "dash")],
    [...lead(DASH_2, false), noBell, ...rhythm("Bm G A A", "dash")],
    // 6: stop, wait... go.
    STOP_GO,
    // 7, 8: the ride again, two leads in thirds.
    [...lead(RIDE_1, true), noBell, ...rhythm("D Bm G A", "ride")],
    [...lead(RIDE_2, true), noBell, ...rhythm("D Bm Em A", "ride")],
  ],
  sequence: [0, 1, 7, 8, 2, 3, 4, 5, 6, 7, 8, 2, 3, 4, 5],
};
