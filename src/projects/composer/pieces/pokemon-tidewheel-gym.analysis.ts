import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  sections: [
    { name: "Riff", letter: "Intro", bars: [1, 4], about: "The whole band hits: a rising E minor arpeggio and a chromatic fall to the dominant, twice." },
    { name: "Challenge", letter: "A", bars: [5, 12], about: "Eight bars on the trumpets over held strings, with horn eddies in the gaps, stopping on B7." },
    { name: "Challenge again", letter: "A′", bars: [13, 20], about: "Sixteenth arpeggios drive it, the trumpets climb higher, and the last bar turns to D7." },
    { name: "Sun on the water", letter: "B", bars: [21, 28], about: "G major: big long notes in brass octaves and thirds over a falling bass." },
    { name: "Undertow", letter: "C", bars: [29, 36], about: "Everything drops out. The horns take the riff's head through A minor and F, then C and D, and the trumpets rise over it to B7." },
    { name: "Last challenge", letter: "A″", bars: [37, 44], about: "The trumpets up the octave, ending on a run straight back into the riff: the piece loops, and never closes on a tonic cadence." },
  ],
  themes: [
    {
      id: "riff",
      name: "Mill riff",
      kind: "theme",
      about: "Up an E minor chord in eighths to a held top note, and a chromatic slide back down.",
      occurrences: places(`
        1 trumpets 8 literal
        3 trumpets 8 varied -- the top note up to G, and an answer down the dominant
      `),
    },
    {
      id: "fall",
      name: "Chromatic fall",
      kind: "motif",
      about: "Eight eighths down by semitones, from C to E, the mill wheel turning.",
      occurrences: places(`
        2 trumpets 4 literal
      `),
    },
    {
      id: "challenge",
      name: "Challenge",
      kind: "theme",
      about: "The battle tune: the riff's first notes held longer, and a long note on each chord. In the last verse only its head survives.",
      occurrences: places(`
        5 trumpets 16 literal
        13 trumpets 16 varied
      `),
    },
    {
      id: "head",
      name: "Head",
      kind: "motif",
      about: "Three quick notes up to a long one, and a fourth after it: the riff's opening cut down. It is what the horns keep in the undertow.",
      occurrences: places(`
        5 trumpets 4 literal
        6 trumpets 4 varied +5
        7 trumpets 4 varied +10
        13 trumpets 4 literal
        14 trumpets 4 varied +5
        15 trumpets 4 varied +10
        29 horns 4 transposed -7
        30 horns 4 varied -2
        31 horns 4 varied -2
        32 horns 4 varied +1
        33 horns 4 varied +5
        34 horns 4 varied +7
        35 horns 4 varied +5
        37 trumpets 4 varied +12
        38 trumpets 4 varied +13
        39 trumpets 4 varied +10
      `),
    },
    {
      id: "eddy",
      name: "Eddy",
      kind: "motif",
      about: "The horns' answer in the gaps: an arch down a chord and back.",
      occurrences: places(`
        5.2 horns 4 literal
        6.2 horns 4 transposed +1 tonal
        7.2 horns 4 transposed +1 tonal
        13.2 horns 4 transposed +3 tonal
        14.2 horns 4 transposed +5 tonal
        15.2 horns 4 transposed +5 tonal
      `),
    },
    {
      id: "surge",
      name: "Surge",
      kind: "theme",
      about: "The tune's busier second half, each bar running up in sixteenths and breaking over.",
      occurrences: places(`
        9 trumpets 16 literal
      `),
    },
    {
      id: "swell",
      name: "Swell",
      kind: "motif",
      about: "Two sixteenths and an eighth up to a leap: the wave that starts each bar of Surge.",
      occurrences: places(`
        9 trumpets 1.5 literal
        10 trumpets 1.5 transposed -3 tonal
        11 trumpets 1.5 varied -5
        17 trumpets 1.5 literal
        18 trumpets 1.5 transposed -3 tonal
        19 trumpets 1.5 varied +2
        41 trumpets 1.5 literal
        42 trumpets 1.5 transposed -3 tonal
      `),
    },
    {
      id: "crest",
      name: "Crest",
      kind: "theme",
      about: "The last two bars of the second verse's first half: up to high G and down the dominant.",
      occurrences: places(`
        15 trumpets 8 literal
        39 trumpets 8 literal
      `),
    },
    {
      id: "breaker",
      name: "Breaker",
      kind: "theme",
      about: "Surge rewritten for the second verse, each bar's run going higher before it breaks.",
      occurrences: places(`
        17 trumpets 8 literal
        41 trumpets 8 varied -- pushed a little higher at the top of bar 42
      `),
    },
    {
      id: "sun",
      name: "Sun",
      kind: "theme",
      about: "Three-beat long notes and a two-note pickup on each chord: the one place the brass gets to sing.",
      occurrences: places(`
        21 trumpets 16 literal
        21 horns 16 varied -3 -- thirds and sixths below
        25 trumpets 4 literal
      `),
    },
  ],
  patterns: [
    { id: "arp", name: "Square arpeggios", kind: "figuration", about: "Sixteenths in a chord tone pattern, the mill's cogs.", every: 1, spans: spans("square_arp 1-4, square_arp 13-20, square_arp 33-36") },
    { id: "slower", name: "Eighth arpeggios", kind: "figuration", about: "The same idea at half speed, under the sun and in the undertow.", every: 1, spans: spans("square_arp 21-28, square_arp 31-32") },
    { id: "bassriff", name: "Slap riff", kind: "ostinato", about: "Eighths on the root with an octave pop and a fill of chord tones, the rhythm locked to the stabs.", every: 4, spans: spans("slap_bass 1-4, slap_bass 13-19, slap_bass 41-42") },
    { id: "stabs", name: "Brass stabs", kind: "accompaniment", about: "Three short chords across each bar, on the dotted pattern of the riff.", every: 4, spans: spans("brass_stabs 1-4, brass_stabs 37-42") },
    { id: "offstabs", name: "Offbeat stabs", kind: "accompaniment", about: "Short chords on two and four, leaving the first beat to the bass.", every: 2, spans: spans("brass_stabs 5-12") },
    { id: "pad", name: "Long strings", kind: "accompaniment", about: "Whole-note chords under the tune.", every: 4, spans: spans("strings 5-10, strings 37-42") },
    { id: "repeat", name: "Repeated strings", kind: "accompaniment", about: "Chords hammered in quarters, then eighths, as the undertow builds.", spans: spans("strings 29-36") },
    { id: "fallingbass", name: "Falling bass", kind: "sequence", about: "G, F sharp, E, C, B, a step or a third a bar, turning at C to climb back.", spans: spans("slap_bass 21-25") },
    { id: "rise", name: "Trumpet rise", kind: "sequence", about: "One long note a bar, C, D, E, F sharp, over the horns, each louder than the last.", spans: spans("trumpets 33-36") },
    { id: "run", name: "Way back in", kind: "figuration", about: "A chain of falling thirds in eighths down the dominant seventh, into the riff.", spans: spans("trumpets 44-44") },
  ],
  ...chart(`
    tempo 1-44 Presto
    key 1 Em
    1 Em i | 2 C VI | 2.3 Am iv | 2.4 B7 V7 | 3 Em i | 4 B7 V7
    5 Em i | 6 C VI | 7 Am iv | 8 B7 V7 HC
    9 Em i | 10 C VI | 11 D VII | 11.3 G III | 12 Am iv | 12.3 B7 V7 HC
    13 Em i | 14 C VI | 15 Am iv | 16 B7 V7 HC
    17 Em i | 18 C VI | 19 Am iv
    key 20 G pivot -- A minor, iv in E minor, is ii in G, and D7 takes it there
    20 D7 V7
    21 G I IAC | 22 D/F# V6 | 23 Em vi | 24 C IV | 25 G/B I6 | 26 C IV | 27 Am ii | 28 D7 V7 HC
    key 29 Am direct -- D7 goes nowhere it promised: the band drops out, and it is A minor
    29 Am i | 30 F VI | 31 Am i | 32 F VI
    key 33 Em pivot -- C, the mediant of A minor, is VI at home
    33 C VI | 34 D VII | 35 C VI | 36 B7 V7 HC
    37 Em i | 38 C VI | 39 Am iv | 40 B7 V7 HC
    41 Em i | 42 C VI | 43 D VII | 43.3 G III | 44 B7 V7 HC
  `),
};
