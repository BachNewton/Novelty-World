import { chart, places, spans, type Analysis } from "../analysis";

export const ANALYSIS: Analysis = {
  sections: [
    { name: "Ridge tune", letter: "A", bars: [1, 8], about: "Eight bars in A over broken eighths, ending open on the dominant with a snare fill." },
    { name: "Ridge tune, going home", letter: "A′", bars: [9, 16], about: "The same start with a pushier bass and offbeat keys. Its second half stays up high and comes home." },
    { name: "Open sky", letter: "B", bars: [17, 24], about: "Long notes over a stepwise falling bass with the tune low in pulse two, then both pulses in thirds through G, D, F and G, and a run up." },
    { name: "Ridge tune high", letter: "A″", bars: [25, 32], about: "The head an octave up over sixteenth arpeggios, then a new ending that climbs to a full close." },
    { name: "Tag", letter: "Tag", bars: [33, 36], about: "Chord-tone figures turn on to E, and the piece runs straight back to bar 1: it loops." },
  ],
  themes: [
    {
      id: "head",
      name: "Pinwheel head",
      kind: "theme",
      about: "A dotted leap up to the tonic, a little turn around it, and the answer on the dominant.",
      occurrences: places(`
        1 pulse_1 8 literal
        3 pulse_1 8 varied +5 -- up a fourth over IV and I
        9 pulse_1 8 literal
        11 pulse_1 8 varied +5 -- the end of its first bar reaches higher
        25.2 pulse_1 7 fragmented -- up the octave, with the opening leap changed to a bounce on A
        27 pulse_1 8 varied +5
      `),
    },
    {
      id: "over",
      name: "Over the top",
      kind: "theme",
      about: "The first eight's second half: down from C sharp through the minor chords, a run down the scale, and the half close.",
      occurrences: places(`
        5 pulse_1 16 literal
      `),
    },
    {
      id: "home",
      name: "Home stretch",
      kind: "theme",
      about: "The second eight's answer: three falling turns that close on the tonic.",
      occurrences: places(`
        13 pulse_1 16 literal
      `),
    },
    {
      id: "vane",
      name: "Vane",
      kind: "motif",
      about: "A dotted eighth, a sixteenth and a long note, up a triad: or flipped, down one.",
      occurrences: places(`
        1 pulse_1 2 literal
        3 pulse_1 2 transposed +5
        5 pulse_1 2 inverted +12
        6 pulse_1 2 inverted +13
        9 pulse_1 2 literal
        11 pulse_1 2 transposed +5
        27 pulse_1 2 transposed +5
      `),
    },
    {
      id: "sky",
      name: "Sky tune",
      kind: "theme",
      about: "Pulse two's low arpeggio climbing an octave, under the long notes above.",
      occurrences: places(`
        17.1.5 pulse_2 8 literal
        19.1.5 pulse_2 8 varied +2 -- a step higher, in the minor
      `),
    },
    {
      id: "gale",
      name: "Gale",
      kind: "theme",
      about: "Both pulses in thirds, down a triad and back with a neighbour at the top.",
      occurrences: places(`
        21 pulse_1 8 literal
        21 pulse_2 8 transposed -3 tonal
        23 pulse_1 4 transposed -2
        23 pulse_2 4 transposed -5 tonal
      `),
    },
    {
      id: "tag",
      name: "Tag figure",
      kind: "motif",
      about: "Eighths down and up a chord with a gap in them, the wind dropping before the loop.",
      occurrences: places(`
        33 pulse_1 4 literal
        34 pulse_1 4 varied +2
      `),
    },
  ],
  patterns: [
    { id: "broken", name: "Broken eighths", kind: "figuration", about: "Pulse two up and down each chord in eighths.", every: 4, spans: spans("pulse_2 1-7") },
    { id: "offbeat", name: "Offbeat keys", kind: "accompaniment", about: "One short note on every 'and', pulse two as a rhythm guitar.", every: 1, spans: spans("pulse_2 9-12") },
    { id: "arp16", name: "Sixteenth arpeggios", kind: "figuration", about: "Pulse two running in fours through the chord.", every: 1, spans: spans("pulse_2 25-28") },
    { id: "rootfifth", name: "Root and fifth", kind: "accompaniment", about: "Quarters in the wave channel, walking the chord.", every: 1, spans: spans("wave 1-7") },
    { id: "bounce", name: "Octave bounce", kind: "ostinato", about: "Eighths leaping an octave, the classic route-theme bass.", every: 1, spans: spans("wave 9-15") },
    { id: "falling", name: "Falling bass", kind: "sequence", about: "D, C sharp, B, A, one a bar, then on down through G, F sharp and F before turning up to G.", every: 4, spans: spans("wave 17-20") },
    { id: "arpbass", name: "Climbing bass", kind: "accompaniment", about: "Quarters along each chord, a chord tone a beat.", every: 1, spans: spans("wave 25-30") },
    { id: "beat", name: "Route beat", kind: "ostinato", about: "Hats in eighths and a snare on two and four.", every: 2, spans: spans("noise 1-7, noise 9-15, noise 25-31") },
    { id: "run", name: "Scale run", kind: "figuration", about: "Sixteenths up to the high A that opens the last verse, with the snare under each one.", spans: spans("pulse_1 24-24, noise 24-24") },
  ],
  ...chart(`
    tempo 1-36 Allegro
    key 1 A
    1 A I | 2 E V | 3 D IV | 4 A I
    5 F#m vi | 6 Bm ii | 7 Bm ii | 7.3 E V | 8 E V HC
    9 A I | 10 E V | 11 D IV | 12 A I
    13 D IV | 14 E/G# V6 | 15 A I | 15.3 D IV
    16 E/G# V6 | 16.3 A I IAC -- the tune reaches the tonic, but with the leading tone in the bass, so imperfect
    17 D IV | 18 A/C# I6 | 19 Bm ii | 20 F#m/A vi6
    21 G bVII -- the flat seventh, from the mixolydian side of A | 22 D/F# IV6 | 23 F bVI | 24 G bVII
    25 A I -- flat six, flat seven, one: a fanfare, not a classical cadence | 26 E V | 27 D IV | 28 A I
    29 F#m vi | 30 Bm ii | 31 D IV | 31.3 E V | 32 A I PAC
    33 A I | 34 D IV | 35 Bm ii | 35.3 E/G# V6 | 36 E V HC
  `),
};
