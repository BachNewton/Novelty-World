import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  sections: [
    { name: "Intro", letter: "Intro", bars: [1, 4], about: "The tuba alone, then the banjo: the oompah sets up on the dominant." },
    { name: "Fair tune", letter: "A", bars: [5, 20], about: "Sixteen bars in G on the clarinet, the piccolo squeaking at the bar ends." },
    { name: "Fair tune answered", letter: "A′", bars: [21, 28], about: "Piccolo answers clarinet, then all of it slides down a chain of dominants to B flat." },
    { name: "Asleep", letter: "B", bars: [29, 40], about: "B flat, the oompah asleep: long tuba notes under the muted trumpet." },
    { name: "Break", letter: "C", bars: [41, 48], about: "Stop time in G minor: calls and tuba replies, stopping on D7 as if to go home." },
    { name: "Last tune", letter: "A″", bars: [49, 64], about: "The whole tune a semitone up in A flat, with piccolo at the octave." },
    { name: "Coda", letter: "Coda", bars: [65, 70], about: "A chromatic run down, a false ending at 68, and the real one." },
  ],
  themes: [
    {
      id: "fair",
      name: "Fair tune",
      kind: "theme",
      about: "Four bars of hop and squeak, opening on the third with a chromatic lean into it, ending on V.",
      occurrences: places(`
        5 clarinet 8 literal
        21 piccolo 4 transposed +12 -- the first half only, up the octave
        23 clarinet 4 fragmented -- the second half, back on the clarinet
        49 clarinet 8 transposed +1 -- the last verse, a semitone up
        49 piccolo 8 transposed +13
      `),
    },
    {
      id: "homing",
      name: "Homing phrase",
      kind: "theme",
      about: "The tune's second half, heading for IV, its minor shadow and the cadence.",
      occurrences: places(`
        13 clarinet 8 literal
        57 clarinet 8 transposed +1
      `),
    },
    {
      id: "skip",
      name: "Skip",
      kind: "motif",
      about: "One bar: a falling third, a chromatic step back up, and a leap. It starts almost every phrase in the A sections.",
      occurrences: places(`
        5 clarinet 2 literal
        7 clarinet 2 transposed +1 tonal
        9 clarinet 2 literal
        13 clarinet 2 literal
        21 piccolo 2 transposed +12
        23 clarinet 2 transposed +1 tonal
        49 clarinet 2 transposed +1
        53 clarinet 2 transposed +1
        57 clarinet 2 transposed +1
      `),
    },
    {
      id: "doze",
      name: "Doze",
      kind: "theme",
      about: "The muted trumpet's long-breathed tune over the sleeping tuba: a held note and a drop.",
      occurrences: places(`
        29 muted_trumpet 8 literal
      `),
    },
    {
      id: "call",
      name: "Call",
      kind: "motif",
      about: "The stop-time call, a turn up to the minor third, answered by the tuba alone.",
      occurrences: places(`
        41 clarinet 2 literal
        43 piccolo 2 transposed +12
      `),
    },
  ],
  patterns: [
    { id: "oompah", name: "Oompah", kind: "accompaniment", about: "Tuba on the beat, banjo off it: root and fifth below, chord above.", every: 2, spans: spans("tuba 5-28, banjo 5-19, tuba 49-64") },
    { id: "chain", name: "Chain of dominants", kind: "sequence", about: "G7, C7, F7: each a dominant of the next, in tutti arpeggios, sliding the tune to B flat.", spans: spans("clarinet 25-27, piccolo 25-27") },
    { id: "stop", name: "Stop time", kind: "accompaniment", about: "Everyone drops out for each call; the tuba answers alone.", spans: spans("tuba 42-46") },
    { id: "run", name: "Chromatic run", kind: "figuration", about: "Semitones in sixteenths, clarinet and piccolo in octaves, up to the stop.", spans: spans("clarinet 47-47, piccolo 47-47, clarinet 65-65") },
  ],
  ...chart(`
    tempo 1-70 Polka
    key 1 G
    1 G5 - | 3 G I | 3.2.5 G/Bb - ? -- the tuba's B flat is a chromatic slide down, not a harmony | 4 D7/F# V65
    5 G I | 6 G I | 7 Am ii | 8 D7 V7 HC
    9 G I | 10 E7 V7/ii | 11 Am ii | 12 D7 V7
    13 G I | 14 G I | 15 C IV | 16 Cm iv -- the minor shadow, the style's sigh
    17 G/D I64 | 18 A7 V7/V | 19 Ab7 bII7 -- a side-step: the tritone substitute for D7 | 20 G I -- a side-step cadence, Ab7 to G: it resolves as a dominant would, so it is unnamed
    21 G I | 22 G I | 23 Am ii | 24 D7 V7 | 25 G7/F V42/IV | 26 C7/Bb IV42
    key 27 Bb sequential -- G7, C7, F7: a chain of dominants lands on the dominant of B flat
    27 F7 V7 | 28 F7 V7
    29 Bb I | 30 Bb/D I6 | 31 Eb IV | 32 Ebm/Gb iv6 | 33 Bb/D I6 | 34 Db7 bIII7 -- tritone substitute for G7, stepping down onto C7 | 35 C7 V7/V | 36 F7 V7
    37 Bb I IAC | 38 Gb/Db bVI64 | 39 F7 V7 | 40 Bb I PAC
    key 41 Gm direct -- the break just starts, on the relative minor
    41 Gm i | 42 D V | 43 Gm i | 44 D7 V7 HC
    45 Eb/G VI6 | 46 A V/V | 47 D V ? -- a chromatic run from A to E over a D in the tuba | 48 D7 V7
    key 48.2.5 Ab chromatic -- it stops on D7 as if to go home to G, and blurts E flat, a semitone up: the dominant of A flat
    48.2.5 Eb7 V7 ? -- only the tuba's E flat sounds: the seventh is implied by where it goes
    49 Ab I | 50 Ab I | 51 Bbm ii | 52 Eb7 V7 HC
    53 Ab I | 54 F7 V7/ii | 55 Bbm ii | 56 Eb7 V7
    57 Ab I | 58 Ab I | 59 Db IV | 60 Dbm/E iv6
    61 Ab/Eb I64 | 62 Bb7 V7/V | 63 A7 bII7 -- the same side-step, up a semitone | 64 Ab I
    65 Ab I | 66 Db IV | 66.2 Dbm/E iv6 | 67 Ab/Eb I64 | 67.2 Eb7 V7 | 68 Ab I PAC -- the false ending
    69 Eb7 V7 ? -- a bare chromatic walk from E flat to G in the tuba, heard as the dominant | 70 Ab I PAC
  `),
};
