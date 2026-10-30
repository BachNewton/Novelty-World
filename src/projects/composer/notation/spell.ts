import { barBeats, type Note, type Score } from "../types";

// Pitch spelling on the line of fifths: a MIDI note says only which key on the
// piano, and a musician reads A# and Bb differently. Each pitch class falls at
// every twelfth place on the line (C at 0, G at 1, F# at 6, Gb at -6), so to
// spell a note is to choose a place. The key sets where on the line the music
// lives, a moving centre follows the harmony, and a chromatic step is spelled
// as the step it is. Keys come from the notes, so a modulation is followed.

export interface Spelled {
  // Index into C D E F G A B.
  letter: number;
  // In semitones: -1 is a flat.
  alter: number;
  octave: number;
}

export interface Key {
  // On the line of fifths, as `fifths`: A major's tonic is 3.
  tonic: number;
  minor: boolean;
  // Sharps in the key signature, or flats, negative.
  fifths: number;
}

const LETTER_ON_LINE = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B, as letter indices
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const LETTER_FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };

// Krumhansl and Kessler's profiles: how much a key's listeners feel each degree.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// What it costs, in bars of clear evidence, to leave a key.
const KEY_CHANGE = 2.4;
const RELATIVE_CHANGE = 0.4;

const SPELL_PULL_TO_KEY = 0.15;
const SPELL_CENTRE_MOVE = 0.5;
const MAX_FROM_KEY = 8;

