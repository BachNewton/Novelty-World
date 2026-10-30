import { diatonic, invert, length, line, louder, midi, scale, seq, shift, stack, transpose, type Phrase } from "../formats/code";
import type { Score } from "../types";

// Porch Light Left On. A walk home in 6/8, Eb major, 44 bars.
//
// The whole piece grows from one gesture: a rising fourth that slips back a
// step (the head), and a small fall that stops short of the tonic (the tail).
// The head always sighs away from the tonic it has just reached. Only in the
// last bars does it reach Eb and stay.

const BAR = 3;
const EB = scale("Eb4", "major");
const G = scale("G4", "major");

const HEAD = line("Bb4:1 Eb5:.5 D5:1.5");
const TAIL = line("C5:.5 Bb4:.5 G4:.5 Ab4:1.5");

// The head, quickened into the gap while the lead holds a long note.
const REPLY = line("G4:.5 C5:.5 Bb4:.5", 0.5);

const step = (phrase: Phrase, degrees: number): Phrase => diatonic(phrase, degrees, EB);

function bar(n: number, phrase: Phrase): Phrase {
  return shift(phrase, (n - 1) * BAR);
}

// Eb major's third, sixth and seventh lowered: the cloud over the sun.
function shaded(phrase: Phrase): Phrase {
  const lowered = [midi("G4") % 12, midi("C5") % 12, midi("D5") % 12];
  return phrase.map((note) => (lowered.includes(note.pitch % 12) ? { ...note, pitch: note.pitch - 1 } : note));
}

const quickened = (degrees: number): Phrase => step(line("Bb4:.5 Eb5:.5 D5:.5"), degrees);

// The tail with its weight moved forward: long-short-short-long.
function leaning(tail: Phrase): Phrase {
  const [first, second, third, last] = tail;
  return [
    { ...first, duration: 1 },
    { ...second, start: first.start + 1 },
    { ...third, start: first.start + 1.5 },
    { ...last, start: first.start + 2, duration: 1 },
  ];
}

function stretched(phrase: Phrase, by: number): Phrase {
  return phrase.map((note) => ({ ...note, start: note.start * by, duration: note.duration * by }));
}

// One voicing per bar, low to high; "/" changes chord within the bar.
const HARMONY: readonly string[] = [
  // A: the first eight, ending open on the dominant.
  "Eb3 G3 Bb3 D4", // 1 Ebmaj7
  "Eb3 Ab3 C4 Eb4", // 2 Ab
  "Eb3 G3 Bb3 C4", // 3 Cm7
  "Eb3 F3 Ab3 C4", // 4 Fm7
  "Eb3 Ab3 C4 G4", // 5 Abmaj7
  "D3 G3 Bb3 F4", // 6 Gm7
  "Eb3 Ab3 C4 F4/Eb3 G3 C4 Eb4", // 7 Fm7, Cm
  "F3 Bb3 Eb4 F4/F3 Bb3 D4 F4", // 8 Bbsus, Bb
  // The second eight: the shadow of iv, then the climb to a full close.
  "Eb3 G3 Bb3 D4", // 9 Ebmaj7
  "Eb3 Ab3 Cb4 Eb4", // 10 Abm
  "Eb3 Ab3 C4 F4", // 11 Fm7
  "F3 Ab3 Bb3 D4", // 12 Bb7
  "F3 G3 B3 D4", // 13 G7/B
  "Eb3 G3 C4 Eb4", // 14 Cm
  "Eb3 Ab3 C4 F4/F3 Ab3 Bb3 D4", // 15 Fm7, Bb7
  "Eb3 G3 Bb3 Eb4/G3 G3 G4 G4", // 16 Eb, thinning to its third, the door to G
  // B: G major, a third away, the bass climbing by step.
  "G3 B3 D4", // 17 G
  "G3 C4 E4", // 18 Am7
  "G3 B3 D4", // 19 G/B
  "G3 C4 E4/A3 C4 Eb4", // 20 C, F7
  // The same four bars a minor third higher: Bb major, home's dominant.
  "Bb3 D4 F4", // 21 Bb
  "Bb3 Eb4 G4", // 22 Cm7
  "Bb3 D4 F4", // 23 Bb/D
  "Bb3 Eb4 G4/C4 Eb4 G4", // 24 Eb, Cm7
  "C4 Eb4 Ab4", // 25 Ab
  "Ab3 C4 Eb4", // 26 Fm7
  "F3 Bb3 Eb4 F4/F3 Bb3 D4 F4", // 27 Bbsus, Bb
  "F3 Ab3 Bb3 D4", // 28 Bb7
  // A changed: the answer that drooped now climbs.
  "Eb3 G3 Bb3 D4", // 29 Ebmaj7
  "Eb3 Ab3 C4 Eb4", // 30 Ab
  "D3 G3 Bb3 F4", // 31 Gm7/Bb
  "Eb3 G3 C4 Eb4", // 32 Cm
  "Eb3 Ab3 C4 F4", // 33 Fm7
  "Eb3 G3 Bb3 Eb4", // 34 Eb/G
  "Eb3 Ab3 C4 G4", // 35 Abmaj7
  "Eb3 Ab3 C4 F4", // 36 Fm7
  "Eb3 G3 Bb3 Eb4/F3 Ab3 Bb3 D4", // 37 Eb/Bb, Bb7
  "Eb3 Gb3 Cb4 Eb4", // 38 Cb: the lead lands on Eb, but the floor has moved
  "Eb3 Ab3 Cb4 Eb4", // 39 Abm/Cb
  "F3 Ab3 Bb3 Eb4/F3 Ab3 Bb3 D4", // 40 Bb7sus, Bb7
  // Coda over a tonic pedal: major iv, minor iv, home.
  "Eb3 Ab3 C4 Eb4", // 41 Ab/Eb
  "Eb3 Ab3 Cb4 Eb4", // 42 Abm/Eb
  "Eb3 G3 Bb3 Eb4", // 43 Eb
];

