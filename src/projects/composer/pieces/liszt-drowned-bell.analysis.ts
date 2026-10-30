import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  movements: [
    { name: "The bell", bars: [1, 13], about: "Five notes in the dark, and the recitative that asks what they mean." },
    { name: "Menace", bars: [14, 36], about: "The motif as a threat, climbing through keys a minor third apart, then a cadenza that turns the dominant into A major." },
    { name: "Love", bars: [37, 52], about: "The tritone opens to a fourth and the same shape becomes a nocturne: A major, then F major in three hands." },
    { name: "Mockery", bars: [53, 66], about: "The sour tritone comes back limping, and the love song is dragged over a dominant pedal." },
    { name: "Transfiguration", bars: [67, 89], about: "The love song as a march in D flat, which is C sharp major, and the bell drowning at last in the tonic." },
  ],
  sections: [
    { name: "Prologue", letter: "Intro", bars: [1, 6], about: "The motif alone in the bass, then again a tritone higher, each answered by the same diminished seventh." },
    { name: "Recitative", letter: "Rec", bars: [7, 13], about: "Unbarred speech over rolled chords, rising to the bell's notes racing up the keyboard over G sharp." },
    { name: "Allegro agitato", letter: "A", bars: [14, 23], about: "C sharp drumming in the bass, the motif in the left hand a minor third higher every two bars, and a chromatic fall in octaves." },
    { name: "Storm", letter: "A′", bars: [24, 31], about: "The motif on top in F sharp minor, then D minor, whole-tone octaves in both hands, and G sharp seven as a long tremolo." },
    { name: "Cadenza", letter: "Cad", bars: [32, 36], about: "Arpeggios and a chromatic scale falling through G sharp seven, a trill from G sharp to A, and the sidestep into A." },
    { name: "Love song in A", letter: "B", bars: [37, 44], about: "A nocturne of two four-bar phrases, closing on a perfect cadence." },
    { name: "Love song in F", letter: "B′", bars: [45, 52], about: "The same tune in the middle of the hand with arpeggios above and bass below: three hands' worth. It ends sliding to D flat." },
    { name: "Scherzo diabolico", letter: "C", bars: [53, 61], about: "The motif in limping rhythm, up a minor third, then in the left hand, in bare octaves, and in a whirl of diminished sevenths." },
    { name: "Dragged over the pedal", letter: "C′", bars: [62, 66], about: "The love song's opening over a G sharp pedal, each chord a little further from it, until the pedal becomes D flat's dominant." },
    { name: "Apotheosis", letter: "B″", bars: [67, 80], about: "The love song as a march, D flat, then through A and F and home: the piece's chain of falling thirds, run in triumph." },
    { name: "Coda", letter: "Coda", bars: [81, 89], about: "The bells, one last diminished seventh from the prologue, and the love song in the deep over a tonic that doesn't move." },
  ],
  themes: [
    {
      id: "bell",
      name: "Bell",
      kind: "motif",
      about: "The piece's seed, five notes: up a minor third, up a tritone, up a semitone, down a minor third. C sharp, E, B flat, B, G sharp. Everything below is this shape.",
      occurrences: places(`
        1 left_hand 7 literal
        4 left_hand 7 transposed +6 -- at once a tritone higher, which is the farthest away it can go
      `),
    },
    {
      id: "plea",
      name: "Plea",
      kind: "theme",
      about: "The motif as speech: the same five notes in the right hand, then trailing on down in the rhythm of a voice.",
      occurrences: places(`
        7.2 right_hand 4 literal
        9.2 right_hand 4 transposed +3
      `),
    },
    {
      id: "menace",
      name: "Menace",
      kind: "theme",
      about: "The motif quickened and driven: the same pitches, in the same rhythm the love song will take. It rises a minor third at a time.",
      occurrences: places(`
        16 left_hand 4.5 literal
        18 left_hand 4.5 transposed +3
        20 left_hand 4.5 transposed +6 -- the last note changes, and the sequence breaks
        24 right_hand 4.5 transposed +29 -- on top now, in F sharp minor
        26 right_hand 4.5 transposed +37 -- the same a major third down, in D minor
      `),
    },
    {
      id: "love",
      name: "Love song",
      kind: "theme",
      about: "The motif made tender: the tritone opens to a perfect fourth, the semitone to a whole tone, and it is suddenly in major. A, C sharp, F sharp, G sharp, E: the same rising shape and the same rhythm as Menace.",
      occurrences: places(`
        37 right_hand 8 literal
        45 right_hand 8 transposed +8 voice=loud -- F major, in the middle of the arpeggios
        62 right_hand 8 transposed +11 tonal -- over the pedal, drained
        67 right_hand 8 transposed +16 -- the march: full chords, staccato dotted tread beneath
        73 right_hand 8 transposed +20 -- F major in the march
        75 right_hand 8 transposed +28 -- home in D flat, an octave above the march
        87 right_hand 8 transposed +16 -- soft, in the same place as the march, and the end
      `),
    },
    {
      id: "love-head",
      name: "Lover's rise",
      kind: "motif",
      about: "The love song's first three notes, a rising third and fourth. Each phrase of the song starts with it.",
      occurrences: places(`
        37 right_hand 3 literal
        39 right_hand 3 transposed +2 tonal -- the second phrase, on B
        41 right_hand 3 transposed +4 tonal -- on C sharp
        45 right_hand 3 transposed +8 voice=loud
        47 right_hand 3 transposed +10 tonal voice=loud
        49 right_hand 3 transposed tonal voice=loud -- with a minor third, in F
        62 right_hand 3 transposed +11 tonal
        64 right_hand 3 transposed +14 tonal -- bent: the third is now minor and the top falls short
        67 right_hand 3 transposed +16
        69 right_hand 3 transposed +18 tonal
        71 right_hand 2.25 transposed +12 -- A major, the top note then drumming in triplets
        73 right_hand 3 transposed +20
        75 right_hand 3 transposed +28
        77 right_hand 3 transposed +20 tonal -- the top note now D flat, the tonic
        87 right_hand 3 transposed +16
      `),
    },
    {
      id: "mockery",
      name: "Mockery",
      kind: "theme",
      about: "The motif back with its tritone, each note struck twice in a limp. What was a love song is now a sneer.",
      occurrences: places(`
        53 right_hand 3.5 literal
        55 right_hand 3.5 transposed +3
        57 left_hand 3.5 transposed -16 -- down in the left hand, the right hand jabbing above
        59 right_hand 3.5 transposed +4 -- bare octaves
        59 left_hand 3.5 transposed -20
      `),
    },
  ],
  patterns: [
    { id: "drowned-chord", name: "Drowned chord", kind: "figuration", about: "A single diminished seventh, C sharp, E, G, B flat, high and ringing. Every chord in the menace is reached through it, and it is the last dark thing in the coda.", spans: spans("right_hand 3-3, right_hand 6-6, right_hand 12-13, right_hand 86-86") },
    { id: "gsharp-pedal", name: "G sharp pedal", kind: "pedal", about: "The dominant of C sharp, drummed or held: under the end of the recitative, the storm's tremolo and the love song dragged out at the end of the scherzo.", spans: spans("left_hand 11-11, left_hand 30-31, left_hand 62-66") },
    { id: "drum", name: "C sharp drum", kind: "accompaniment", about: "Octave tremolo in the left hand under off-beat right-hand notes.", spans: spans("left_hand 14-15, right_hand 14-21") },
    { id: "minor-thirds", name: "Climb in minor thirds", kind: "sequence", about: "C sharp minor, E minor, G minor, B flat minor: the four keys that share one diminished seventh, the same chord turning into a door to each.", spans: spans("left_hand 16-21, right_hand 16-21") },
    { id: "chromatic-octaves", name: "Chromatic octaves", kind: "figuration", about: "Both hands falling together by semitone.", spans: spans("right_hand 22-22, left_hand 22-22") },
    { id: "whole-tone-rise", name: "Whole-tone climb", kind: "figuration", about: "Each hand up a whole-tone scale, a semitone apart, so between them all twelve notes sound and no key is left.", spans: spans("right_hand 28-29, left_hand 28-29") },
    { id: "nocturne-bed", name: "Nocturne bed", kind: "accompaniment", about: "Broken chords in triplets, up and back, a bar of two chords.", spans: spans("left_hand 37-44") },
    { id: "three-hands", name: "Three hands", kind: "figuration", about: "Thumb melody with arpeggios above it and a bass below: Thalberg's trick.", spans: spans("right_hand 45-50") },
    { id: "limp", name: "Limp", kind: "accompaniment", about: "Bass on the beat, a short chord just before the next: every beat stumbles.", every: 1, spans: spans("left_hand 53-56") },
    { id: "march-tread", name: "March tread", kind: "accompaniment", about: "A heavy bass note and three quick steps up to the next: it replaces the nocturne's triplets, under the same tune.", every: 2, spans: spans("left_hand 67-70, left_hand 77-80") },
    { id: "bells", name: "Bells", kind: "figuration", about: "High repeated A flats with a touch of B flat, off the beat.", spans: spans("right_hand 81-82") },
  ],
  ...chart(`
    tempo 1-6 Lento -- the fixed tempo with the motif in very long notes
    tempo 7-13 Recitative -- free speech, written into the note lengths
    tempo 14-31 Allegro agitato
    tempo 32-36 Cadenza
    tempo 37-52 Andante -- the same pulse, slowed by the long melody notes
    tempo 53-60 Scherzando
    tempo 61-64 Stretto -- the note values tighten from sextuplets to thirty-seconds
    tempo 67-80 Alla marcia
    tempo 84-89 Lento -- written out: the last bars slow into long chords

    key 1 C#m
    1 N.C. - -- one line in the bass: the key is only implied
    3.3 C#dim7/G - -- a shock from nowhere, with no function: it answers the motif and resolves to nothing
    4 N.C. -
    6.3 C#dim7 -
    7 C#m i | 7.3 C#dim7 io7 -- a common-tone diminished seventh on the tonic, the recitative's sigh
    8 E III
    9 C - -- a major third below E with no function: it repeats the speech's gesture a minor third up from C sharp's opening
    9.3 C#dim7/Bb io42 ? -- without its G: bar 7's chord, with B flat now in the bass
    10 E7 III7 -- A hangs as a suspension over G sharp
    10.3 G#5 V5 -- the bare dominant arrives
    11 C#m/G# i64 -- over the pedal: a cadential six-four that never resolves to its dominant
    12 C#dim7/Bb io42 -- the drowned chord, poured down both hands
    13.2 C#5 i5
    14 C#m i | 15 C#dim io -- only the fifth moves, G sharp down to G, and the tonic curdles
    16 C#m i
    16.3 Gdim7/Bb viio65/V -- the drowned chord, really F double sharp's, the diminished seventh of G sharp
    17 G# V | 17.2 A VI | 17.3.5 G#7 V7
    key 18 Em sequential -- the same bars up a minor third: the drowned chord is the door to every key of this chain
    18 Em i | 18.3 A#dim7/C# viio65/V
    19 B V | 19.2 C VI | 19.3.5 B7 V7
    key 20 Gm sequential -- up another minor third
    20 Gm i | 20.3 C#dim7/E viio65/V
    key 21 Bbm sequential -- up again, and now the bars are halved
    21 Bbm i | 21.3 Edim7/G viio65/V
    22 N.C. - -- chromatic octaves in both hands
    key 23 F#m chromatic -- the fall lands on a dominant out of nowhere
    23 C#7 V7 -- hammered in silence, and resolving straight into the next wave rather than ending anything
    24 F#m i | 24.3 D#dim7 viio7/VII | 24.4.5 E/G# VII6
    25 C#7 V7 | 25.2 D VI | 25.4 C#7 V7 -- the bass worries D and C sharp, as bar 17 did
    key 26 Dm chromatic -- the same bars a major third lower: the first of the falling thirds
    26 Dm i | 26.3 Bdim7 viio7/VII | 26.4.5 C/E VII6
    27 A7 V7 | 27.2 Bb VI | 27.4 A7 V7
    28 N.C. - -- whole-tone scales a semitone apart: no key at all
    key 30 C#m direct -- the climb stops on G sharp seven, and the home dominant is simply there
    30 G#7 V7 -- the longest dominant in the piece: it holds through the whole cadenza
    33 G#5 V5 -- a chromatic scale falling over the bare fifth, then the trill
    36 A VI DC -- the cadenza's trill tips from G sharp to A: the home dominant goes deceptive, and stays
    key 37 A pivot -- VI of C sharp minor becomes I: the first of the keys a major third apart
    37 A I | 37.3 F#m vi | 38 E7 V7 | 38.3 A I
    39 Bm ii | 39.3 E7 V7 | 40 Bm7 ii7 | 40.3 E7 V7
    41 A I | 41.3 Amaj7 Imaj7 | 42 Dm iv -- the minor subdominant, the song's one shadow
    42.3 A/C# I6 | 42.4 E/B V64 ? -- passing, with the A and C sharp still ringing over it | 43 F#m7 vi7 | 43.3 B7/D# V65/V
    44 E7 V7 | 44.3 A I PAC
    key 45 F common-tone -- A stays as the third of F: down a major third
    45 F I | 45.3 Dm vi | 46 C7 V7 | 46.3 F I
    47 Gm ii | 47.3 C7 V7 | 48 Gm7 ii7 | 48.3 C9 V9
    49 F I IAC -- the third on top
    50 Bbm iv | 50.3 F/A I6
    key 51 Db common-tone -- F stays as the third of D flat: down a major third again, and D flat is C sharp respelled
    51 Db I | 52 Dbmaj7 Imaj7
    52.4 N.C. - -- one low G, the tritone from D flat, which is the scherzo's trapdoor
    key 53 C#m enharmonic -- D flat major turns to C sharp minor on the same notes: the love is mocked by a change of spelling
    53 C#m i | 53.3 Gdim7/Bb viio65/V ? -- without its C sharp, and the tune's B a stray neighbour
    53.4 G#7 V7 | 54 Gdim7/Bb viio65/V | 54.3 G#7 V7
    key 55 Em sequential -- up a minor third, the same chain as bar 18
    55 Em i | 55.3 A#dim7/C# viio65/V ? -- without its E | 55.4 B7 V7 | 56 A#dim7/C# viio65/V | 56.3 B7 V7
    key 57 Am sequential -- the motif to the left hand, up a fourth: the chain gives way
    57 Am i | 57.3 D#dim7/F# viio65/V ? -- no A in it: F sharp, C, E flat and the tune's G
    57.4 E V | 58 B7/D# V65/V | 58.3 E/G# V6 ? -- the bass walks through G natural under the G sharp above: a passing clash
    58.4 C#dim7/F# - ? -- the drowned chord over a passing F sharp in the descending bass
    59 N.C. - -- bare octaves: the motif and a scale, no harmony
    61 C#dim7 - ? -- two notes outside it, B and F: an octatonic whirl around the drowned chord
    key 62 C#m direct -- back on the home dominant pedal
    62 E/G# III6 -- the B sharp in the first beat and a half makes it an augmented chord for a moment
    63 F#m/G# iv(ped) | 63.3 B/G# VII(ped)
    64 G/G# - ? -- a G major triad a semitone against its pedal, the love song at its furthest from home
    key 65 Db enharmonic -- G sharp seven respelled as A flat seven: the same dominant now means D flat, and C sharp minor will come out major
    65 Ab7 V7
    67 Db I PAC -- the whole piece turns here: C sharp minor's tonic, in major, marching
    67.3 Bbm vi | 68 Ab V | 68.3 Ab/C V6 | 68.4 Ab V
    69 Ebm ii | 69.3 Ab7 V7 | 70 Gb IV | 70.3 Ab7 V7 ? -- no C: the tune's last B flat and A flat over the bare root, fifth and seventh
    key 71 A chromatic -- the dominant slides up a semitone instead of resolving: D flat to A, a major third down, as the keys fell before
    71 A I | 71.3 F#m vi | 72 E7 V7 | 72.3 A I
    key 73 F common-tone -- down a major third again
    73 F I | 73.3 Dm vi | 74 C7 V7 | 74.3 F I
    key 75 Db common-tone -- and the last third lands where it started
    75 Db I | 75.3 Bbm vi | 76 Ab V | 76.2 Ab7/Gb V42 | 76.2.5 Gbmaj7 IVmaj7 | 76.3 Fm7 iii7 | 76.4 Ab/Eb V64
    77 Db I | 78 Gbm iv -- the bar 42 shadow, here in triumph
    78.3 Db/F I6 | 78.4 Ab7/Eb V43
    79 Bbm7 vi7 | 79.3 Cdim/Eb viio6 | 80 Ab7 V7 | 80.3 Db I PAC
    81 Db I | 81.3 Bbm vi | 81.4 Ab/C V6
    82 Db/Ab I64 | 82.2 Gb IV | 82.4 Db/F I6 | 83 Db I
    84 Db I | 84.2 Gb IV | 84.3 Db I PC
    86.3 C#dim7/G - -- the prologue's chord, one last time, unanswered
    87 Db I | 87.3 Bbm7/Db vi65 | 88 Db5 I5 -- the song's last notes over the bare pedal
    89 Db I -- no cadence: the tonic has never left
  `),
};
