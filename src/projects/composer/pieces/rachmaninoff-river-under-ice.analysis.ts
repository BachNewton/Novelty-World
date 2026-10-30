import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  movements: [
    { name: "Exposition", bars: [1, 32], about: "B flat minor under the ice, then a second subject in the relative major, D flat." },
    { name: "Development", bars: [33, 42], about: "The opening cell climbs by semitones, a key to a phrase, from B flat to the dominant." },
    { name: "Reprise", bars: [43, 51], about: "The second subject returns as the climax, in the tonic's own major, and breaks." },
    { name: "Coda", bars: [52, 63], about: "The first subject remembered, the introduction again, and a major chord at the very end." },
  ],
  sections: [
    { name: "Introduction", letter: "Intro", bars: [1, 4], about: "Chords tolling on a low B flat, with a chromatic line falling inside them, and a run down to the dominant." },
    { name: "First subject", letter: "A", bars: [5, 14], about: "The piano sings the theme over its own arpeggios, in two five-bar halves, closing on the tonic." },
    { name: "First subject, strings", letter: "A′", bars: [15, 24], about: "Violins and cellos in octaves, the piano pouring around them, and the bass falling by semitones. It tips over into D flat." },
    { name: "Second subject", letter: "B", bars: [25, 32], about: "D flat major: clarinet, then oboe, with a soft pulse on one repeated note in the piano." },
    { name: "Build", letter: "Dev", bars: [33, 42], about: "The opening cell on B flat, B, C and D flat, the rising tail breaking free, and a long dominant of B flat with timpani and brass." },
    { name: "Climax", letter: "B′", bars: [43, 51], about: "The second subject in B flat major, tutti, then twice as high; it breaks on G flat and falls in octaves." },
    { name: "Aftermath", letter: "A″", bars: [52, 58], about: "Horns and clarinet remember the theme, the strings the tail, thin after the storm." },
    { name: "Ice again", letter: "Coda", bars: [59, 63], about: "The introduction note for note, until the last bar turns major." },
  ],
  themes: [
    {
      id: "river",
      name: "River theme",
      kind: "theme",
      about: "A sigh around one note: F, a lean up to G flat and back, then a step down and a turn. It hardly moves, and the whole piece grows out of it.",
      occurrences: places(`
        5 piano_right_hand 8 literal voice=loud
        7 piano_right_hand 8 transposed +3 tonal voice=loud
        15 violins 8 transposed -12
        15 cellos 8 transposed -24
        17 violins 8 transposed -9 tonal
        17 cellos 8 transposed -21 tonal
        33 cellos 8 transposed -24 -- the build starts here, back on the first pitch
        35 cellos 8 transposed -23 -- a semitone higher
        37 violins 8 transposed -10
        37 cellos 8 transposed -22 -- a semitone higher still
        52 french_horns 8 transposed -12 -- what is left of it, on a horn
        54 clarinet 8 transposed -9 tonal
      `),
    },
    {
      id: "tail",
      name: "Rising tail",
      kind: "theme",
      about: "Scale steps up from G flat to D flat, the only thing in the first subject that tries to get out.",
      occurrences: places(`
        9 piano_right_hand 4 literal voice=loud
        19 violins 4 transposed -12
        19 cellos 4 transposed -24
        39 violins 4 transposed -10 tonal -- in the build it is the theme's way up
        39 cellos 4 transposed -22 tonal
        39 clarinet 4 transposed -10 tonal
        56 violins 4 literal
      `),
    },
    {
      id: "thaw",
      name: "Thaw",
      kind: "theme",
      about: "The second subject: a chromatic step and a run up to the high D flat, and a slow fall. The same lift as the tail, but it arrives.",
      occurrences: places(`
        25 clarinet 8 literal
        29 oboe 8 transposed +3 tonal
        43 violins 8 transposed +21 -- the climax: B flat major, everyone
        43 cellos 8 transposed -3
        43 oboe 8 transposed +9
        43 flute 8 transposed +9
        43 french_horns 8 transposed -3
        47 violins 8 transposed +24 tonal -- a third higher, with the trumpets
        47 cellos 8 transposed tonal
        47 oboe 8 transposed +12 tonal
        47 flute 8 transposed +12 tonal
        47 french_horns 8 transposed tonal
        47 trumpets 8 transposed +12 tonal
      `),
    },
    {
      id: "descent",
      name: "Falling line",
      kind: "motif",
      about: "F down to B by semitones inside the tolling chords. It sets the harmony moving over a bass that doesn't.",
      occurrences: places(`
        1 piano_right_hand 12.5 literal
        59 piano_right_hand 12.5 literal
      `),
    },
  ],
  patterns: [
    { id: "tonic-pedal", name: "B flat pedal", kind: "pedal", about: "The low B flat tolling under the introduction, and under its return at the end.", spans: spans("piano_left_hand 1-3, basses 1-4, piano_left_hand 59-63, basses 59-63") },
    { id: "arpeggios", name: "Left-hand arpeggios", kind: "accompaniment", about: "Broad waves through a tenth or more, the piano accompanying itself.", spans: spans("piano_left_hand 5-14") },
    { id: "cascades", name: "Cascades", kind: "figuration", about: "Fast piano figures pouring round the strings' theme, in sixes and in fours, up and down the keyboard.", spans: spans("piano_right_hand 15-24") },
    { id: "lament-bass", name: "Falling bass", kind: "sequence", about: "B flat, A, A flat, G, G flat, F: the bass slides down under the theme, and the harmony darkens with it.", spans: spans("basses 15-18") },
    { id: "pulse", name: "Pulse", kind: "pedal", about: "One soft repeated note in the middle of the piano, keeping time when nothing else does.", spans: spans("piano_right_hand 25-28, piano_right_hand 33-34") },
    { id: "semitone-rise", name: "Semitone climb", kind: "sequence", about: "A two-bar phrase, each statement a semitone above the last: B flat minor, B minor, C minor.", spans: spans("cellos 33-38") },
    { id: "dominant-roll", name: "Dominant roll", kind: "pedal", about: "Trombones join as the climb nears the dominant, and the timpani rolls on F until the arrival.", spans: spans("trombones 39-42, timpani 41-42") },
    { id: "hammered-chords", name: "Hammered triplets", kind: "accompaniment", about: "The piano's chords struck in triplets, under the tune at the climax.", spans: spans("piano_right_hand 43-44") },
    { id: "fall", name: "Fall in octaves", kind: "figuration", about: "The diminished seventh tumbling down the piano in octaves, slowing by note value as it goes.", spans: spans("piano_right_hand 51-51, violins 51-51") },
    { id: "tolls", name: "Tolls", kind: "pedal", about: "One deep stroke at each peak of the climax, and under the very last chord.", spans: spans("tolls 43-50, tolls 63-63") },
  ],
  ...chart(`
    tempo 1-63 Adagio sostenuto
    tempo 4 rit. -- a real glide over the run, arriving on the barline
    tempo 5-32 rubato -- written into the ticks: barlines hold, the middle of a bar leans
    tempo 47-50 rubato -- and the big chords are rolled
    tempo 51 rit. -- a real glide over the fall
    tempo 52-62 rubato

    key 1 Bbm
    1 Bbm i | 1.3 Edim7/Bb viio43/V -- the chords turn over a bass that stays put
    2 Ebm/Bb iv64 | 2.3 Bbaug I+ | 3 Gb/Bb VI6 | 3.3 Cm7b5/Bb iiø42
    4 Bb7b9 - ? -- F, A flat and B over the pedal: the falling line's B is really C flat, a Neapolitan colour over the tonic
    4.3 F7sus4 V7sus4 | 4.4 F7 V7 HC
    5 Bbm i | 6 Ebm/Bb iv64 | 6.3 Bbm i
    7 Db III | 8 Gb/Db VI64 | 8.3 Db III
    9 Ebm iv | 9.3 Ebm/Gb iv6 | 9.4 Adim7 viio7
    10 Bbm i
    11 Cm7b5/Eb iiø65 | 11.3 F7/Eb V42 | 11.4 F7 V7
    12 Bbm/F i64 | 12.3 F7 V7 | 12.4 Edim7/F - ? -- the cello's E natural over the bass F: a passing diminished seventh
    13 Bbm i | 13.3 Gb/Bb VI6 | 13.4 F7 V7
    14 Bbm i IAC | 14.4 F7/A V65
    15 Bbm i | 15.3 F/A V6
    16 Ab7sus4 VII7sus4 | 16.3 Edim7/G viio65/V | 17 Gbadd9 VIadd9 | 18 Db/F III6 -- the bass slides B flat, A, A flat, G, G flat, F
    19 Ebm iv | 19.3 Ebm/Gb iv6 | 19.4 Adim7 viio7
    20 Bbm i
    21 Cm7b5/Eb iiø65 | 21.3 F7/Eb V42 | 21.4 F7 V7
    22 Bbm/F i64 | 22.3 F7 V7 | 22.4 Edim7/F - ?
    23 Bbm i | 23.3 Gb/Bb VI6
    key 23.4 Db pivot -- G flat, VI of B flat minor, turns out to be IV of D flat
    23.4 Ab7/Gb V42 | 24 Gb IV | 24.3 Ab7sus4 V7sus4 ? -- over the G flat, still in the bass | 24.4 Ab7 V7
    25 Db I IAC -- the third on top, in the clarinet
    26 Gbmaj7 IVmaj7 | 27 Ebm9 ii9 | 28 Ab7sus4 V7sus4 | 28.3 Ab7 V7
    29 Db/F I6 | 29.3 Ab7/Eb V43 | 29.4 Db/F I6
    30 Bbm7 vi7 | 31 B bVII -- C flat major, the flat side of the key
    31.3 Abm/B v6 | 31.4 Eb7/Db V42/V | 32 Ab7 V7
    33 Bbm vi DC -- the dominant of D flat goes to its relative minor, and we are home
    key 34 Bbm pivot -- vi of D flat is the tonic again
    34 Ebm/Bb iv64 | 34.3 Bbm i
    key 35 Bm sequential -- up a semitone, no preparation at all
    35 Bm i | 36 Em/B iv64 | 36.3 Bm i
    key 37 Cm sequential -- a semitone again
    37 Cm i | 38 Fm/C iv64 ? -- the theme's E flat and G hang over it | 38.3 Cm7 i7
    key 39 Db sequential -- and again, now major
    39 Db I | 39.3 Fm/Ab iii6 | 39.4 Db I
    40 Ebm/Gb ii6 -- the bass slips to E natural on beat 2
    key 40.3 Bb chromatic -- C seven on that E is the dominant's dominant, with no common chord
    40.3 C7/E V65/V
    41 Edim7/F viio7/V(ped) -- F is reached and held, with the diminished seventh of the dominant over it
    41.3 F7/Eb V42 | 42 F7 V7 | 42.3 F7/Eb V42
    43 Bb I -- the arrival: the bass leaps from the seventh, so it's a blow rather than a cadence
    44 Ebmaj7 IVmaj7 | 45 Cm9 ii9 | 46 F7sus4 V7sus4 | 46.3 F7 V7
    47 Bb/D I6 | 47.3 F/C V64 | 48 Gm vi | 48.3 Gm7/F vi42
    49 Ab bVII | 49.3 Fm/Ab v6 | 49.4 Eb/Bb IV64
    50 Gbmaj7 bVImaj7 -- the break: instead of a dominant, the flat sixth, and every voice stops rising
    51 Edim7 viio7/V | 51.4 F7/C V43 -- the fall lands on a low C, with the basses and timpani taking F just after it
    key 52 Bbm direct -- major is gone: the theme returns in the minor
    52 Bbm i | 53 Ebm/Bb iv64 | 53.3 Bbm i
    54 Db III | 55 Gb/Db VI64 | 55.3 Db III
    56 Ebm iv | 56.3 Ebm/Gb iv6 | 56.4 Adim7 viio7
    57 Bbm i | 58 Cm7b5/Eb iiø65 | 58.4 F7 V7
    59 Bbm i IAC | 59.3 Edim7/Bb viio43/V
    60 Ebm/Bb iv64 | 60.3 Bbaug I+ | 61 Gb/Bb VI6 | 61.3 Cm7b5/Bb iiø42
    62 Bb7b9 - ? -- the same colour as bar 4, but now it falls back to the tonic instead of the dominant
    62.3 Bbm i
    63 Bb I -- D natural: a Picardy third, with no cadence at all, just a change of colour on the pedal
  `),
};
