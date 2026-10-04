import { Shape } from "../sounds";
import { TICK, THUMP } from "./instruments";
import type { Channel, Instrument, Theme } from "./song";

// The traditional Finnish tune Ievan Polkka, in the public domain, in two
// arrangements of our own: one in the sound of Loituma's a cappella recording,
// one in the sound of the electronic Hatsune Miku cover. Both take only those
// recordings' style; their arrangements and Loituma's scat verse are under
// copyright, so neither is quoted.

// The tune, as the folk melody goes.
const VERSE =
  "A5 - A5 - G5 - F5 F5 | E5 - C5 C5 C5 . E5 . | G5 - G5 G5 F5 . E5 . | F5 - D5 - D5 - F5 . | A5 A5 A5 A5 G5 . F5 . | E5 - C5 C5 C5 C5 E5 . | G5 G5 G5 . F5 - E5 E5 | F5 F5 D5 . D5 . . -";
const SECOND_HALF =
  "A4 - D5 - D5 . . E5 | F5 F5 D5 D5 D5 . F5 F5 | E5 - C5 - C5 - E5 - | F5 - D5 - D5 . D5 D5 | A4 - D5 - D5 . . E5 | F5 - D5 D5 . D5 D5 F5 | A5 A5 A5 G5 F5 - E5 - | F5 - D5 - D5 . D5 D5";
// The verse again, scatted: every note broken into rapid sixteenths, our own
// variation in the manner of a scat singer, not Loituma's scat verse.
const SCAT =
  "A5 A5 A5 A5 G5 G5 F5 F5 | E5 E5 C5 C5 C5 C5 E5 E5 | G5 G5 G5 G5 F5 F5 E5 E5 | F5 F5 D5 D5 D5 E5 F5 G5 | A5 A5 A5 A5 G5 G5 F5 F5 | E5 E5 C5 C5 C5 C5 E5 E5 | G5 G5 G5 G5 F5 F5 E5 E5 | F5 F5 D5 D5 D5 . - .";

// Each phrase's harmony, a chord a bar: D minor or C major.
const VERSE_CHORDS = "dccddccd";
const SECOND_HALF_CHORDS = "ddcdddcd";

const bars = (chords: string, dm: string, c: string): string =>
  chords
    .split("")
    .map((chord) => (chord === "d" ? dm : c))
    .join(" | ");

const arrange = (backing: (chords: string) => Channel[]): Channel[][] => [
  [{ instrument: 0, pan: 0, notes: VERSE }, ...backing(VERSE_CHORDS)],
  [{ instrument: 0, pan: 0, notes: SECOND_HALF }, ...backing(SECOND_HALF_CHORDS)],
  [{ instrument: 0, pan: 0, notes: SCAT }, ...backing(VERSE_CHORDS)],
];

// A sung "oo": a soft triangle with a gentle wobble, like a voice's vibrato.
const VOICE: Instrument = {
  name: "Voice",
  base: "B4",
  zzfx: {
    volume: 0.75,
    attack: 0.015,
    decay: 0.05,
    sustain: 0.1,
    sustainVolume: 0.65,
    release: 0.08,
    shape: Shape.triangle,
    tremolo: 0.12,
    repeatTime: 0.17,
    filter: -2200,
  },
};

// The bass singer's "bom": a round, low sine that dies away quickly.
const BOM: Instrument = {
  name: "Bass voice",
  base: "B2",
  zzfx: { volume: 1, attack: 0.01, decay: 0.08, sustain: 0.04, sustainVolume: 0.5, release: 0.1, filter: -900 },
};

// The backing singers' short "pa".
const PA: Instrument = {
  name: "Backing voices",
  base: "B4",
  zzfx: { volume: 0.4, attack: 0.012, decay: 0.05, sustain: 0.04, sustainVolume: 0.4, release: 0.08, filter: -1800 },
};