function chordsOf(n: number): string[][] {
  return HARMONY[n - 1].split("/").map((voicing) => voicing.split(" "));
}

// Six eighths broken across the bar's voicing(s), each ringing to its half
// bar's end so the figure blurs like a sustained hand.
function rolled(n: number, order: readonly number[], velocity: number): Phrase {
  const chords = chordsOf(n);
  const notes = order.map((voice, i) => {
    const half = i < 3 ? 0 : 1;
    const chord = chords[half] ?? chords[0];
    const start = i * 0.5;
    return { pitch: midi(chord[voice]), start, duration: Math.min(1, BAR - start), velocity: i === 0 ? velocity * 1.1 : velocity };
  });
  return bar(n, notes);
}

// Three plain quarters against the 6/8: the walk opens into a longer stride.
function pulsed(n: number, velocity: number): Phrase {
  const chords = chordsOf(n);
  return bar(n, [0, 1, 2].flatMap((beat) => {
    const chord = beat === 2 ? chords[chords.length - 1] : chords[0];
    return chord.map((name) => ({ pitch: midi(name), start: beat, duration: 0.9, velocity }));
  }));
}

function held(n: number, split: number, velocity: number): Phrase {
  const chords = chordsOf(n);
  const spans = chords.length === 1 ? [[0, BAR]] : [[0, split], [split, BAR - split]];
  return bar(n, chords.flatMap((chord, i) => [...new Set(chord.slice(-3))].map((name) => ({
    pitch: midi(name), start: spans[i][0], duration: spans[i][1], velocity,
  }))));
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function lead(): Phrase {
  const opening = seq(
    HEAD, TAIL,
    step(HEAD, -2), step(TAIL, -2), // the answer droops a third
    step(HEAD, 3), step(TAIL, 3), // then reaches past where it began
    line("C5:1 F5:.5 Eb5:.5 D5:.5 C5:.5"),
    line("Bb4:2"), 1,
  );
  const closing = seq(
    HEAD, shaded(TAIL), // the same words, and a cloud
    step(HEAD, 1), step(TAIL, 1),
    quickened(2), quickened(3), // the head at twice the speed: the walk picks up
    line("Eb5:1 D5:.5 C5:.5 Bb4:.5 C5:.5"),
    line("Ab5:1 G5:.5 F5:.5 D5:.5 Bb4:.5"),
    line("Eb5:2"), 1,
  );

  // B turns the head over and stretches it: falling fourth, rising step.
  const turned = seq(
    stretched(invert(line("D5:1 G5:.5"), midi("D5"), G), 2),
    line("B4:1 C5:1 E5:1"),
    line("D5:2 B4:1"),
    line("E5:1 G5:1"),
  );
  const firstFlight = seq(turned, line("F5:1"));
  const secondFlight = transpose(turned, 3);
  const summit = seq(line("Bb5:2 Ab5:1"), line("G5:1 Eb5:1 C5:1"));
  const descent = seq(step(TAIL, 3), TAIL);

  const returned = seq(
    HEAD, line("C5:.5 Bb4:.5 G4:.5 Bb4:1.5"),
    step(HEAD, 2), step(TAIL, 2), // the droop, reversed
    step(HEAD, 4), leaning(step(TAIL, 4)),
    step(HEAD, 5), leaning(step(TAIL, 5)), // bars 3 and 4, an octave up: the same words, now from above
    line("Bb5:1 G5:.5 F5:.5 D5:.5 Bb4:.5"),
    line("Eb5:3"), // the expected arrival, on the wrong floor
    shaded(TAIL),
    HEAD,
  );

  const coda = seq(
    stretched(line("C5:.5 Bb4:.5"), 3),
    stretched(line("G4:.5 Ab4:.5"), 3),
    line("Bb4:1 Eb5:5"), // the head again, and this time it stays
  );

  return stack(
    louder(opening, 0.92),
    bar(9, louder(closing, 1)),
    bar(17, louder(firstFlight, 0.95)),
    bar(21, louder(seq(secondFlight, line("C6:1")), 1.08)),
    bar(25, louder(seq(summit, descent), 1)),
    bar(29, louder(returned, 1.08)),
    bar(41, louder(coda, 0.85)),
  );
}

function keys(): Phrase {
  const walk = [0, 2, 3, 1, 3, 2];
  const climb = [0, 1, 2, 3, 2, 1];
  return stack(
    ...range(1, 8).map((n) => rolled(n, walk, 0.42)),
    ...range(9, 16).map((n) => rolled(n, walk, 0.46)),
    ...range(17, 26).map((n) => pulsed(n, n < 21 ? 0.36 : 0.42)),
    ...range(27, 28).map((n) => rolled(n, walk, 0.46)),
    ...range(29, 40).map((n) => rolled(n, climb, 0.5)),
    ...range(41, 42).map((n) => rolled(n, walk, 0.42)),
    bar(43, line("Eb3:.5 Bb3:.5 Eb4:.5 G4:1.5", 0.38)),
    bar(44, line("Eb3+Bb3+Eb4+G4:3", 0.34)),
  );
}

function echo(): Phrase {
  const gap = (n: number, phrase: Phrase): Phrase => bar(n, shift(phrase, 1.5));
  return stack(
    bar(8, shift(line("F4:.5 Ab4:.5", 0.5), 2)), // hands the line back to the lead
    gap(29, REPLY),
    gap(31, step(REPLY, 2)),
    gap(33, step(REPLY, 3)),
    gap(35, step(REPLY, 5)),
    gap(38, shaded(REPLY)),
    gap(40, step(REPLY, -1)),
  );
}

function bass(): Phrase {
  const roots = line("Eb2:3 Ab2:3 C3:3 F2:3 Ab2:3 G2:3 F2:1.5 C2:1.5 Bb1:3", 0.62);
  const rocking = line("Eb2:2 Bb2:1 Ab2:2 Eb2:1 F2:2 C3:1 Bb2:3 B2:3 C3:2 G2:1 F2:1.5 Bb1:1.5 Eb2:1.5 G2:1.5", 0.64);
  const rising = line("G2:3 A2:3 B2:3 C3:2 F2:1 Bb2:3 C3:3 D3:3 Eb3:2 C3:1 Ab2:3 F2:3 Bb2:3 Bb1:3", 0.62);
  const walking = line(
    "Eb2:1.5 F2:.5 G2:1 Ab2:1.5 C3:1.5 Bb2:1.5 D3:1.5 C3:1.5 G2:1.5 " +
      "F2:1.5 C3:1.5 G2:1.5 Bb2:1.5 Ab2:1.5 Eb3:1.5 F2:1.5 Ab2:1.5 " +
      "Bb2:3 Cb3:3 Ab2:3 Bb2:1.5 Bb1:1.5",
    0.66,
  );
  const pedal = line("Eb2:3 Eb2:3 Eb2:3 Eb2:3", 0.55);
  return seq(roots, rocking, rising, walking, pedal);
}

function pad(): Phrase {
  return stack(
    ...range(9, 16).map((n) => held(n, 1.5, 0.22)),
    ...range(17, 26).map((n) => held(n, 2, 0.3)),
    ...range(29, 43).map((n) => held(n, 1.5, n < 41 ? 0.3 : 0.24)),
    bar(44, line("Bb3+Eb4+G4:3", 0.2)),
  );
}

export function codeScore(): Score {
  const melody = lead();
  if (length(melody) !== 44 * BAR) throw new Error(`Code: the lead runs ${String(length(melody))} beats`);
  return {
    title: "Porch Light Left On",
    bpm: 92,
    metre: [6, 8],
    key: "Eb",
    tracks: [
      { name: "melody", role: "lead", notes: [...melody] },
      { name: "keys", role: "keys", notes: [...keys()] },
      { name: "echo", role: "keys", notes: [...echo()] },
      { name: "bass", role: "bass", notes: [...bass()] },
      { name: "pad", role: "pad", notes: [...pad()] },
    ],
  };
}