export function parseKey(name: string): Key {
  const match = /^([A-G])([#b]?)(m?)$/.exec(name);
  if (match === null) throw new Error(`Notation: not a key: "${name}"`);
  const [, letter, accidental, mode] = match;
  const tonic = LETTER_FIFTHS[letter] + (accidental === "#" ? 7 : accidental === "b" ? -7 : 0);
  const minor = mode === "m";
  return { tonic, minor, fifths: minor ? tonic - 3 : tonic };
}

// The place on the line a key's music centres on. A minor key reaches for its
// raised sixth and seventh, so sits nearer its tonic than the signature says.
function keyCentre({ tonic, minor }: Key): number {
  return tonic + (minor ? 0.5 : 2);
}

function chromaAt(place: number): number {
  return (((place * 7) % 12) + 12) % 12;
}

// The twelve-wide stretch of the line around a centre holds each pitch class once.
function placeNear(pitch: number, centre: number): number {
  const chroma = ((pitch % 12) + 12) % 12;
  const onLine = chromaAt(chroma); // 7 is its own inverse mod 12
  return onLine + 12 * Math.round((centre - onLine) / 12);
}

export function spellAt(pitch: number, place: number): Spelled {
  const index = ((place + 1) % 7 + 7) % 7;
  const letter = LETTER_ON_LINE[index];
  const alter = Math.floor((place + 1) / 7);
  return { letter, alter, octave: Math.round((pitch - NATURAL[letter] - alter) / 12) - 1 };
}

function allKeys(): Key[] {
  const keys: Key[] = [];
  for (let fifths = -5; fifths <= 6; fifths++) {
    keys.push({ tonic: fifths, minor: false, fifths });
    keys.push({ tonic: fifths + 3, minor: true, fifths });
  }
  return keys;
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const [ma, mb] = [mean(a), mean(b)];
  let [ab, aa, bb] = [0, 0, 0];
  a.forEach((value, index) => {
    ab += (value - ma) * (b[index] - mb);
    aa += (value - ma) ** 2;
    bb += (b[index] - mb) ** 2;
  });
  return aa === 0 || bb === 0 ? 0 : ab / Math.sqrt(aa * bb);
}

function fits(key: Key, chroma: readonly number[]): number {
  const profile = key.minor ? MINOR_PROFILE : MAJOR_PROFILE;
  const tonic = chromaAt(key.tonic);
  return correlation(chroma, profile.map((_, degree) => profile[(degree - tonic + 12) % 12]));
}

function sameKey(a: Key, b: Key): boolean {
  return a.tonic === b.tonic && a.minor === b.minor;
}

// The key of every bar: the path that fits the notes best for the fewest
// changes, starting from the key the piece declares.
export function detectKeys(score: Score, bars: number): Key[] {
  const declared = parseKey(score.key);
  const bar = barBeats(score);
  const chroma = Array.from({ length: bars }, () => Array<number>(12).fill(0));
  for (const track of score.tracks) {
    if (track.role === "drums") continue;
    for (const note of track.notes) {
      const index = Math.min(bars - 1, Math.floor(note.start / bar));
      chroma[index][((note.pitch % 12) + 12) % 12] += Math.min(note.duration, bar);
    }
  }
  // Three bars heard together: one bar of a passing chord is not a key.
  const heard = chroma.map((_, index) =>
    Array.from({ length: 12 }, (__, degree) => [-1, 0, 1].reduce((sum, offset) => sum + (chroma.at(index + offset < 0 ? 0 : Math.min(bars - 1, index + offset))?.[degree] ?? 0), 0)),
  );
  const keys = allKeys();
  if (!keys.some((key) => sameKey(key, declared))) keys.push(declared);
  const change = (from: Key, to: Key): number => (sameKey(from, to) ? 0 : from.fifths === to.fifths ? RELATIVE_CHANGE : KEY_CHANGE);

  let best = keys.map((key) => (sameKey(key, declared) ? 0 : change(declared, key)));
  const back: number[][] = [];
  for (const window of heard) {
    const fit = keys.map((key) => fits(key, window));
    const steps = keys.map((key) => {
      let from = 0;
      let lowest = Infinity;
      keys.forEach((previous, index) => {
        const cost = best[index] + change(previous, key);
        if (cost < lowest) [lowest, from] = [cost, index];
      });
      return { lowest, from };
    });
    back.push(steps.map((step) => step.from));
    best = steps.map((step, index) => step.lowest - fit[index]);
  }
  let at = best.indexOf(Math.min(...best));
  const path = Array<Key>(bars);
  for (let index = bars - 1; index >= 0; index--) {
    path[index] = keys[at];
    at = back[index][at];
  }
  return path;
}

interface Sounded {
  note: Note;
  segment: number;
  bar: number;
}

function diatonic(chroma: number, key: Key): boolean {
  const degree = (chroma - chromaAt(key.tonic) + 12) % 12;
  return (key.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).includes(degree);
}

// A place on the line for each note of the piece: the centre that keeps each
// beat's notes closest together, drifts least, and stays near the key.
function centres(sounded: readonly Sounded[], keys: readonly Key[], segments: number, barOfSegment: (segment: number) => number): number[] {
  const states = Array.from({ length: 30 }, (_, index) => index - 12.5);
  const bySegment = Array.from({ length: segments }, () => [] as Sounded[]);
  for (const entry of sounded) bySegment[entry.segment].push(entry);
  let best = states.map(() => 0);
  const back: number[][] = [];
  bySegment.forEach((entries, segment) => {
    const key = keyCentre(keys[barOfSegment(segment)]);
    const costs = states.map((state) => {
      let [cost, weight] = [0, 0];
      for (const { note } of entries) {
        const length = Math.min(note.duration, 2);
        cost += length * (placeNear(note.pitch, state) - state) ** 2;
        weight += length;
      }
      return (weight === 0 ? 0 : cost / weight) + SPELL_PULL_TO_KEY * (state - key) ** 2;
    });
    const steps = states.map((state) => {
      let from = 0;
      let lowest = Infinity;
      states.forEach((previous, index) => {
        const cost = best[index] + SPELL_CENTRE_MOVE * Math.abs(previous - state);
        if (cost < lowest) [lowest, from] = [cost, index];
      });
      return { lowest, from };
    });
    back.push(steps.map((step) => step.from));
    best = steps.map((step, index) => step.lowest + costs[index]);
  });
  let at = best.indexOf(Math.min(...best));
  const path = Array<number>(segments);
  for (let segment = segments - 1; segment >= 0; segment--) {
    path[segment] = states[at];
    at = back[segment][at];
  }
  return path;
}

// A key can follow its harmony far along the line, but past these a spelling
// is correct and unreadable: a double sharp, or B# in G. The same note twelve
// places back reads better.
function readable(place: number, key: Key): number {
  const centre = keyCentre(key);
  if (place - centre > MAX_FROM_KEY) return readable(place - 12, key);
  if (centre - place > MAX_FROM_KEY) return readable(place + 12, key);
  const { alter } = spellAt(0, place);
  if (Math.abs(alter) < 2) return place;
  return place + (alter > 0 ? -12 : 12);
}

// Every note's spelling, by the note: the score's own objects are the keys.
export function spellScore(score: Score, keys: readonly Key[]): Map<Note, Spelled> {
  const bar = barBeats(score);
  const segmentBeats = 1;
  const pitched = score.tracks.filter((track) => track.role !== "drums");
  const sounded = pitched.flatMap((track) =>
    track.notes.map((note) => ({
      note,
      segment: Math.floor(note.start / segmentBeats),
      bar: Math.min(keys.length - 1, Math.floor(note.start / bar)),
    })),
  );
  const segments = Math.max(0, ...sounded.map((entry) => entry.segment)) + 1;
  const path = centres(sounded, keys, segments, (segment) => Math.min(keys.length - 1, Math.floor((segment * segmentBeats) / bar)));
  const keyIndex = (note: Note): number => Math.min(keys.length - 1, Math.floor(note.start / bar));
  const places = new Map<Note, number>();
  for (const { note, segment } of sounded) places.set(note, placeNear(note.pitch, path[segment]));

  // A chromatic note walks by step: C# rises to D, Db falls to C. Walking each
  // line backwards lets a run of them lean on the note each resolves to.
  for (const track of pitched) {
    const line = [...track.notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    for (let index = line.length - 2; index >= 0; index--) {
      const [note, next] = [line[index], line[index + 1]];
      const step = next.pitch - note.pitch;
      if (Math.abs(step) !== 1) continue;
      const key = keys[keyIndex(note)];
      if (diatonic(((note.pitch % 12) + 12) % 12, key)) continue;
      const place = (places.get(next) ?? 0) + (step > 0 ? 5 : -5);
      // Past a sharp or flat the step costs more reading than it explains.
      if (Math.abs(spellAt(note.pitch, place).alter) <= 1) places.set(note, place);
    }
  }
  return new Map([...places].map(([note, place]) => [note, spellAt(note.pitch, readable(place, keys[keyIndex(note)]))]));
}
