import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  sections: [
    { name: "Creeping in", letter: "Intro", bars: [1, 4], about: "The bass alone, chromatically up from tonic to dominant, then the same again with pizzicato offbeats and a ting." },
    { name: "Tiptoe", letter: "A", bars: [5, 12], about: "The bassoon's eight-bar tune in F sharp minor, half on the dominant, half on to a full close." },
    { name: "Handed round", letter: "A′", bars: [13, 20], about: "The clarinet takes it an octave up with the bassoon muttering below, and the last bar slides to D7." },
    { name: "Organ loft", letter: "B", bars: [21, 28], about: "G minor, a semitone up, slow on organ and flute, with the bass and bassoon still trying to sneak underneath." },
    { name: "Hush", letter: "Link", bars: [29, 32], about: "Everyone tiptoes on C sharp, a spoon falls in bar 31, and bar 32 holds its breath." },
    { name: "Tiptoe in company", letter: "A″", bars: [33, 40], about: "Muted trumpet with the clarinet holding long notes, then bassoon and clarinet in octaves to the close." },
    { name: "Away", letter: "Coda", bars: [41, 44], about: "The tune's first bar twice, fading, the bass creeping back down, and one F sharp major ting as the thief gets out." },
  ],
  themes: [
    {
      id: "tiptoe",
      name: "Tiptoe tune",
      kind: "theme",
      about: "Up from the dominant by a pick-up and short notes, a chromatic creep down from D to B, and a half close.",
      occurrences: places(`
        5 bassoon 16 literal
        13 clarinet 16 transposed +12
        33 muted_trumpet 16 transposed +12
      `),
    },
    {
      id: "caught",
      name: "Second thoughts",
      kind: "theme",
      about: "The tune starts again, stumbles on a bar of Neapolitan seventh falling in thirds, and closes.",
      occurrences: places(`
        9 bassoon 16 literal
        17 bassoon 8 literal -- the first half, and the clarinet finishes it
        37 bassoon 16 literal
        37 clarinet 16 transposed +12
      `),
    },
    {
      id: "sneak",
      name: "Sneak",
      kind: "motif",
      about: "Four notes on tiptoe, a pick-up leaping a fourth and two short steps. The thief's whole character.",
      occurrences: places(`
        5 bassoon 4 literal
        9 bassoon 3.5 literal
        13 clarinet 4 transposed +12
        17 bassoon 3.5 literal
        24.3 clarinet 3 varied -- trying its luck on D7 in the organ loft
        25 bassoon 4 transposed -11
        26 bassoon 4 varied
        28.3 clarinet 3 varied
        33 muted_trumpet 4 transposed +12
        37 bassoon 3.5 literal
        37 clarinet 3.5 transposed +12
        41 bassoon 4 literal
        42 bassoon 4 literal
      `),
    },
    {
      id: "getaway",
      name: "Getaway",
      kind: "motif",
      about: "A falling G7 and a rising C sharp seventh, one bar: two chords a tritone apart that share their two tritone notes, F and B.",
      occurrences: places(`
        11 bassoon 4 literal
        19 clarinet 4 literal
        39 bassoon 4 literal
        39 clarinet 4 transposed +12
      `),
    },
    {
      id: "loft",
      name: "Organ tune",
      kind: "theme",
      about: "The first long notes in the piece: a slow, solemn line on flute, over a Neapolitan in its harmony.",
      occurrences: places(`
        21 flute 16 literal
        25 flute 16 varied +5 -- the answer, higher and more insistent, which slips a semitone at its end
      `),
    },
    {
      id: "creep",
      name: "Creep",
      kind: "motif",
      about: "The hush's little arpeggio up a C sharp seventh.",
      occurrences: places(`
        29 bassoon 4 literal
        30 bassoon 4 varied -- D for B, a bite on the flat ninth
      `),
    },
  ],
  patterns: [
    { id: "walk", name: "Chromatic walk", kind: "ostinato", about: "The bass climbs by semitones, a note a beat, tonic to dominant over two bars. In the tune it swings and shortens at its turn.", every: 4, spans: spans("double_bass_pizz 1-6, double_bass_pizz 33-34") },
    { id: "offbeats", name: "Offbeat pizzicato", kind: "accompaniment", about: "Short chords on the swung 'and' of one and of three, never on the beat.", every: 2, spans: spans("pizz 3-8, pizz 17-20, pizz 33-39") },
    { id: "tings", name: "Tings", kind: "figuration", about: "Celesta thirds on the same offbeats, doing the pizzicato's job an octave or two up.", every: 2, spans: spans("celesta 13-16") },
    { id: "organ", name: "Organ chords", kind: "accompaniment", about: "Whole-note chords with no attack to speak of, one to the bar.", every: 4, spans: spans("organ 21-28") },
    { id: "tick", name: "Hat tiptoes", kind: "ostinato", about: "A quiet closed hat on two offbeats a bar.", every: 2, spans: spans("kit 29-30, kit 33-36") },
    { id: "spoon", name: "The spoon", kind: "figuration", about: "A clatter down the celesta, doubled on the snare: the dropped spoon.", spans: spans("celesta 31-31, kit 31-31") },
  ],
  ...chart(`
    tempo 1-44 Swing -- eighths written long and short, two to one
    tempo 32 Stop -- a bar of silence, the bass's last C sharp arriving only on beat 4
    key 1 F#m
    1 N.C. - -- the bass alone, its chromatic line implying no chord yet
    3 F#m i | 4 A#dim viio/iv -- on the walk: strictly, the bass has A sharp, the pizzicato C sharp and E, a rootless F#7 | 4.3 C#7 V7 -- D in the bass is a neighbour, and C sharp comes on beat 4
    5 F#m i | 6 A#dim viio/iv ? -- as bar 4, with the tune climbing chromatically through the chord | 6.3 C#7 V7
    7 Bm/D iv6 -- the F sharp and A in the bass are arpeggio, and the pizzicato keeps saying B minor
    8 C#7 V7 HC
    9 F#m i | 10 Bm iv
    11 G7 bII7 -- a Neapolitan with a seventh, the tritone substitute parked in front of the real dominant | 11.3 C#7 V7
    12 F#m i PAC
    13 F#m i | 14 A#dim viio/iv ? -- the pizzicato drops out, and only A sharp and C sharp in the celesta recall bar 6
    14.3 C#7 V7 ? -- no third here: the same harmony implied
    15 Bm/D iv6 | 16 C#7 V7 HC
    17 F#m i | 18 Bm iv | 19 G7 bII7 | 19.3 C#7 V7
    key 20 Gm enharmonic -- D7 is spelled as the German sixth of F sharp minor would be, and is instead the dominant of G minor
    20 D7 V7
    21 Gm i | 22 Cm iv | 23 Ab bII -- the Neapolitan again, in root position, a tritone from the dominant it goes to
    24 D7 V7 HC
    25 Gm i | 26 Eb VI | 27 D7 V7
    key 28 F#m chromatic -- the dominant simply slides down a semitone, and is the dominant of home
    28 C#7 V7
    31 N.C. - -- the spoon falls: a chromatic rattle over no harmony
    32.4 C#7 V7 ? -- only the bare bass note: the dominant is implied
    33 F#m i | 34 A#dim viio/iv ? -- as bar 6 | 34.3 C#7 V7
    35 Bm/D iv6 | 36 C#7 V7 HC
    37 F#m i | 38 Bm iv | 39 G7 bII7 | 39.3 C#7 V7
    40 F#m i PAC
    43 C#7 V7 ? -- a bare chromatic walk down from C sharp, heard as the dominant
    44 G bII | 44.3 F#m i
    44.3.5 F# I -- a Picardy third, in the celesta only: the A has barely stopped when the A sharp arrives
  `),
};
