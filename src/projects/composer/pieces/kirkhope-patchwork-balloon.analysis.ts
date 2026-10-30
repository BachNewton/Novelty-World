import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  sections: [
    { name: "Inflating", letter: "Intro", bars: [1, 4], about: "Harp and held bass: the horns rise and the oboe drifts down, stopping on the dominant." },
    { name: "Balloon tune", letter: "A", bars: [5, 20], about: "Sixteen bars in D on the horns. The first eight swerve through a flat sixth, the second eight go home by way of a deceptive B minor." },
    { name: "Flying", letter: "A′", bars: [21, 28], about: "The second eight up the octave on the flute over running harp and a walking bass, turned at the end to lean on F sharp." },
    { name: "Cloud", letter: "B", bars: [29, 37], about: "B minor, thinned to single stabs and the oboe, with the bass stepping down from B." },
    { name: "Climb", letter: "Link", bars: [38, 44], about: "A semitone side-step to B flat, then four long bars of C7 while the bass walks an octave down the scale." },
    { name: "Balloon tune high", letter: "A″", bars: [45, 60], about: "The first eight in F, trumpets and flute at two octaves. The second eight lifts again, to G." },
    { name: "Landing", letter: "Coda", bars: [61, 66], about: "E flat and F sway up to G twice over, and one tutti hit." },
  ],
  themes: [
    {
      id: "balloon",
      name: "Balloon tune",
      kind: "theme",
      about: "A falling step or two and a rise of a sixth, twice over, then a triad up into the half cadence.",
      occurrences: places(`
        5 horns 12 literal
        45 flute 12 transposed +27 -- a third higher and two octaves up
        45 trumpets 12 transposed +15
      `),
    },
    {
      id: "homeward",
      name: "Homeward",
      kind: "theme",
      about: "The tune's second eight bars: the same opening, climbing by step to the deceptive vi, and falling to the tonic.",
      occurrences: places(`
        13 horns 24 literal
        21 flute 24 transposed +12 -- its last bar turned to point at B minor
        53 flute 24 transposed +17
        53 trumpets 24 transposed +5
      `),
    },
    {
      id: "puff",
      name: "Puff",
      kind: "motif",
      about: "Two bars: down three notes in dotted rhythm, then a leap up to a long note. It opens nearly every phrase in the piece.",
      occurrences: places(`
        5 horns 6 literal
        1 horns 6 inverted -4 -- upside down, as the intro rises
        3 oboe 3 fragmented -- the falling three notes alone
        7 horns 3 fragmented
        13 horns 6 literal
        15 horns 6 transposed +1 tonal
        19 horns 6 varied +3
        21 flute 6 transposed +12
        23 flute 6 transposed +13 tonal
        45 flute 6 transposed +27
        45 trumpets 6 transposed +15
        53 flute 6 transposed +17
        53 trumpets 6 transposed +5
        55 flute 6 transposed +18 tonal
        55 trumpets 6 transposed +6 tonal
        59 trumpets 6 varied +8
        61 trumpets 6 varied +16 -- the coda's last memory of it
      `),
    },
    {
      id: "hoist",
      name: "Hoist",
      kind: "motif",
      about: "A triad in three even beats, up or, at the end of a phrase, down. It fills the bars where the tune waits.",
      occurrences: places(`
        8 horns 3 literal
        18 horns 3 inverted +7 tonal
        20 oboe 3 transposed +10
        22 horns 3 transposed -9
        24 horns 3 transposed -7
        26 flute 3 inverted +19 tonal
        28 flute 3 inverted +12 tonal
        33 oboe 3 transposed +12 tonal
        39 oboe 3 transposed +15 tonal
        43 trumpets 3 transposed +8
        48 horns 3 transposed -9
        48 flute 3 transposed +27
        48 trumpets 3 transposed +15
        58 flute 3 inverted +24 tonal
        58 trumpets 3 inverted +12 tonal
      `),
    },
    {
      id: "cloud",
      name: "Cloud tune",
      kind: "theme",
      about: "The oboe's minor answer: a leap of a fourth, a slow step down, and a sigh onto the next bar.",
      occurrences: places(`
        29 oboe 6 literal
        31 oboe 6 varied -4 -- same rhythm, a third down, ending by step
        37 oboe 3 varied -4
        38 oboe 3 varied -1 -- the side-step: its first bar again, a semitone lower than the one at 29
      `),
    },
  ],
  patterns: [
    { id: "waltz", name: "Waltz", kind: "accompaniment", about: "Bass on one, string chords on two and three.", every: 3, spans: spans("strings_waltz 13-19, strings_waltz 37-40, strings_waltz 45-56, strings_waltz 61-64") },
    { id: "running", name: "Running harp", kind: "figuration", about: "Six eighths to the bar, up the chord and back, the balloon well off the ground.", every: 3, spans: spans("harp 21-28") },
    { id: "walk", name: "Walking bass", kind: "accompaniment", about: "Three quarters a bar in the cellos and basses, wandering through the chord rather than holding it.", spans: spans("cellos_basses 21-28, cellos_basses 49-52, cellos_basses 57-59") },
    { id: "gliss", name: "Harp sweeps", kind: "figuration", about: "A four-octave rush up the tonic chord, marking the arrivals.", spans: spans("harp 20-20, harp 60-60, harp 65-65") },
    { id: "stabs", name: "Thin stabs", kind: "accompaniment", about: "One short chord and one bass note on each downbeat, and then air.", every: 3, spans: spans("strings_waltz 29-36, cellos_basses 29-36") },
    { id: "cdrone", name: "Hold on C7", kind: "pedal", about: "Strings sit on the third and seventh of C7 while everything above and below it moves.", spans: spans("strings 41-44") },
    { id: "descent", name: "Octave walk", kind: "figuration", about: "The bass walks a whole octave down C mixolydian, in quarters, to the note it started on.", spans: spans("cellos_basses 42-44") },
    { id: "sway", name: "Sway", kind: "ostinato", about: "E flat and F rock under the trumpets, two bars at a time, until G arrives.", every: 6, spans: spans("cellos_basses 61-64") },
  ],
  ...chart(`
    tempo 1-66 Waltz
    key 1 D
    1 D I | 2 G IV | 3 D I | 4 A7 V7
    5 D I | 6 G IV | 7 D/A I64 | 8 E7/G# V65/V | 9 A V HC
    10 Bb bVI -- the swerve: A rises a semitone in the bass to the flat sixth | 11 Gm iv | 12 A7 V7
    13 D I IAC -- elided: the cadence is also the start of the next eight
    14 G IV | 15 Em ii | 16 A7 V7 | 17 Bm vi DC | 18 E7 V7/V | 19 A7 V7 | 20 D I PAC
    21 D I | 22 G IV | 23 Em ii | 24 A7 V7 | 25 Bm vi DC | 26 E7 V7/V | 27 A7 V7
    key 28 Bm pivot -- F#7 would be V7/vi in D, and this time B minor is kept
    28 F#7 V7
    29 Bm i | 30 F#7/A# V65 | 31 G VI | 32 D/F# III6 | 33 Em iv | 34 A7 V7/III | 35 D III | 36 F#7 V7
    37 Bm i IAC
    key 38 Bb direct -- the side-step: the whole harmony drops a semitone, with D held in the middle
    38 Bb I | 39 Gm vi | 40 Eb IV
    key 41 F pivot -- C is V of V in B flat, and held for four bars it becomes the dominant of F
    41 C9 V9 | 43 C7 V7
    45 F I IAC | 46 Bb IV | 47 F/C I64 | 48 G7/B V65/V | 49 C V HC
    50 Db bVI | 51 Bbm iv
    key 52 G chromatic -- where bar 12 had the home dominant, this one comes a tone too high, and lands in G
    52 D7 V7
    53 G I IAC -- elided, as at bar 13
    54 C IV | 55 Am ii | 56 D7 V7 | 57 Em vi DC | 58 A7 V7/V | 59 D7 V7 | 60 G I PAC
    61 Eb bVI | 62 F bVII | 63 Eb bVI | 64 F bVII | 65 G I -- the flat six, flat seven, one of the fanfare, not a classical cadence, so unnamed
    66 G I
  `),
};
