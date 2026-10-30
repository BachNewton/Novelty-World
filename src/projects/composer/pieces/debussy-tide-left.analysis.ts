import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  sections: [
    { name: "Slack water", letter: "A", bars: [1, 10], about: "A bare low C sharp, a bell of open fourths, and the call asked twice in stacked fifths. Then a whole-tone ripple draws the water off." },
    { name: "Wet sand", letter: "B", bars: [11, 20], about: "The call in gliding major ninths, then dominant ninths stepping about with no goal, until C sharp's own ninth rings on." },
    { name: "Gulls", letter: "C", bars: [21, 27], about: "Black keys over F sharp: pentatonic flicks in a huge empty space, and one D major cloud from nowhere." },
    { name: "The flood", letter: "D", bars: [28, 40], about: "Swells growing from eighths to sixteenths, pulled back into whole tones, then the climax: the call in full over E, cut off mid-fall." },
    { name: "Slack water again", letter: "A′", bars: [41, 51], about: "The bell, the call finished at last, the ninths high and hollow without their bass, and C sharp with no third." },
  ],
  themes: [
    {
      id: "call",
      name: "Call",
      kind: "motif",
      about: "Three notes on the pentatonic: G sharp held, a lift to B, a drop to F sharp. A question, and everything grows from it.",
      occurrences: places(`
        4 right_hand 3 literal
        5 right_hand 3 transposed +12 -- asked again, an octave up
        7 right_hand 3 varied -- now it ends rising to C sharp, over A
        8 right_hand 3 varied +12 -- the same, over F sharp
        11 right_hand 3 literal -- the top of the gliding ninths
        13 right_hand 3 transposed +12
        29.2 right_hand 3 literal -- riding the swell
        31 right_hand 3 transposed +12 -- in octaves
        36 right_hand 3 transposed +24 -- the climax, in full chords
        42 right_hand 3 literal
        44 right_hand 3 transposed +12
      `),
    },
    {
      id: "long-call",
      name: "Long call",
      kind: "theme",
      about: "The call with its fourth note: it falls on to E and rests. From bar 36 it runs on down to C sharp, and bar 42 lets it finish there.",
      occurrences: places(`
        11 right_hand 4 literal
        11 left_hand 4 transposed -19 -- the left hand's fifths move with it, the same shape
        13 right_hand 4 transposed +12
        13 left_hand 4 transposed -7
        31 right_hand 4 transposed +12 -- E is the start of the rising fourths
        36 right_hand 4 transposed +24 -- runs on through C sharp, G sharp and B to bar 38
        42 right_hand 4 literal -- bar 43 goes on to C sharp, the note it was always after
        44 right_hand 4 transposed +12 -- high and hollow, no left hand
      `),
    },
    {
      id: "flick",
      name: "Gull flick",
      kind: "motif",
      about: "Five notes up the F sharp pentatonic, gone in under a beat.",
      occurrences: places(`
        21.2.5 right_hand 1 literal
        22.1.5 right_hand 0.5 inverted -- the fall back
        24 right_hand 1 transposed -- the long one starts the same way, then goes on over the top and back
        46.2.5 right_hand 0.5 inverted -- one last fall, far away
      `),
    },
  ],
  patterns: [
    { id: "bell", name: "Bell", kind: "figuration", about: "Open fourths high up, rung softly over the pedal.", spans: spans("right_hand 2-3, right_hand 6-6, right_hand 20-20, right_hand 41-41") },
    { id: "csharp-pedal", name: "C sharp pedal", kind: "pedal", about: "The low C sharp is the shoreline: the piece keeps coming back to rest on it.", spans: spans("left_hand 1-6, left_hand 19-20, left_hand 41-41, left_hand 45-51") },
    { id: "fsharp-pedal", name: "F sharp pedal", kind: "pedal", about: "A low F sharp with C sharp above it, left ringing under the gulls.", spans: spans("left_hand 21-25") },
    { id: "whole-tone-ripple", name: "Whole-tone ripple", kind: "figuration", about: "A falling whole-tone scale, each note left held, so the pedal blurs it into one sonority.", spans: spans("right_hand 9-10, right_hand 39-39, right_hand 47-47") },
    { id: "planing", name: "Gliding chords", kind: "sequence", about: "One chord shape carried bodily along the tune: real parallel fifths and sevenths, with no voice leading to speak of.", spans: spans("right_hand 11-14, left_hand 11-14, right_hand 15-18, left_hand 15-18, right_hand 44-45") },
    { id: "swell", name: "Swell", kind: "figuration", about: "An arpeggio wave rising up the left hand and sinking back, in eighths, triplets, then sixteenths, each wave faster than the last.", spans: spans("left_hand 28-32, left_hand 35-38") },
  ],
  ...chart(`
    tempo 1-51 Lent -- the swells of the flood get faster by note value, not by tempo
    key 1 C#m
    1 C#sus2 isus2 -- the bell's fourths over the pedal: no third yet, so neither major nor minor
    4 C#m7 i7 -- E arrives, and it is minor; the call's F sharp is the pentatonic's fourth note, not a harmony
    6 C#sus2 isus2
    7 Amaj9 VImaj9 -- bass and fifth with the tune on top, and the C sharp that makes it a chord comes last
    8 F#sus4 ivsus4 -- stacked fifths with G sharp as the ninth, and no third
    9 Gaug7 - -- the whole-tone scale on G, a tritone from home: every note of it is written, so this names only the frame
    10.3 C#5 i5 -- just the low C sharp
    11 F#maj9 - -- the call harmonised by planing: the same major ninth shape on each note, so none of these has a function
    11.2.5 Amaj9 - | 11.3 Emaj9 - | 12 Dmaj9 -
    13 F#maj9 - | 13.2.5 Amaj9 - | 13.3 Emaj9 - | 14 Dmaj9 -
    14.3 C#5 i5
    15.2 A9 - -- dominant ninths, unresolved: each one simply slides to the next
    15.3 B9 - | 16.1.5 D9 - | 16.3 C9 - | 17 Bb9 - | 18 C9 - | 18.1.5 Bb9 -
    19 C#9 V9/IV -- home's own note turned into a dominant, and held for two bars
    key 21 F# common-tone -- the C sharp stays and the bass takes F sharp, so the long ninth does resolve, at a distance: all black keys, F sharp pentatonic
    21 F#69 I69 -- the whole pentatonic as one chord, heard over its root
    26 Dmaj9 - -- from nowhere: the gliding chord from bar 12, a major third below the F sharp
    27 N.C. -
    key 28 C#m direct -- the flood rises straight from the old bass note
    28 C#m9 i9 | 29 Emaj9 IIImaj9 | 30 Amaj7 VImaj7 -- F sharp, the end of the call, hangs on above as an added sixth
    31 F#9 IV9 -- the dorian colour: A sharp in place of the minor sixth
    32 G#m7 v7 -- a minor dominant, with no leading note, under fourths climbing in the right hand
    33 C#7sus4 i7sus4 -- the modal cadence: it arrives, but the fourths never let it settle
    34 Daug7 - -- whole tone on D, a semitone above where the swell landed, drawn back at once
    35.3 E/B III64 -- the bass gets to B and leaps to E: the only thing here that acts like a dominant, with whole-tone thirds still climbing on top
    36 E III | 36.3 E69 III69 -- pentatonic chords over the relative major: the climax is the pentatonic, not a dominant
    37 C#m i | 37.3 C#m7/B i42 -- the low C sharp is still ringing under the B
    38 Amaj9 VImaj9 -- III, i, VI: the bass falling in thirds, the plainest harmony in the piece at the loudest moment
    39 Gaug7 - -- the same whole-tone chord as bar 9, cut off mid-fall
    40 N.C. -
    41 C#sus2 isus2 -- the opening bar, as it was
    42 Amaj9 VImaj9 ? -- no C sharp this time: only A, E, and the call
    43 F#m7 iv7 ? -- the third never sounds: F sharp, C sharp and E
    44 F#maj9 - ? -- the gliding chords of bar 11 without their bass or fifth: the ear fills in the rest
    44.2.5 Amaj9 - ? | 44.3 Emaj9 - ?
    45 Dmaj9 - ? -- the bar 12 chord with no D: only its top three notes
    45.2.5 C#m i ? -- the low C sharp comes in under those same notes, and F sharp hangs over it
    46 C#6sus2 i6sus2 -- the final sonority, tried out by one high flick
    47 C#aug7 - -- the whole-tone ripple once more, this time on the tonic
    48 C#6sus2 i6sus2 -- root, ninth, fifth and sixth, rolled and left: no third, so it never says major or minor
  `),
};
