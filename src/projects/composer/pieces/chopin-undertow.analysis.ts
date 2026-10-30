import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  movements: [
    { name: "E flat minor", bars: [1, 28], about: "The stream starts in the left hand, the tune rises over it, and it all sinks a third to C flat." },
    { name: "Middle: the stream crosses", bars: [29, 60], about: "Hands exchanged, the tune in the bass: B minor, G minor, a chromatic climb, and twelve bars on the dominant." },
    { name: "Return and coda", bars: [61, 92], about: "The tune in full chords, the Neapolitan at the peak, the coda in contrary motion, and the stream stops dead." },
  ],
  sections: [
    { name: "Introduction", letter: "Intro", bars: [1, 4], about: "The left hand alone, on tonic and dominant, gathering." },
    { name: "Theme", letter: "A", bars: [5, 20], about: "The tune as a single line, then in octaves and chords, a circle of fifths down, and the Neapolitan into the cadence." },
    { name: "Long fall", letter: "Tr", bars: [21, 28], about: "A falling phrase, softer each bar, into C flat, whose dominant is respelled as the dominant of B minor." },
    { name: "Crossing, in B minor", letter: "B", bars: [29, 36], about: "The stream in the right hand, the tune in left-hand octaves, turning towards A minor, and then G." },
    { name: "Tune in G minor", letter: "B′", bars: [37, 40], about: "A major third lower, louder, with its own Neapolitan." },
    { name: "Climb by semitones", letter: "C", bars: [41, 48], about: "One bar, up a semitone eight times, each minor chord followed by the dominant of the next: the sequence's next step is home." },
    { name: "Dominant", letter: "Ret", bars: [49, 60], about: "Twelve bars on B flat: the stream falls and crosses back, chords rise over it, and a scale plunges to the bottom of the keyboard." },
    { name: "Return", letter: "A′", bars: [61, 76], about: "The tune in full chords, an octave higher from bar 65, the peak on the Neapolitan and German sixth, a deceptive cadence." },
    { name: "Coda", letter: "Coda", bars: [77, 88], about: "A tonic-and-subdominant rocking, contrary motion, and a fall through the whole keyboard." },
    { name: "Last chords", letter: "End", bars: [89, 92], about: "The stream stops. Three chords with silence between them." },
  ],
  themes: [
    {
      id: "tune",
      name: "Undertow",
      kind: "theme",
      about: "Long notes climbing in fourths and steps, with a held note at the top of each phrase, while everything under it rushes.",
      occurrences: places(`
        5 right_hand 8 literal
        9 right_hand 8 literal
        29 left_hand 8 transposed -16 voice=loud -- in the bass, in B minor, the torrent above it
        33 left_hand 8 varied -- the tune's rise, a fourth higher, leaning towards A
        37 left_hand 8 transposed -20 voice=loud -- in G minor
        61 right_hand 8 literal -- in full chords
        65 right_hand 8 transposed +12 -- an octave up, and the climax opens
      `),
    },
    {
      id: "circle",
      name: "Falling answer",
      kind: "theme",
      about: "The tune's second half: a two-bar step down, the harmony going round the circle of fifths under it.",
      occurrences: places(`
        13 right_hand 8 literal
        69 right_hand 8 literal
      `),
    },
    {
      id: "fall",
      name: "Sinking phrase",
      kind: "theme",
      about: "Each bar drops in chords and lands on a long note, softer: the transition's whole idea.",
      occurrences: places(`
        21 right_hand 8 literal
      `),
    },
    {
      id: "step",
      name: "Rising step",
      kind: "motif",
      about: "One bar in the left hand: a fourth up, two steps, a third. The climb's single idea, and the tune's first bar remembered.",
      occurrences: places(`
        41 left_hand 4 literal
        42 left_hand 4 transposed +1
        43 left_hand 4 transposed +2
        44 left_hand 4 transposed +3
        45 left_hand 4 transposed +4
        46 left_hand 4 transposed +5
        47 left_hand 4 transposed +6
        48 left_hand 4 transposed +7
      `),
    },
  ],
  patterns: [
    { id: "torrent", name: "The torrent", kind: "figuration", about: "Semiquavers without a break for 88 bars, a falling arpeggio shape answered by a turn. It changes hands at bar 29, back at bar 53, and takes both from bar 81.", spans: spans("left_hand 1-27, right_hand 28-52, left_hand 53-88, right_hand 81-88") },
    { id: "circleseq", name: "Circle of fifths", kind: "sequence", about: "C flat, F, B flat, E flat, A flat, D flat, G flat: a two-bar step down at each return of the shape.", spans: spans("right_hand 13-16, right_hand 69-71") },
    { id: "climb", name: "Semitone climb", kind: "sequence", about: "Eight bars, a semitone each, the same shape in both hands.", spans: spans("left_hand 41-48, right_hand 41-48") },
    { id: "throb", name: "Inner repeated notes", kind: "figuration", about: "A held top and bottom with the middle of the chord throbbing in semiquavers, at the cadence and at the peak.", spans: spans("right_hand 17-20, right_hand 64-64, right_hand 72-73") },
    { id: "bbpedal", name: "Pedal on B flat", kind: "pedal", about: "Octaves on the dominant in the left hand, the stream falling away above.", spans: spans("left_hand 49-52") },
    { id: "plunge", name: "Plunge", kind: "figuration", about: "A scale to the bottom of the keyboard, a bar at a time: into the return, and into the coda.", spans: spans("left_hand 60-60, left_hand 76-76, right_hand 85-85") },
  ],
  ...chart(`
    tempo 1-92 Presto
    tempo 91-92 Fermata -- the last chord is held six beats after the semiquavers have stopped
    key 1 Ebm
    1 Ebm i | 2 Ebm i | 2.3 Cb VI
    3 Ddim7/Eb viio7(ped) ? -- D and C flat lean on a tonic bass, the A flat never comes | 3.3 Ebm i
    4 Bb/D V6 -- C flat is only a neighbour | 4.3 Adim7 viio7/V ? -- A in the bass, leading back to the dominant it doesn't reach yet

    5 Ebm i | 6 Gb/Bb III6 -- the tune's G flat over its B flat: the tonic note itself has gone | 6.3 Abm7 iv7
    7 Cb7 Ger+6 -- A natural in the tune: the augmented sixth, going straight to B flat
    8 Bb7 V7 HC

    9 Ebm i | 9.4 Abm/B iv6 ? -- the bass drops to C flat under the held tune
    10 Ebm i | 10.3 Abm7 iv7
    11 Db7/B V42/III | 11.3 Db/F V6/III | 12 Gb/Bb III6 | 12.4 Db/F V6/III
    13 Cb VI -- also the Neapolitan of B flat minor, which is how it gets to F | 13.3 F7/A V65/v
    14 Bbm v | 14.3 Gdim viio/iv -- E flat seven without its root | 15 Abm iv | 15.3 Db/F V6/III | 16 Gb III | 16.3 Cb VI
    17 Fb/Ab N6 -- the Neapolitan, on F flat, at the top of the theme | 17.4 Cb7 Ger+6 ? -- G flat in the bass: the German sixth on its fifth | 18 Cb7 Ger+6 -- A natural in the bass: the augmented sixth turned upside down
    19 Ebm/Bb i64 -- the cadential six-four | 19.3 Bb7 V7
    20 Ebm i PAC

    21 Ebm i | 21.3 Ebm/Gb i6 | 22 Abm/B iv6 | 22.3 Abm iv | 23 Db7 V7/III | 24 Gb III
    key 25 Cb pivot -- C flat is VI in E flat minor, and now the tonic, a third down
    25 Cb/Eb I6 | 25.3 Cb/Gb I64 | 26 Gb7/Bb V65 | 26.3 Gb7/E V42 ? -- F flat in the bass, due to fall; the third never sounds, and D and G flicker through
    key 27 Bm enharmonic -- G flat seven is F sharp seven: it resolves to the minor, and C flat major is now B minor
    27 Bm/D i6 ? -- a harmonic minor scale rising two octaves over D
    28 F#7 V7 HC -- the stream crosses to the right hand

    29 Bm/F# i64 -- the tune is the bass now, so the first chord stands on its fifth
    29.3 Bm i | 30 Bm/D i6 | 30.3 Em7/D iv42 ? -- the tune's D hangs under E minor | 30.4 F#7 V7
    31 C/G bII64 -- the Neapolitan of B minor, with the tune as its bass | 31.3 C/E N6 | 31.4 C bII
    32 F#7/C# V43 | 32.3 F#7/A# V65
    33 Bm i
    key 33.3 Am chromatic -- B and D stay, F and G sharp come in: the diminished seventh of A
    33.3 G#dim7/D viio43 | 34 E7/G# V65 | 35 Am/C i6
    key 35.4 Gm pivot -- A minor's D7 is the dominant of G: a major third below B minor now
    35.4 D/A V64 | 36 D7/F# V65 | 36.3 D7 V7

    37 Gm/D i64 | 37.3 Gm i | 38 Gm/Bb i6 | 38.3 Cm7/Bb iv42 ? -- the same hanging bass as bar 30 | 38.4 D V
    39 Ab/Eb bII64 -- bar 31 again, the Neapolitan of G minor | 39.3 Ab/C N6 | 39.4 Ab bII
    40 D/A V64 ? -- A and F sharp alone until the bass reaches D | 40.3 D/F# V6 | 40.4 D V

    41 Gm/D i64
    key 41.3 Abm sequential -- the chain: each minor chord, then the dominant of the one a semitone up
    41.3 Eb7/Bb V43 ? -- root, fifth and seventh: the third is left to the ear
    42 Abm/Eb i64
    key 42.3 Am sequential
    42.3 E7/B V43 ? | 43 Am/E i64
    key 43.3 Bbm sequential
    43.3 F7/C V43 ? | 44 Bbm/F i64
    key 44.3 Bm sequential -- the score has G flat seven, heard as the F sharp seven of bar 28
    44.3 F#7/C# V43 ? | 45 Bm/F# i64
    key 45.3 Cm sequential
    45.3 G7/D V43 ? | 46 Cm/G i64
    key 46.3 C#m sequential -- the score has A flat seven: G sharp seven, by ear
    46.3 G#7/D# V43 ? | 47 C#m/G# i64
    key 47.3 Dm sequential
    47.3 A7/E V43 ? | 48 Dm/A i64
    key 48.3 Ebm sequential -- the next step of the chain is D sharp minor: E flat minor, home
    48.3 Bb7/F V43

    49 Bb7 V7 ? -- no D anywhere in the bar: root and seventh, the line circling A flat | 50 Bb7b9 V7b9 | 51 Bb7 V7 | 52 Bb7b9 V7b9
    53 Ddim7 viio7 -- the stream back in the left hand, and the root gone | 53.4 Bb/F V64
    54 Bb7b9 V7b9 ? -- A flat and C flat over B flat, the D held back to beat 3 | 54.3 Bb7 V7
    55 Gb/Bb III6 -- D flat in place of D: the dominant clouds over | 55.3 Bb7 V7 ? -- the left hand's D against the held D flat
    56 Gb7/Bb V65/VI
    57 Bb7 V7 | 57.3 Adim7 viio7/V | 58 Bb7 V7 | 58.3 Ddim7/F viio65
    59 Bb7 V7 | 59.3 Ddim7/Ab viio43 ? -- no D: C flat, F and A flat with the chromatic run | 60 Bb7/Ab V42 -- a scale from A flat to G flat, plunging out of the bass and into the tonic

    61 Ebm i IAC -- the fifth on top | 62 Ebm/Bb i64 | 62.3 Abm iv
    63 Cb7 Ger+6 -- A natural in the bass this time, the augmented sixth inverted | 64 Bb7 V7 HC
    65 Ebm/Bb i64 | 66 Ebm i | 66.3 Abm/B iv6
    67 Db7/B V42/III ? -- the F arrives only at beat 3 | 67.3 Db7/F V65/III | 68 Gb III
    69 Cb VI | 69.3 F7/A V65/v | 70 Bbm/Db v6 | 70.3 Eb7 V7/iv
    71 Abm iv | 71.3 Fb/Ab N6 | 72 Fb bII -- the peak: the Neapolitan in root position, from the bottom of the keyboard | 72.4 Cb7 Ger+6 ? -- on its fifth, as in bar 17
    73 Cb7 Ger+6 | 74 Ebm/Bb i64 | 74.3 Bb7 V7
    75 Cb VI DC -- the cadence swerves to C flat | 75.3 Ddim7 viio7 | 76 Bb7 V7

    77 Ebm i IAC -- the fifth on top, as the coda takes over | 77.3 Abm iv -- rocking between tonic and subdominant
    78 Ebm i | 78.3 Abm iv
    79 Ddim7/Ab viio43 ? -- D itself isn't sounded: C flat, F and A flat | 79.3 Ebm/Gb i6
    80 Ddim7/Ab viio43 | 80.3 Bb7 V7
    81 Fb bII | 82 Cb7 Ger+6 ? -- on its fifth | 83 Ebm/Bb i64 | 84 Bb7 V7
    85 Ebm i PAC -- from the very top | 86 Ddim7 viio7 | 87 Ebm/Gb i6 | 87.3 Cb7 Ger+6 ? -- on its fifth | 88 Bb7 V7
    89 Cb7 Ger+6 -- bar 7's chord, alone | 90 Bb7b9 V7b9
    91 Ebm i IAC -- the fifth on top, with the tonic on top only at beat 3
  `),
};
