import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  sections: [
    { name: "Town tune", letter: "A", bars: [1, 8], about: "Eight bars in F, seventh chords spelled across three channels, with a quiet tick and no backbeat yet." },
    { name: "Climb", letter: "A′", bars: [9, 16], about: "The drums come in and the tune hops in dotted rhythm, climbing to high F and stopping on A7." },
    { name: "Shrine", letter: "B", bars: [17, 24], about: "Four bars of D phrygian, close to the Japanese in scale, with the bell's falling figure, then four bars back through B flat and C." },
    { name: "Town tune in thirds", letter: "A″", bars: [25, 32], about: "The tune with pulse two a third below and a bass walking up its chords. Three notes at the end lead straight back to bar 1: the piece loops." },
  ],
  themes: [
    {
      id: "town",
      name: "Town tune",
      kind: "theme",
      about: "Up a fifth and a little further, then gently down, and the same again a step higher: a phrase that keeps looking up the hill.",
      occurrences: places(`
        1 pulse_1 16 literal
        25 pulse_1 16 literal -- two bars of ornaments aside, the tune again
        25 pulse_2 16 varied -3 -- a third below, in step with it
      `),
    },
    {
      id: "uphill",
      name: "Uphill",
      kind: "motif",
      about: "One bar: a fifth up, a step or two more, and a turn back. The piece's fingerprint.",
      occurrences: places(`
        1 pulse_1 4 literal
        3 pulse_1 4 transposed +2 tonal
        4.4 pulse_1 4 transposed +2 tonal -- hidden across the barline, from the end of bar 4 into bar 5
        25 pulse_1 4 literal
        25 pulse_2 4 transposed -3 tonal
        27 pulse_1 4 transposed +2 tonal
        27 pulse_2 4 transposed -2 tonal
        28.4 pulse_1 4 transposed +2 tonal
      `),
    },
    {
      id: "hop",
      name: "Hop",
      kind: "motif",
      about: "The same climb with a dotted skip in it, and a little flick at the top.",
      occurrences: places(`
        9 pulse_1 4 literal
        11 pulse_1 4 transposed +2 tonal
      `),
    },
    {
      id: "shrine",
      name: "Shrine tune",
      kind: "theme",
      about: "A phrase hanging on the semitones A to B flat and D to E flat: slow, even, and far from the town.",
      occurrences: places(`
        17 pulse_1 8 literal
      `),
    },
    {
      id: "bell",
      name: "Temple bell",
      kind: "motif",
      about: "A quick falling figure down a D minor chord, ending on a held A: the bell at the shrine.",
      occurrences: places(`
        17.3 pulse_2 2 literal
        19.3 pulse_2 2 literal
      `),
    },
    {
      id: "pickup",
      name: "Way back",
      kind: "motif",
      about: "Three rising eighths from G to B flat, leading to the C that opens the tune.",
      occurrences: places(`
        8.3.5 pulse_1 1.5 literal
        32.3.5 pulse_1 1.5 literal -- this time into the loop
      `),
    },
  ],
  patterns: [
    { id: "broken", name: "Broken chords", kind: "figuration", about: "Pulse two in eighths, up and down the chord, spelling out what one channel can't hold.", every: 4, spans: spans("pulse_2 5-7, pulse_2 21-24") },
    { id: "held", name: "Held tones", kind: "accompaniment", about: "Long notes in pulse two: a third or a seventh of the chord, one or two to the bar.", spans: spans("pulse_2 9-16") },
    { id: "ballad", name: "Slow bass", kind: "accompaniment", about: "A long root and a pick-up to the next, three beats and one.", every: 4, spans: spans("wave 1-3, wave 5-6") },
    { id: "lilt", name: "Dotted bass", kind: "ostinato", about: "Root and fifth, each with a dotted lilt, every half bar.", every: 2, spans: spans("wave 9-15") },
    { id: "bellbass", name: "Shrine drone", kind: "pedal", about: "D and E flat, a semitone apart, held for whole bars while the bell rings.", spans: spans("wave 17-19") },
    { id: "arpbass", name: "Walking arpeggios", kind: "accompaniment", about: "Quarters up each seventh chord, the wave channel at its most tuneful.", every: 1, spans: spans("wave 25-30") },
    { id: "tick", name: "Noise tick", kind: "ostinato", about: "A soft hat on two and four, and nothing else.", every: 2, spans: spans("noise 1-7") },
    { id: "beat", name: "Kick and snare", kind: "ostinato", about: "A full light beat, turning over every half bar.", every: 2, spans: spans("noise 9-15") },
    { id: "busybeat", name: "Busier beat", kind: "ostinato", about: "The same with eighths on the hat, and a two-bar shape.", every: 8, spans: spans("noise 25-31") },
  ],
  ...chart(`
    tempo 1-32 Andante
    key 1 F
    1 Fmaj7 Imaj7 | 2 Am7 iii7 | 3 Bbmaj7 IVmaj7 | 4 F I | 4.3 Gm7 ii7
    5 Dm7 vi7 | 6 Gm7 ii7 | 7 Bbmaj7 IVmaj7 | 7.3 C7 V7 | 8 F I PAC
    9 F I | 10 Am7 iii7 | 11 Bbmaj7 IVmaj7 | 12 Am7 iii7 | 12.3 Dm vi
    13 Bb IV | 14 Gm7 ii7 | 15 Am7 iii7
    key 16 D phrygian pivot -- A minor turns major: A7 is V7/vi in F, and the shrine takes it as its own dominant, though the chord's C sharp is outside the mode
    16 A7 V7 HC
    17 Dm i | 18 Ebmaj7 IImaj7 -- the flat second, the sound of the shrine | 19 Dm i | 20 Gm iv
    key 21 F pivot -- G minor, iv here, is ii in F, and the town comes back
    21 Bbmaj7 IVmaj7 | 22 C7sus4 V7sus4 | 23 Bb IV | 24 C7 V7 HC
    25 Fmaj7 Imaj7 | 26 Am7 iii7 | 27 Bbmaj7 IVmaj7 | 28 F I | 28.3 Gm7 ii7
    29 Dm7 vi7 | 30 Bbmaj7 IVmaj7 | 31 Gm ii | 31.3 C7 V7 | 32 F I PAC
  `),
};
