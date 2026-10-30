import { barBeats, type Note, type Score, type Track } from "./types";

// A piece's analysis: the common language for talking about it. Bars are the
// address: "the second theme's return at bar 43" has to find one place, in the
// data, on the page and in the notes. `analysis-check.ts` holds all of it
// against the score.
//
// Bars count from 1. A beat counts from 1 in the metre's own unit and may be a
// fraction: 2.5 is the "and" of beat 2, in 4/4. A place is written bar.beat:
// 12.3 is bar 12, beat 3, 12.2.5 is the "and" of its beat 2, and 12 alone is its
// downbeat.

export type Transformation =
  | "literal"
  | "transposed"
  | "inverted"
  | "retrograde"
  | "augmented"
  | "diminished"
  | "fragmented"
  | "sequenced"
  | "varied";

export type Cadence = "PAC" | "IAC" | "HC" | "DC" | "PC";

export const CADENCE_NAMES: Record<Cadence, string> = {
  PAC: "Perfect authentic cadence",
  IAC: "Imperfect authentic cadence",
  HC: "Half cadence",
  DC: "Deceptive cadence",
  PC: "Plagal cadence",
};

export const TRANSFORMATION_MARKS: Record<Transformation, string> = {
  literal: "=",
  transposed: "T",
  inverted: "I",
  retrograde: "R",
  augmented: "×",
  diminished: "÷",
  fragmented: "…",
  sequenced: "»",
  varied: "~",
};

export interface Place {
  bar: number;
  // In the metre's unit, from 1.
  beat: number;
}

export interface Span {
  name: string;
  // Inclusive, in bars.
  bars: readonly [first: number, last: number];
  about?: string;
}

export interface Section extends Span {
  // Its letter in the form: A, A′, B, Coda.
  letter: string;
}

export interface Occurrence extends Place {
  track: string;
  // In the metre's unit.
  beats: number;
  as: Transformation;
  // In semitones, for a transposition or the first note of an inversion.
  by?: number;
  // A transposition within the key: intervals keep their step and may change
  // their quality.
  tonal?: boolean;
  // A sequence's period, in the metre's unit; a stretch's factor.
  every?: number;
  // Which notes of the track are the line, where the track is more than the line.
  voice?: "top" | "bottom" | "loud";
  about?: string;
}

export interface Theme {
  id: string;
  name: string;
  kind: "theme" | "motif";
  about: string;
  // The first is the statement: it must be literal, and it is what the rest
  // are held to.
  occurrences: Occurrence[];
}

export interface PatternSpan {
  track: string;
  bars: readonly [first: number, last: number];
}

export interface Pattern {
  id: string;
  name: string;
  kind: "ostinato" | "sequence" | "figuration" | "accompaniment" | "pedal";
  about: string;
  // An ostinato's period, in the metre's unit: its rhythm has to repeat.
  every?: number;
  spans: PatternSpan[];
}

export interface Chord extends Place {
  // As a lead sheet writes it, or N.C.
  symbol: string;
  // In the local key, or null where the harmony isn't functional.
  roman: string | null;
  cadence?: Cadence;
  // The reading is one of several, or the harmony is blurred; `about` says how.
  ambiguous?: boolean;
  about?: string;
}

export interface KeyArea extends Place {
  // A key as a score names it, Bb or Gm, or with a mode: D dorian.
  key: string;
  // How the music got here. Absent for the opening key.
  how?: "pivot" | "chromatic" | "direct" | "enharmonic" | "sequential" | "common-tone";
  about?: string;
}

export interface TempoMark {
  bars: readonly [first: number, last: number];
  // A tempo word, or what is happening: Allegro, rit., rubato, a tempo.
  mark: string;
  about?: string;
}

export interface Analysis {
  movements?: Span[];
  sections: Section[];
  themes: Theme[];
  patterns: Pattern[];
  keys: KeyArea[];
  chords: Chord[];
  tempo: TempoMark[];
}