// A bright synth voice: a saw through a high low-pass, with a quick wobble.
const SYNTH_VOICE: Instrument = {
  name: "Synth voice",
  base: "B4",
  zzfx: {
    volume: 0.45,
    attack: 0.006,
    decay: 0.05,
    sustain: 0.09,
    sustainVolume: 0.6,
    release: 0.06,
    shape: Shape.saw,
    tremolo: 0.1,
    repeatTime: 0.12,
    filter: -2800,
  },
};

// A punchy synth bass, short and dark.
const SYNTH_BASS: Instrument = {
  name: "Synth bass",
  base: "B2",
  zzfx: {
    volume: 0.7,
    attack: 0.004,
    decay: 0.05,
    sustain: 0.03,
    sustainVolume: 0.5,
    release: 0.05,
    shape: Shape.saw,
    filter: -700,
  },
};

// Offbeat synth chord stabs.
const STAB: Instrument = {
  name: "Stab",
  base: "B4",
  zzfx: { volume: 0.22, attack: 0.004, decay: 0.04, sustain: 0.02, sustainVolume: 0.4, release: 0.05, shape: Shape.saw, filter: -2400 },
};

// Loituma's sound: four voices and nothing else. The bass sings "bom" on the
// beat and two backing voices answer "pa" off it, panned apart.
const aCappellaBacking = (chords: string): Channel[] => [
  { instrument: 1, pan: 0, notes: bars(chords, "D3 . . . A2 . . .", "C3 . . . G2 . . .") },
  { instrument: 2, pan: -0.4, notes: bars(chords, ". . F4 - . . F4 -", ". . E4 - . . E4 -") },
  { instrument: 2, pan: 0.4, notes: bars(chords, ". . A4 - . . A4 -", ". . G4 - . . G4 -") },
];

// The Miku cover's sound: a kick on every beat, offbeat hats and stabs, and a
// bouncing synth bass.
const electroBacking = (chords: string): Channel[] => [
  { instrument: 1, pan: 0, notes: bars(chords, "D2 - D3 D2 - D2 D3 -", "C2 - C3 C2 - C2 C3 -") },
  { instrument: 2, pan: 0.3, notes: bars(chords, ". . F4 - . . A4 -", ". . E4 - . . G4 -") },
  { instrument: 3, pan: 0, notes: "x . . . x . . . | ".repeat(8) },
  { instrument: 4, pan: -0.3, notes: ". . x . . . x x | ".repeat(8) },
];

export const FROG_POLKKA_A_CAPPELLA: Theme = {
  id: "frog-polkka-a-cappella",
  name: "Frog Polkka (a cappella)",
  use: "The main run loop, under the traffic: a candidate Frogmino theme.",
  mood: "Giddy and homespun: a village choir the frog can't stop hopping to.",
  style: [
    "Ievan Polkka: the traditional Finnish folk melody itself, in the public domain, as Tetris made a theme of the Russian Korobeiniki",
    "Loituma's recording: a cappella, the bass singing on the beat and backing voices answering off it, with the lead voice's vibrato",
    "Loituma's scat: the tune's last time round broken into rapid sixteenths, our own variation rather than their scat verse",
  ],
  key: "D minor",
  kind: "loop",
  bpm: 132,
  beatsPerBar: 2,
  instruments: [VOICE, BOM, PA],
  patterns: arrange(aCappellaBacking),
  sequence: [0, 1, 2],
};

export const FROG_POLKKA_ELECTRO: Theme = {
  id: "frog-polkka-electro",
  name: "Frog Polkka (electro)",
  use: "The main run loop, under the traffic: a candidate Frogmino theme.",
  mood: "Bright and bouncy: the polka at a dance club, all leek-spinning energy.",
  style: [
    "Ievan Polkka: the traditional Finnish folk melody itself, in the public domain",
    "The Hatsune Miku cover: a synthesised voice on the tune, faster, over an electronic dance beat",
    "Electro-pop: a kick on every beat, offbeat hats and chord stabs, and a bouncing synth bass",
  ],
  key: "D minor",
  kind: "loop",
  bpm: 150,
  beatsPerBar: 2,
  instruments: [SYNTH_VOICE, SYNTH_BASS, STAB, THUMP, TICK],
  patterns: arrange(electroBacking),
  sequence: [0, 1, 2],
};
