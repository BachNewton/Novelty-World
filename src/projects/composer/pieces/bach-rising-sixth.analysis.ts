import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  movements: [
    { name: "Out to the relative major", bars: [1, 23], about: "G minor states everything, the solo walks it to B flat, and the ritornello confirms it, shortened." },
    { name: "Through the minor keys", bars: [24, 49], about: "D minor, then G minor in passing, then C minor: the head gets passed round and the tutti shrink." },
    { name: "Home", bars: [50, 69], about: "Her theme back in G minor, a long dominant, a cadenza, and the whole ritornello again." },
  ],
  sections: [
    { name: "Ritornello in G minor", letter: "R1", bars: [1, 10], about: "Everyone in octaves for two bars, then a circle of fifths, a Neapolitan and the cadence." },
    { name: "First solo", letter: "S1", bars: [11, 18], about: "The harpsichord's own broken-chord theme, with the strings tossing the head between them, into B flat." },
    { name: "Ritornello in B flat", letter: "R2", bars: [19, 23], about: "Only the head and a little spinning-out: five bars of the ten." },
    { name: "Second solo", letter: "S2", bars: [24, 32], about: "Leaping broken chords over a rising bass, then the hands swap and the head falls down a sequence to D minor." },
    { name: "Ritornello in D minor", letter: "R3", bars: [33, 37], about: "The head again, and a Neapolitan where the circle of fifths used to be." },
    { name: "Third solo", letter: "S3", bars: [38, 45], about: "Hand-crossing while the head climbs through cello, viola and violins, D minor to C minor, to a pedal on G." },
    { name: "Ritornello in C minor", letter: "R4", bars: [46, 49], about: "The strings' head with the harpsichord spinning against it for the first time." },
    { name: "Fourth solo", letter: "S4", bars: [50, 52], about: "A short way home: her theme in G minor, one bar of it." },
    { name: "Dominant pedal", letter: "Pedal", bars: [53, 56], about: "D held under sextuplets, the head in close stretto, then the strings stepping down in chords." },
    { name: "Cadenza", letter: "Cadenza", bars: [57, 59], about: "The harpsichord alone, in time: a scale down in sixths, a diminished seventh up, and a trill." },
    { name: "Last ritornello", letter: "R5", bars: [60, 69], about: "All ten bars as they began, and the final G." },
  ],
  themes: [
    {
      id: "head",
      name: "Rising sixth",
      kind: "theme",
      about: "The ritornello's two bars: a leap of a sixth falling back by step, stated three times, each one lower, then a scale up to the octave. The whole band plays it in octaves.",
      occurrences: places(`
        1 violin_1 8 literal
        19 violin_1 8 transposed +3 tonal -- the head in B flat
        33 violin_1 8 transposed +7 tonal -- in D minor
        46 violin_1 8 transposed +5 tonal -- in C minor, the harpsichord off on its own
        60 violin_1 8 literal
      `),
    },
    {
      id: "sixth",
      name: "Sixth cell",
      kind: "motif",
      about: "The head's first two beats: the leap and its fall. Everything in the solos is built from it.",
      occurrences: places(`
        1 violin_1 2 literal
        1.3 violin_1 2 transposed -1 tonal
        2 violin_1 2 transposed -4 tonal
        6 cello_and_bass 2 transposed -24 tonal -- in the bass, under tenths
        6.3 cello_and_bass 2 transposed -25 tonal
        7 violin_1 2 transposed +5 tonal
        7.3 violin_1 2 transposed +8 tonal
        9 violin_1 2 transposed +3 tonal
        13 violin_1 2 transposed +3 tonal -- the solo's interjections, one string at a time
        13.3 violin_2 2 transposed +2 tonal
        14 violin_1 2 transposed tonal
        14.3 violin_2 2 transposed -4 tonal
        15.3 violin_2 2 transposed -2 tonal
        19 violin_1 2 transposed +3 tonal
        19.3 violin_1 2 transposed +2 tonal
        20 violin_1 2 literal
        28 violin_2 2 transposed -5 tonal -- two beats apart, a step lower each bar
        28.3 violin_1 2 transposed +7 tonal
        29 violin_2 2 transposed -7 tonal
        29.3 violin_1 2 transposed +5 tonal
        30 violin_2 2 transposed -9 tonal
        30.3 violin_1 2 transposed +3 tonal
        33 violin_1 2 transposed +7 tonal
        33.3 violin_1 2 transposed +6 tonal
        34 violin_1 2 transposed +3 tonal
        36 violin_1 2 transposed -2 tonal
        38 cello_and_bass 2 transposed -17 tonal -- the climb through the band starts in the cellos
        38.3 cello_and_bass 2 transposed -18 tonal
        40 viola 2 transposed -12 tonal
        40.3 viola 2 transposed -13 tonal
        42 violin_2 2 transposed +5 tonal
        42.3 violin_2 2 transposed +4 tonal
        44 violin_1 2 transposed +12 tonal -- the top of the climb
        44.3 violin_1 2 transposed +11 tonal
        46 violin_1 2 transposed +5 tonal
        46.3 violin_1 2 transposed +4 tonal
        47 violin_1 2 transposed +1 tonal
        52 violin_1 2 literal
        53 violin_2 2 transposed -1 tonal -- stretto over the pedal, every bar, second violins first
        53.3 violin_1 2 transposed +2 tonal
        54 violin_2 2 literal
        54.3 violin_1 2 transposed +5 tonal
        55 violin_2 2 transposed tonal
        55.3 violin_1 2 transposed +5 tonal
        60 violin_1 2 literal
        60.3 violin_1 2 transposed -1 tonal
        61 violin_1 2 transposed -4 tonal
        66 violin_1 2 transposed +5 tonal
        66.3 violin_1 2 transposed +8 tonal
        68 violin_1 2 transposed +3 tonal
      `),
    },
    {
      id: "climb",
      name: "Scale to the octave",
      kind: "motif",
      about: "The head's last two beats: a straight harmonic-minor scale, tonic to tonic, that throws the music into what follows.",
      occurrences: places(`
        2.3 violin_1 2 literal
        20.3 violin_1 2 transposed +3 tonal
        34.3 violin_1 2 transposed +7 tonal
        47.3 violin_1 2 transposed +5 tonal
        61.3 violin_1 2 literal
      `),
    },
    {
      id: "spin",
      name: "Spinning cell",
      kind: "motif",
      about: "The Fortspinnung: a little run down off the beat, each one a fifth below the last, over the circle of fifths.",
      occurrences: places(`
        3.3.25 violin_1 1.75 literal
        4.1.25 violin_1 1.75 transposed -7 tonal
        4.3.25 violin_1 1.75 transposed -2 tonal
        5.1.25 violin_1 1.75 transposed -9 tonal
        5.3.25 violin_1 1.75 transposed -3 tonal
        21.3.25 violin_1 1.75 literal
        22.1.25 violin_1 1.75 transposed +2 tonal
        48.1.25 violin_1 1.75 literal
        48.3.25 violin_1 1.75 transposed -7 tonal
        49.1.25 violin_1 1.75 transposed -2 tonal
        49.3.25 violin_1 1.75 transposed -9 tonal
        62.3.25 violin_1 1.75 literal
        63.1.25 violin_1 1.75 transposed -7 tonal
        63.3.25 violin_1 1.75 transposed -2 tonal
        64.1.25 violin_1 1.75 transposed -9 tonal
        64.3.25 violin_1 1.75 transposed -3 tonal
      `),
    },
    {
      id: "tail",
      name: "Falling triad",
      kind: "motif",
      about: "How a ritornello ends: down the tonic chord from the third to the tonic, in one breath.",
      occurrences: places(`
        10 violin_1 2 literal
        37 violin_1 2 transposed -5 tonal
        69 violin_1 2 literal
      `),
    },
    {
      id: "solo",
      name: "Her theme",
      kind: "theme",
      about: "The harpsichord's own idea, nothing to do with the head: a broken triad that turns over at the top, one bar on each harmony.",
      occurrences: places(`
        11 harpsichord_right_hand 4 literal
        13 harpsichord_right_hand 4 transposed +3 tonal -- in B flat
        51 harpsichord_right_hand 4 literal -- home
      `),
    },
  ],
  patterns: [
    { id: "circle", name: "Circle of fifths", kind: "sequence", about: "Roots falling by fifth through the diatonic chords, two to the bar, with suspensions in the second violins.", spans: spans("cello_and_bass 3-5, cello_and_bass 48-49, cello_and_bass 62-64") },
    { id: "canon", name: "Head down the circle", kind: "sequence", about: "The two violins two beats apart, each entry a step lower, as the roots fall by fifths in D minor.", spans: spans("violin_1 28-30, violin_2 28-30, cello_and_bass 28-30") },
    { id: "chromatic", name: "Rising semitones", kind: "sequence", about: "First violins climbing D, E flat, E, F, F sharp, G in long notes above a bass that rises in thirds and falls in fifths.", spans: spans("violin_1 24-27") },
    { id: "broken", name: "Broken chords", kind: "figuration", about: "Unbroken semiquavers in the right hand, with the strings thinned to a chord a bar.", spans: spans("harpsichord_right_hand 11-17, harpsichord_right_hand 24-27, harpsichord_right_hand 51-51") },
    { id: "swap", name: "Hands swapped", kind: "figuration", about: "The semiquavers go to the left hand, the right hand holding crotchets.", spans: spans("harpsichord_left_hand 28-30") },
    { id: "crossing", name: "Hand-crossing", kind: "figuration", about: "The left hand reaches over for a high note every other beat while the right hand keeps turning.", spans: spans("harpsichord_left_hand 38-41") },
    { id: "against", name: "Against the tutti", kind: "figuration", about: "Semiquaver arpeggios running over the strings' head, the only time she refuses to double it.", spans: spans("harpsichord_right_hand 46-49") },
    { id: "trill", name: "Written-out trill", kind: "figuration", about: "Measured demisemiquavers just before a ritornello, as a player would have ornamented them.", spans: spans("harpsichord_right_hand 18-18, harpsichord_right_hand 32-32, harpsichord_right_hand 59-59") },
    { id: "sextuplets", name: "Sextuplets", kind: "figuration", about: "Triplet semiquavers over the pedal, a gear up from everything before.", spans: spans("harpsichord_right_hand 53-56") },
    { id: "gpedal", name: "Pedal on G", kind: "pedal", about: "The dominant of C minor in the bass, ahead of the fourth ritornello.", spans: spans("cello_and_bass 44-45") },
    { id: "dpedal", name: "Pedal on D", kind: "pedal", about: "The dominant of G minor, four bars of it, in octave quavers.", spans: spans("cello_and_bass 53-56, harpsichord_left_hand 53-56") },
  ],
  ...chart(`
    tempo 1-69 Allegro
    key 1 Gm
    1 Gm i -- the sixth is a 6 falling to 5 over G, so the opening is the tonic, not C minor
    1.2.5 Adim/C iio6 ? -- only C and A sound in the octaves; bar 6 harmonises this exact bass and fills in the E flat
    1.3 D/F# V6 | 1.4 D7/C V42 ? -- again bare C and A | 1.4.5 Gm/Bb i6
    2 Cm/Eb iv6 | 2.2.5 D/F# V6 ? -- A and F sharp alone | 2.3 Gm i ? -- a scale, no harmony of its own, tonic up to tonic
    3 Cm7 iv7 | 3.3 F7 VII7 | 4 Bb III | 4.3 Ebmaj7 VImaj7 | 5 Am7b5 iiø7 | 5.3 D7 V7
    6 Gm i | 6.2.5 Adim/C iio6 | 6.3 D/F# V6 | 6.4 D7/C V42 ? -- no F sharp in the beat: the chord it just left hangs in the air | 6.4.5 Gm/Bb i6
    7 Cm iv | 7.2 G7 V7/iv | 7.3 Cm iv | 7.3.5 Ab bII | 7.4 Bb7 III7 ? -- a passing chord: the bass is walking from A flat up to C
    8 Ab/C N6 -- the Neapolitan, spelled out in the harpsichord | 8.3 D7 V7 -- the bass runs down through the chord
    9 Gm i | 9.2 D7/C V42 | 9.3 D7 V7
    10 Gm i IAC -- the third on top; the line runs down the triad to the tonic a beat later
    10.3 N.C. - -- the harpsichord alone, leading into her solo

    11 Gm i | 11.3 D V
    key 12 Bb pivot -- E flat is VI in G minor and IV in B flat
    12 Eb IV | 12.3 F V | 13 Bb I | 13.3 F V
    14 Eb IV | 14.3 Cm ii | 15 F V | 15.3 Bb I | 16 Eb/G IV6 | 16.3 F/A V6
    17 Bb/D I6 | 17.2 Eb IV | 17.3 F V | 17.4 F7 V7
    18 Bb/F I64 -- the cadential six-four | 18.3 F V -- D trilling on C, a 6 going to 5

    19 Bb I PAC -- solo and ritornello elide: the cadence is the first note of the head
    19.2.5 Adim viio | 19.3 F/C V64 | 19.4 Bb I
    20 Cm/Eb ii6 | 20.2 Bb/D I6 | 20.2.5 F V | 20.3 Bb I ? -- the scale again
    21 Eb IV | 21.3 F7 V7 | 22 Gm vi | 22.3 F/A V6 | 22.4 F7 V7
    23 Bb I IAC -- the fifth on top, falling to the tonic | 23.3 N.C. - -- the harpsichord's link, alone

    24 Bb I | 24.3 Gm vi | 25 Eb IV | 25.3 C7 V7/V | 26 F V | 26.3 D7 V7/vi
    key 27 Dm pivot -- G minor is vi in B flat and iv in D minor
    27 Gm iv | 27.3 C#dim7/E viio65 -- spelled in the score as a D flat, heard as C sharp, the leading note of D minor
    28 Dm i | 28.3 Gm iv | 29 C VII | 29.3 F III | 30 Bb VI | 30.3 Edim iio
    31 A7 V7 | 32 Dm/F i6 | 32.2 Em7b5/G iiø65 | 32.3 A V -- F trilling on E, a 6 going to 5

    33 Dm i PAC
    33.2.5 Edim/G iio6 ? -- bare G and E, as in bar 1 | 33.3 A/C# V6 | 33.4 A7/G V42 ? | 33.4.5 Dm/F i6
    34 Gm/Bb iv6 | 34.2.5 A/C# V6 ? | 34.3 Dm i ? -- the scale
    35 Eb/G N6 -- the Neapolitan again, in bar 8's place | 35.3 A7 V7 -- the bass running down the chord
    36 Dm i | 36.2 A7/G V42 | 36.3 A7 V7
    37 Dm i IAC -- the third on top, down the triad as in bar 10 | 37.3 N.C. - -- the link, alone

    38 Dm i | 38.3 A7/C# V65 | 39 Dm i
    key 39.3 Gm pivot -- G minor is iv in D minor, and stays as the new tonic
    39.3 Gm i | 40 Gm i | 40.2 Cm7 iv7 ? -- a passing C in the bass under a held G minor; the viola has E flat a moment before | 40.3 D7 V7
    41 Gm i
    key 41.3 Cm chromatic -- B flat rises to B natural: the tonic turns major and becomes the dominant of C minor
    41.3 G7 V7 | 42 Cm i | 42.3 G7 V7
    43 Ab VI | 43.3 Fm iv | 44 Cm/G i64 | 44.3 F#dim7/G viio7/V(ped) | 45 G7 V7

    46 Cm i IAC -- the violins have the tonic, and the harpsichord's G sits above them
    46.2.5 Ddim/F iio6 ? | 46.3 G/B V6 | 46.4 G7/F V42 ? | 46.4.5 Cm/Eb i6
    47 Fm/Ab iv6 | 47.2.5 G/B V6 ? | 47.3 Cm i ? -- the scale, with the harpsichord's running the other way
    48 Fm iv | 48.3 Bb7 VII7 | 49 Eb III
    key 49.3 Gm pivot -- A flat is VI in C minor and the flat supertonic of G minor
    49.3 Ab bII

    50 F#dim7/A viio65 | 50.3 D7 V7
    51 Gm i PAC -- she arrives home on the first note of her theme | 51.3 D V
    52 Cm iv | 52.3 F#dim7/A viio65

    53 D7 V7 | 54 Gm/D i64 | 54.3 D7b9 V7b9
    55 Eb/D VI(ped) ? -- the sixth degree leaning on the pedal, and only that | 55.3 D7 V7
    56 Gm/D i64 | 56.2 D7 V7 | 56.3 Gm/D i64 | 56.4 D V

    57 D7 V7 ? -- a harmonic-minor scale down in sixths over the held D: line, not chords
    58 F#dim7 viio7 -- straight up the diminished seventh | 59 D7 V7 -- down the seventh chord to the bass, then B flat trilling on A

    60 Gm i PAC
    60.2.5 Adim/C iio6 ? | 60.3 D/F# V6 | 60.4 D7/C V42 ? | 60.4.5 Gm/Bb i6
    61 Cm/Eb iv6 | 61.2.5 D/F# V6 ? | 61.3 Gm i ? -- the scale
    62 Cm7 iv7 | 62.3 F7 VII7 | 63 Bb III | 63.3 Ebmaj7 VImaj7 | 64 Am7b5 iiø7 | 64.3 D7 V7
    65 Gm i | 65.2.5 Adim/C iio6 | 65.3 D/F# V6 | 65.4 D7/C V42 ? | 65.4.5 Gm/Bb i6
    66 Cm iv | 66.2 G7 V7/iv | 66.3 Cm iv | 66.3.5 Ab bII | 66.4 Bb7 III7 ?
    67 Ab/C N6 | 67.3 D7 V7
    68 Gm i | 68.2 D7/C V42 | 68.3 D7 V7
    69 Gm i IAC -- as in bar 10 the third is on top; the line falls to G, and the last chord is the tonic alone
  `),
};