const CADENCES = new Set<string>(["PAC", "IAC", "HC", "DC", "PC"]);

function parsePlace(text: string): Place {
  const [bar, beat, fraction] = text.split(".") as (string | undefined)[];
  const place = { bar: Number(bar), beat: Number(beat ?? 1) + Number(`0.${fraction ?? 0}`) };
  if (!Number.isInteger(place.bar) || Number.isNaN(place.beat)) throw new Error(`Analysis: not a place: "${text}"`);
  return place;
}

function entries(text: string): string[] {
  return text
    .split(/\n|\s\|\s/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function withNote(entry: string): { body: string[]; about?: string } {
  const cut = entry.indexOf(" -- ");
  const body = (cut < 0 ? entry : entry.slice(0, cut)).split(/\s+/);
  return cut < 0 ? { body } : { body, about: entry.slice(cut + 4).trim() };
}

function parseBars(text: string): readonly [number, number] {
  const [first, last] = text.split("-") as [string, string | undefined];
  const range = [Number(first), Number(last ?? first)] as const;
  if (range.some(Number.isNaN)) throw new Error(`Analysis: not a bar range: "${text}"`);
  return range;
}

// The harmony, as an analyst writes it down: one line or `|`-separated entry
// to a chord, with key changes and tempo marks where they fall.
//
//   key 5 G
//   5 G I | 6 Am ii | 7 D7 V7 HC
//   9.3 E7/G# V65/ii -- a note on this chord
//   10 Fmaj7 - ? -- a dash for a Roman numeral outside any function, ? for ambiguous
//   key 29 Bb pivot -- how it gets there
//   tempo 57-59 Cadenza
export function chart(text: string): Pick<Analysis, "chords" | "keys" | "tempo"> {
  const chords: Chord[] = [];
  const keys: KeyArea[] = [];
  const tempo: TempoMark[] = [];
  for (const entry of entries(text)) {
    const { body, about } = withNote(entry);
    const [first, ...rest] = body;
    if (first === "key") {
      const [placeText, ...words] = rest;
      const how = words.at(-1);
      const named = how === "pivot" || how === "chromatic" || how === "direct" || how === "enharmonic" || how === "sequential" || how === "common-tone";
      keys.push({ ...parsePlace(placeText), key: (named ? words.slice(0, -1) : words).join(" "), ...(named ? { how } : {}), ...(about === undefined ? {} : { about }) });
    } else if (first === "tempo") {
      const [barsText, ...words] = rest;
      tempo.push({ bars: parseBars(barsText), mark: words.join(" "), ...(about === undefined ? {} : { about }) });
    } else {
      const [symbol, roman, ...flags] = rest as [string, string | undefined, ...string[]];
      if (roman === undefined) throw new Error(`Analysis: a chord needs a symbol and a Roman numeral: "${entry}"`);
      const cadence = flags.find((flag) => CADENCES.has(flag)) as Cadence | undefined;
      const ambiguous = flags.includes("?");
      const unknown = flags.filter((flag) => !CADENCES.has(flag) && flag !== "?");
      if (unknown.length > 0) throw new Error(`Analysis: "${unknown.join(" ")}" in "${entry}"`);
      chords.push({
        ...parsePlace(first),
        symbol,
        roman: roman === "-" ? null : roman,
        ...(cadence === undefined ? {} : { cadence }),
        ...(ambiguous ? { ambiguous } : {}),
        ...(about === undefined ? {} : { about }),
      });
    }
  }
  return { chords, keys, tempo };
}

// One occurrence to an entry: bar.beat track beats how [options] [-- note].
//
//   5 clarinet 16 literal
//   49 clarinet 16 transposed +1
//   21 flute 8 transposed +7 tonal
//   33 right_hand 8 sequenced every=2 voice=loud
export function places(text: string): Occurrence[] {
  return entries(text).map((entry) => {
    const { body, about } = withNote(entry);
    const [placeText, track, beats, as, ...options] = body as [string, string, string, string | undefined, ...string[]];
    const place = parsePlace(placeText);
    if (as === undefined || !(as in TRANSFORMATION_MARKS)) throw new Error(`Analysis: not an occurrence: "${entry}"`);
    const occurrence: Occurrence = { ...place, track, beats: Number(beats), as: as as Transformation, ...(about === undefined ? {} : { about }) };
    for (const option of options) {
      if (/^[+-]\d+$/.test(option)) occurrence.by = Number(option);
      else if (option === "tonal") occurrence.tonal = true;
      else if (option.startsWith("every=")) occurrence.every = Number(option.slice(6));
      else if (option === "voice=top" || option === "voice=bottom" || option === "voice=loud") occurrence.voice = option.slice(6) as Occurrence["voice"];
      else throw new Error(`Analysis: "${option}" in "${entry}"`);
    }
    return occurrence;
  });
}

// `horns 21-28, flute 29-30`.
export function spans(text: string): PatternSpan[] {
  return text.split(",").map((part) => {
    const [track, bars] = part.trim().split(/\s+/);
    return { track, bars: parseBars(bars) };
  });
}

// Where a place is, in quarter-note beats from the start.
export function beatsAt(score: Score, { bar, beat }: Place): number {
  return (bar - 1) * barBeats(score) + ((beat - 1) * 4) / score.metre[1];
}

export function bars(score: Score): number {
  const end = Math.max(0, ...score.tracks.flatMap((track) => track.notes.map((note) => note.start + note.duration)));
  return Math.ceil(end / barBeats(score) - 1e-6);
}

function lineOf(notes: readonly Note[], pick: (group: Note[]) => Note): Note[] {
  const groups = new Map<number, Note[]>();
  for (const note of notes) groups.set(note.start, [...(groups.get(note.start) ?? []), note]);
  return [...groups.keys()].sort((a, b) => a - b).map((start) => pick(groups.get(start) ?? []));
}

const LOUD_BY = 8 / 127;

export function trackNamed(score: Score, name: string): Track {
  const track = score.tracks.find((candidate) => candidate.name === name);
  if (track === undefined) throw new Error(`Analysis: no track "${name}" in ${score.title}`);
  return track;
}

// The notes an occurrence is, by the score's own note objects: the written
// ones, so a performance's strays don't move them.
export function occurrenceNotes(score: Score, occurrence: Occurrence): Note[] {
  const from = beatsAt(score, occurrence);
  const to = from + (occurrence.beats * 4) / score.metre[1];
  const inside = trackNamed(score, occurrence.track).notes.filter((note) => note.start >= from - 1e-6 && note.start < to - 1e-6);
  if (occurrence.voice === "bottom") return lineOf(inside, (group) => group.reduce((low, note) => (note.pitch < low.pitch ? note : low)));
  if (occurrence.voice === "loud") {
    const top = Math.max(...inside.map((note) => note.velocity));
    const loud = inside.filter((note) => note.velocity >= top - LOUD_BY * 2);
    return lineOf(loud, (group) => group.reduce((high, note) => (note.pitch > high.pitch ? note : high)));
  }
  return lineOf(inside, (group) => group.reduce((high, note) => (note.pitch > high.pitch ? note : high)));
}

export function patternNotes(score: Score, pattern: Pattern): { track: string; note: Note }[] {
  const bar = barBeats(score);
  return pattern.spans.flatMap(({ track, bars: [first, last] }) =>
    trackNamed(score, track)
      .notes.filter((note) => note.start >= (first - 1) * bar - 1e-6 && note.start < last * bar - 1e-6)
      .map((note) => ({ track, note })),
  );
}

// The theory: chord symbols and Roman numerals both come down to a root and a
// set of pitch classes above it, so each can be held against the other.

const LETTER_CHROMA: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Intervals above the root, by what follows it in a chord symbol.
const QUALITIES: Record<string, readonly number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  "5": [0, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  mMaj7: [0, 3, 7, 11],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug7: [0, 4, 8, 10],
  "7sus4": [0, 5, 7, 10],
  "6sus2": [0, 2, 7, 9],
  "69": [0, 4, 7, 9, 2],
  "9": [0, 4, 7, 10, 2],
  m9: [0, 3, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  add9: [0, 4, 7, 2],
  madd9: [0, 3, 7, 2],
  "6/9": [0, 4, 7, 9, 2],
  "7b9": [0, 4, 7, 10, 1],
  "7#9": [0, 4, 7, 10, 3],
  "7#11": [0, 4, 7, 10, 6],
  "7b5": [0, 4, 6, 10],
  "7b13": [0, 4, 7, 10, 8],
  "11": [0, 4, 7, 10, 2, 5],
  m11: [0, 3, 7, 10, 2, 5],
  "13": [0, 4, 7, 10, 2, 9],
  // Augmented sixths, as the Roman numeral's chord spelled from its bass.
  Ger: [0, 4, 7, 10],
  It: [0, 4, 10],
  Fr: [0, 4, 6, 10],
};

export interface ChordTones {
  root: number;
  // Pitch classes, root first, in the order of stacking.
  tones: number[];
  // Null when it stands on its root.
  bass: number | null;
}

function chroma(letter: string, accidental: string): number {
  return (LETTER_CHROMA[letter] + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) + 12) % 12;
}

export function parseSymbol(symbol: string): ChordTones {
  // The last slash, for a bass: 6/9 has one of its own.
  const bassMatch = /\/([A-G])([#b]?)$/.exec(symbol);
  const head = bassMatch === null ? symbol : symbol.slice(0, bassMatch.index);
  const match = /^([A-G])([#b]?)(.*)$/.exec(head);
  if (match === null) throw new Error(`Analysis: not a chord: "${symbol}"`);
  const [, letter, accidental, quality] = match;
  const intervals = QUALITIES[quality] as readonly number[] | undefined;
  if (intervals === undefined) throw new Error(`Analysis: no such chord quality: "${symbol}"`);
  const root = chroma(letter, accidental);
  return { root, tones: intervals.map((interval) => (root + interval) % 12), bass: bassMatch === null ? null : chroma(bassMatch[1], bassMatch[2]) };
}

const SCALES: Record<string, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  in: [0, 1, 5, 7, 8, 0, 3],
};

export interface ParsedKey {
  tonic: number;
  scale: readonly number[];
  minor: boolean;
}

export function parseKeyName(name: string): ParsedKey {
  const [tonic, mode] = name.split(" ") as [string, string | undefined];
  const match = /^([A-G])([#b]?)(m?)$/.exec(tonic);
  if (match === null) throw new Error(`Analysis: not a key: "${name}"`);
  const [, letter, accidental, minorMark] = match;
  const scale = mode === undefined ? undefined : (SCALES[mode] as readonly number[] | undefined);
  if (mode !== undefined && scale === undefined) throw new Error(`Analysis: no such mode: "${name}"`);
  const minor = minorMark === "m" || (scale !== undefined && scale[2] === 3);
  return { tonic: chroma(letter, accidental), scale: scale ?? (minor ? SCALES.minor : SCALES.major), minor };
}

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

// The tone in the bass, by the figure, as a share of the stack.
const INVERSIONS: Record<string, number> = { "6": 1, "64": 2, "65": 1, "43": 2, "42": 3 };

export interface RomanReading extends ChordTones {
  degree: number;
  // The key it is read in, after any "/": V7/ii is read in ii.
  tonicised: boolean;
  // A figure's bass, by its stack position; null in root position.
  inversion: number | null;
}

interface RomanHead {
  degree: number;
  upper: boolean;
  alter: number;
  rest: string;
}

function romanHead(text: string): RomanHead {
  const match = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(text);
  if (match === null) throw new Error(`Analysis: not a Roman numeral: "${text}"`);
  const [, accidental, numeral, rest] = match;
  return { degree: NUMERALS.indexOf(numeral.toUpperCase()), upper: numeral === numeral.toUpperCase(), alter: accidental === "b" ? -1 : accidental === "#" ? 1 : 0, rest };
}

// In a minor key vii° stands on the raised seventh, as it is heard.
function degreeRoot(head: RomanHead, key: ParsedKey): number {
  const raised = key.minor && head.degree === 6 && !head.upper;
  return (key.tonic + key.scale[head.degree] + head.alter + (raised ? 1 : 0) + 12) % 12;
}

function quality(upper: boolean, written: string): string {
  if (written === "") return upper ? "" : "m";
  if (written === "o") return "dim";
  if (written === "o7") return "dim7";
  if (written === "ø7") return "m7b5";
  if (written === "+") return "aug";
  if (written === "+7") return "aug7";
  if (written === "5") return "5";
  if (!upper && !written.startsWith("m") && `m${written}` in QUALITIES) return `m${written}`;
  return written;
}

const AUGMENTED_SIXTHS: Record<string, string> = { "It+6": "It", "Fr+6": "Fr", "Ger+6": "Ger" };

// Lead-sheet Roman numerals: the case gives the triad, and what follows reads
// as in a chord symbol, so V7 and IV7 are dominant sevenths, and Imaj7 is a
// major seventh. Figures give the bass: V65, I6, ii43, I64. Secondary chords
// read in their own key: V7/ii, viio7/V. N6 is the Neapolitan sixth; It+6, Fr+6
// and Ger+6 the augmented sixths, on the lowered sixth of the key.
export function parseRoman(roman: string, keyName: string): RomanReading {
  const key = parseKeyName(keyName);
  const pedal = roman.endsWith("(ped)");
  const text = pedal ? roman.slice(0, -5) : roman;
  const slash = text.indexOf("/");
  if (slash >= 0) {
    const target = romanHead(text.slice(slash + 1));
    const local = degreeRoot(target, key);
    const names = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    return { ...parseRoman(text.slice(0, slash), `${names[local]}${target.upper ? "" : "m"}`), tonicised: true };
  }
  if (text in AUGMENTED_SIXTHS) {
    const root = (key.tonic + 8) % 12;
    const tones = QUALITIES[AUGMENTED_SIXTHS[text]].map((interval) => (root + interval) % 12);
    return { degree: 5, root, tones, bass: null, tonicised: false, inversion: null };
  }
  if (text === "N6") {
    const root = (key.tonic + 1) % 12;
    return { degree: 1, root, tones: [root, (root + 4) % 12, (root + 7) % 12], bass: null, tonicised: false, inversion: 1 };
  }
  const head = romanHead(text);
  const figure = /(64|65|43|42|6)$/.exec(head.rest)?.[1];
  const written = figure === undefined || head.rest === "6" ? head.rest : head.rest.slice(0, -figure.length);
  const isSeventh = figure === "65" || figure === "43" || figure === "42";
  const base = head.rest === "6" ? "" : written;
  const name = quality(head.upper, isSeventh ? `${base}7`.replace("77", "7") : base);
  const intervals = QUALITIES[name] as readonly number[] | undefined;
  if (intervals === undefined) throw new Error(`Analysis: no such chord: "${roman}" (${name})`);
  const root = degreeRoot(head, key);
  return {
    degree: head.degree,
    root,
    tones: intervals.map((interval) => (root + interval) % 12),
    bass: null,
    tonicised: false,
    inversion: figure === undefined ? null : INVERSIONS[figure],
  };
}

export function keyAt(analysis: Pick<Analysis, "keys">, score: Score, beats: number): KeyArea {
  let found = analysis.keys[0];
  for (const area of analysis.keys) if (beatsAt(score, area) <= beats + 1e-6) found = area;
  return found;
}

// Text as it is printed: flats and sharps as music writes them.
export function printed(text: string): string {
  return text
    .replace(/(?<=[A-G])b/g, "♭")
    .replace(/(?<=[A-G])#/g, "♯")
    .replace(/^b(?=[IViv])/, "♭")
    .replace(/^#(?=[IViv])/, "♯")
    .replace(/(?<=\/)b(?=[IViv])/, "♭")
    .replace(/o(?=7|$|\/)/g, "°")
    .replace(/maj7/g, "Δ7")
    .replace(/m7b5/g, "ø7")
    .replace(/dim7/g, "°7")
    .replace(/dim$/, "°");
}

// A note's address in the written score, the same from every view.
export function noteKey(track: string, start: number, pitch: number): string {
  return `${track}:${String(Math.round(start * 960))}:${String(pitch)}`;
}

// The palette's size: track, section and theme colours are all `--color-composer-N`.
export const TONES = 16;

export function toneVar(tone: number): string {
  return `--color-composer-${String(((tone - 1) % TONES) + 1)}`;
}

export interface FeatureSpan {
  // In quarter-note beats.
  from: number;
  to: number;
  bar: number;
  // What it is at a glance: T+1, I, …
  mark: string;
  about: string;
}

// A theme or a pattern, reduced to what the views light up.
export interface Feature {
  id: string;
  name: string;
  kind: Theme["kind"] | "pattern";
  about: string;
  tone: number;
  spans: FeatureSpan[];
  notes: Set<string>;
}

function occurrenceMark({ as, by, every }: Occurrence): string {
  if (by !== undefined && as === "transposed") return `T${by > 0 ? "+" : ""}${String(by)}`;
  if ((as === "augmented" || as === "diminished") && every !== undefined) return `${TRANSFORMATION_MARKS[as]}${String(every)}`;
  return TRANSFORMATION_MARKS[as];
}

export function featuresOf(score: Score, analysis: Analysis): Feature[] {
  const unit = 4 / score.metre[1];
  const bar = barBeats(score);
  const themes = analysis.themes.map((theme, index): Feature => ({
    id: theme.id,
    name: theme.name,
    kind: theme.kind,
    about: theme.about,
    tone: index + 1,
    spans: theme.occurrences.map((occurrence) => {
      const from = beatsAt(score, occurrence);
      const word = occurrence.as + (occurrence.by === undefined ? "" : ` ${occurrence.by > 0 ? "+" : ""}${String(occurrence.by)}`);
      const about = `Bar ${String(occurrence.bar)}, beat ${String(occurrence.beat)}, ${occurrence.track}: ${word}${occurrence.about === undefined ? "" : `. ${occurrence.about}`}`;
      return { from, to: from + occurrence.beats * unit, bar: occurrence.bar, mark: occurrenceMark(occurrence), about };
    }),
    notes: new Set(theme.occurrences.flatMap((occurrence) => occurrenceNotes(score, occurrence).map((note) => noteKey(occurrence.track, note.start, note.pitch)))),
  }));
  const patterns = analysis.patterns.map((pattern, index): Feature => ({
    id: pattern.id,
    name: pattern.name,
    kind: "pattern",
    about: `${pattern.kind}: ${pattern.about}`,
    tone: analysis.themes.length + index + 1,
    spans: pattern.spans.map(({ track, bars: [first, last] }) => ({
      from: (first - 1) * bar,
      to: last * bar,
      bar: first,
      mark: "",
      about: `Bars ${String(first)} to ${String(last)}, ${track}`,
    })),
    notes: new Set(patternNotes(score, pattern).map(({ track, note }) => noteKey(track, note.start, note.pitch))),
  }));
  return [...themes, ...patterns];
}
