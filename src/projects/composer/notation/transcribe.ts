import { allPedals } from "../tempo";
import type { Role, Score, TempoPoint, Track } from "../types";
import { metreOf, splitNote, splitRest, TICKS_PER_QUARTER, valueOf, type Metre, type Span, type Value } from "./metre";
import { placeTrack, swingOf, type Placed } from "./quantise";
import { detectKeys, spellScore, type Key, type Spelled } from "./spell";

// A score as notation: what every bar of every staff says, voice by voice, in
// written values. MIDI has none of this; it is worked out here, purely, and
// `mei.ts` writes the result down for Verovio to engrave.

export type Clef = "treble" | "treble8" | "bass" | "bass8" | "percussion";

export type Tie = "i" | "m" | "t";

export interface WrittenNote {
  // The score's note it writes down, for finding it again by where it is.
  source: { start: number; pitch: number };
  spelled: Spelled;
  tie: Tie | null;
  // Written accidental, in semitones: null when the key or the bar supplies it.
  accidental: number | null;
  // On a percussion staff: where it sits, and whether its head is a cross.
  drum: { line: number; cross: boolean } | null;
}

export interface Written extends Span, Value {
  // In a bar, in ticks. Empty notes are a rest, or a silent one if `hidden`.
  notes: WrittenNote[];
  hidden: boolean;
  staccato: boolean;
  // The triplet or sextuplet this sits in, by the tick its cell starts on.
  tuplet: { cell: number; count: 3 | 6 } | null;
}

export interface Staff {
  name: string;
  role: Role;
  clef: Clef;
  // Which system of braced staves it belongs to, by the first staff's index.
  brace: number | null;
  // Each bar's voices; a bar of silence has none.
  bars: Written[][][];
}

export interface Notation {
  title: string;
  tempo: readonly TempoPoint[];
  // The sustain pedal's movements, in quarters, for the page.
  pedal: { beat: number; down: boolean }[];
  metre: readonly [number, number];
  swing: boolean;
  // Bar index to signature, the first at bar 0.
  keys: { bar: number; fifths: number }[];
  bars: number;
  staves: Staff[];
  // Written quarters to sounding quarters, ascending: the two differ in swing.
  timing: { written: number; sounding: number }[];
}

const ROLE_ORDER: readonly Role[] = ["lead", "keys", "pad", "bass", "drums"];
const MAX_VOICES = 2;

const SPLIT_SPAN = 24;
const SPLIT_LOW = 60;
const SPLIT_HIGH = 72;
const SPLIT_AT = 60;

const CLEF_RANGES: readonly { clef: Clef; low: number; high: number }[] = [
  { clef: "treble", low: 64, high: 77 },
  { clef: "bass", low: 43, high: 57 },
];
// An octave clef is for a part that lives past the ledger lines, not one that
// visits them.
const OCTAVE_UP_FROM = 86;
const OCTAVE_DOWN_FROM = 34;

interface DrumMark {
  line: number;
  cross: boolean;
  foot: boolean;
}

// Where General MIDI's kit sits on a five-line staff, by the usual drum key.
function drumMark(pitch: number): DrumMark {
  if (pitch === 35 || pitch === 36) return { line: 1, cross: false, foot: true };
  if (pitch === 44) return { line: -1, cross: true, foot: true };
  if (pitch === 38 || pitch === 37 || pitch === 40) return { line: 5, cross: false, foot: false };
  if (pitch === 42 || pitch === 46) return { line: 9, cross: true, foot: false };
  if (pitch === 49 || pitch === 57) return { line: 10, cross: true, foot: false };
  if (pitch === 51 || pitch === 59) return { line: 8, cross: true, foot: false };
  if (pitch === 41 || pitch === 43) return { line: 3, cross: false, foot: false };
  if (pitch === 45 || pitch === 47) return { line: 4, cross: false, foot: false };
  if (pitch === 48 || pitch === 50) return { line: 7, cross: false, foot: false };
  return { line: 6, cross: true, foot: false };
}

function percentile(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

export function clefFor(pitches: readonly number[]): Clef {
  const middle = percentile([...pitches].sort((a, b) => a - b), 0.5);
  if (middle >= OCTAVE_UP_FROM) return "treble8";
  if (middle <= OCTAVE_DOWN_FROM) return "bass8";
  let [chosen, lowest] = ["treble" as Clef, Infinity];
  for (const { clef, low, high } of CLEF_RANGES) {
    const cost = pitches.reduce((sum, pitch) => sum + Math.max(0, low - pitch, pitch - high), 0);
    if (cost < lowest) [chosen, lowest] = [clef, cost];
  }
  return chosen;
}

function splitsToTwoStaves(track: Track): boolean {
  if (track.role !== "keys") return false;
  const pitches = track.notes.map((note) => note.pitch).sort((a, b) => a - b);
  const [low, high] = [percentile(pitches, 0.05), percentile(pitches, 0.95)];
  return high - low >= SPLIT_SPAN && low < SPLIT_LOW && high > SPLIT_HIGH;
}

interface Chord extends Span {
  placed: Placed[];
}

function chordsOf(placed: readonly Placed[]): Chord[] {
  const chords = new Map<string, Chord>();
  for (const entry of placed) {
    const id = `${String(entry.start)}:${String(entry.end)}`;
    const chord = chords.get(id);
    if (chord === undefined) chords.set(id, { start: entry.start, end: entry.end, placed: [entry] });
    else chord.placed.push(entry);
  }
  const height = (chord: Chord): number => chord.placed.reduce((sum, { note }) => sum + note.pitch, 0) / chord.placed.length;
  return [...chords.values()].sort((a, b) => a.start - b.start || height(b) - height(a));
}

interface Voice {
  chords: Chord[];
  pitch: number;
}

// Overlapping notes in one staff part into voices, each a line of its own:
// each chord joins the free voice nearest in pitch. Past two voices a staff
// stops reading, so a held note gives way to the note that needs its place.
export function voicesOf(placed: readonly Placed[]): Chord[][] {
  const voices: Voice[] = [];
  const reach = (voice: Voice): number => voice.chords.at(-1)?.end ?? 0;
  for (const chord of chordsOf(placed)) {
    const pitch = chord.placed[0].note.pitch;
    const free = voices.filter((voice) => reach(voice) <= chord.start);
    if (free.length > 0) {
      const voice = free.reduce((best, candidate) => (Math.abs(candidate.pitch - pitch) < Math.abs(best.pitch - pitch) ? candidate : best));
      voice.chords.push(chord);
      voice.pitch = pitch;
    } else if (voices.length < MAX_VOICES) {
      voices.push({ chords: [chord], pitch });
    } else {
      const voice = voices.reduce((soonest, candidate) => (reach(candidate) < reach(soonest) ? candidate : soonest));
      const last = voice.chords[voice.chords.length - 1];
      if (last.start === chord.start) {
        last.placed.push(...chord.placed);
      } else {
        last.end = chord.start;
        voice.chords.push(chord);
        voice.pitch = pitch;
      }
    }
  }
  const height = (voice: Voice): number => {
    const pitches = voice.chords.flatMap((chord) => chord.placed.map(({ note }) => note.pitch));
    return pitches.reduce((sum, value) => sum + value, 0) / pitches.length;
  };
  return voices.sort((a, b) => height(b) - height(a)).map((voice) => voice.chords);
}

interface Slice extends Span {
  chord: Chord | null;
  // The note carries on from before this slice, or on after it.
  tiedIn: boolean;
  tiedOut: boolean;
}

function slicesInBar(chords: readonly Chord[], bar: number, metre: Metre): Slice[] {
  const [barStart, barEnd] = [bar * metre.barTicks, (bar + 1) * metre.barTicks];
  const slices: Slice[] = [];
  let cursor = 0;
  for (const chord of chords) {
    if (chord.end <= barStart || chord.start >= barEnd) continue;
    const start = Math.max(chord.start, barStart) - barStart;
    const end = Math.min(chord.end, barEnd) - barStart;
    if (start > cursor) slices.push({ start: cursor, end: start, chord: null, tiedIn: false, tiedOut: false });
    slices.push({ start, end, chord, tiedIn: chord.start < barStart, tiedOut: chord.end > barEnd });
    cursor = end;
  }
  if (cursor < metre.barTicks && slices.length > 0) slices.push({ start: cursor, end: metre.barTicks, chord: null, tiedIn: false, tiedOut: false });
  return slices;
}

// The cells of a bar this voice divides in threes: an edge on no binary
// division says so.
function tupletCells(slices: readonly Slice[], metre: Metre): Map<number, 3 | 6> {
  const cells = new Map<number, 3 | 6>();
  for (const cell of metre.cells) {
    const edges = slices.flatMap(({ start, end }) => [start, end]).filter((edge) => edge > cell.start && edge < cell.end).map((edge) => edge - cell.start);
    if (edges.some((edge) => edge % 6 !== 0)) cells.set(cell.start, edges.every((edge) => edge % 16 === 0) ? 3 : 6);
  }
  return cells;
}

function pieces(slice: Slice, metre: Metre, tuplets: ReadonlyMap<number, 3 | 6>): Span[] {
  const cuts = metre.cells.filter((cell) => tuplets.has(cell.start)).flatMap((cell) => [cell.start, cell.end]);
  const edges = [...new Set([slice.start, ...cuts.filter((cut) => cut > slice.start && cut < slice.end), slice.end])].sort((a, b) => a - b);
  return edges.slice(1).flatMap((end, index) => {
    const span = { start: edges[index], end };
    const cell = metre.cells.find((candidate) => span.start >= candidate.start && span.end <= candidate.end);
    if (cell !== undefined && tuplets.has(cell.start)) return splitTupletSpan(span, tuplets.get(cell.start) === 6 ? 8 : 16);
    return slice.chord === null ? splitRest(span, metre) : splitNote(span, metre);
  });
}

function splitTupletSpan(span: Span, grid: number): Span[] {
  if (valueOf(((span.end - span.start) * 3) / 2) !== null) return [span];
  const cut = span.start + grid;
  return [{ start: span.start, end: cut }, ...splitTupletSpan({ start: cut, end: span.end }, grid)];
}

function tieOf(index: number, count: number, slice: Slice): Tie | null {
  const before = index > 0 || slice.tiedIn;
  const after = index < count - 1 || slice.tiedOut;
  return before && after ? "m" : before ? "t" : after ? "i" : null;
}

function writeVoiceBar(slices: readonly Slice[], metre: Metre, spelling: ReadonlyMap<object, Spelled>, hideRests: boolean, percussion: boolean): Written[] {
  const tuplets = tupletCells(slices, metre);
  return slices.flatMap((slice) => {
    const parts = pieces(slice, metre, tuplets);
    return parts.map((span, index): Written => {
      const cell = metre.cells.find((candidate) => span.start >= candidate.start && span.end <= candidate.end);
      const count = cell === undefined ? undefined : tuplets.get(cell.start);
      const ticks = span.end - span.start;
      const value = valueOf(count === undefined ? ticks : (ticks * 3) / 2);
      if (value === null) throw new Error(`Notation: no written value for ${String(ticks)} ticks at ${String(span.start)}`);
      const tie = tieOf(index, parts.length, slice);
      const notes: WrittenNote[] = (slice.chord?.placed ?? [])
        .slice()
        .sort((a, b) => a.note.pitch - b.note.pitch)
        .map(({ note }) => {
          const spelled = spelling.get(note) ?? { letter: 0, alter: 0, octave: 4 };
          const mark = drumMark(note.pitch);
          return { source: { start: note.start, pitch: note.pitch }, spelled, tie: percussion ? null : tie, accidental: null, drum: percussion ? { line: mark.line, cross: mark.cross } : null };
        });
      return {
        ...span,
        ...value,
        notes,
        hidden: notes.length === 0 && hideRests,
        staccato: index === 0 && !slice.tiedIn && (slice.chord?.placed.some((entry) => entry.staccato) ?? false),
        tuplet: count === undefined || cell === undefined ? null : { cell: cell.start, count },
      };
    });
  });
}

// What the key and the bar have left each letter at decides which accidentals
// are written: per staff, per octave, for the bar.
function markAccidentals(bar: Written[][], fifths: number): void {
  const inKey = (letter: number): number => {
    const order = [3, 0, 4, 1, 5, 2, 6];
    const rank = order.indexOf(letter);
    return fifths > 0 ? (rank < fifths ? 1 : 0) : rank >= 7 + fifths ? -1 : 0;
  };
  const standing = new Map<string, number>();
  const notes = bar.flatMap((voice) => voice.flatMap((written) => written.notes.map((note) => ({ note, start: written.start })))).sort((a, b) => a.start - b.start);
  for (const { note } of notes) {
    const { letter, alter, octave } = note.spelled;
    const id = `${String(letter)}:${String(octave)}`;
    const current = standing.get(id) ?? inKey(letter);
    const carried = note.tie === "t" || note.tie === "m";
    note.accidental = !carried && alter !== current ? alter : null;
    standing.set(id, alter);
  }
}

function drumEnds(placed: readonly Placed[]): Placed[] {
  const onsets = [...new Set(placed.map((entry) => entry.start))].sort((a, b) => a - b);
  return placed.map((entry) => {
    const next = onsets.find((onset) => onset > entry.start) ?? Infinity;
    const length = entry.start % TICKS_PER_QUARTER === 0 ? TICKS_PER_QUARTER : 24;
    return { ...entry, end: Math.min(next, entry.start + length), staccato: false };
  });
}

interface StaffPart {
  name: string;
  role: Role;
  clef: Clef;
  brace: number | null;
  voices: Chord[][];
}

function partsOf(track: Track, metre: Metre, swing: number | null, timing: Map<number, number>, firstIndex: number): StaffPart[] {
  const placed = placeTrack(track, metre, swing, timing);
  const { name, role } = track;
  if (role === "drums") {
    const hits = drumEnds(placed);
    const hands = hits.filter(({ note }) => !drumMark(note.pitch).foot);
    const feet = hits.filter(({ note }) => drumMark(note.pitch).foot);
    const voices = [chordsOf(hands), chordsOf(feet)].filter((voice) => voice.length > 0);
    return [{ name, role, clef: "percussion", brace: null, voices }];
  }
  if (splitsToTwoStaves(track)) {
    const high = placed.filter(({ note }) => note.pitch >= SPLIT_AT);
    const low = placed.filter(({ note }) => note.pitch < SPLIT_AT);
    return [
      { name, role, clef: clefFor(high.map(({ note }) => note.pitch)), brace: firstIndex, voices: voicesOf(high) },
      { name, role, clef: clefFor(low.map(({ note }) => note.pitch)), brace: firstIndex, voices: voicesOf(low) },
    ];
  }
  return [{ name, role, clef: clefFor(placed.map(({ note }) => note.pitch)), brace: null, voices: voicesOf(placed) }];
}

function byRole(a: Track, b: Track): number {
  return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
}

export function keepsIn(score: Score, tracks: number): Track[] {
  // The melody and the bass say the most; a part's weight breaks a tie.
  const rank: Record<Role, number> = { lead: 0, bass: 1, keys: 2, pad: 3, drums: 4 };
  const ranked = score.tracks
    .filter((track) => track.notes.length > 0)
    .sort((a, b) => rank[a.role] - rank[b.role] || b.notes.length - a.notes.length);
  return ranked.slice(0, tracks).sort(byRole);
}

// Where one pedal lifts just as the next goes down, that is a change: one mark.
function pedalMoves(score: Score): Notation["pedal"] {
  const spans = allPedals(score);
  const moves = new Map<number, boolean>();
  for (const { end } of spans) moves.set(end, false);
  for (const { start } of spans) if (!moves.has(start)) moves.set(start, true);
  return [...moves].sort(([a], [b]) => a - b).map(([beat, down]) => ({ beat, down }));
}

// `tracks` cuts a score to its most important parts, for a screen too small
// for them all.
export function transcribe(score: Score, tracks = Infinity): Notation {
  const metre = metreOf(score.metre);
  const swing = swingOf(score, metre);
  const kept = keepsIn(score, tracks);
  const timing = new Map<number, number>([[0, 0]]);
  const parts: StaffPart[] = [];
  for (const track of kept) parts.push(...partsOf(track, metre, swing, timing, parts.length));
  const lastTick = Math.max(metre.barTicks, ...parts.flatMap((part) => part.voices.flat().map((chord) => chord.end)));
  const bars = Math.ceil(lastTick / metre.barTicks);

  const keys: Key[] = detectKeys(score, bars);
  const spelling = spellScore(score, keys);
  const staves = parts.map(({ name, role, clef, brace, voices }): Staff => ({
    name,
    role,
    clef,
    brace,
    bars: Array.from({ length: bars }, (_, bar) => {
      const sliced = voices.map((voice) => slicesInBar(voice, bar, metre)).filter((slices) => slices.length > 0);
      const written = sliced.map((slices, index) => writeVoiceBar(slices, metre, spelling, index > 0, clef === "percussion"));
      if (clef !== "percussion") markAccidentals(written, keys[bar].fifths);
      return written;
    }),
  }));

  const marks: Notation["keys"] = [];
  keys.forEach((key, bar) => {
    if (marks.at(-1)?.fifths !== key.fifths) marks.push({ bar, fifths: key.fifths });
  });
  return {
    title: score.title,
    tempo: score.tempo,
    pedal: pedalMoves(score),
    metre: score.metre,
    swing: swing !== null,
    keys: marks,
    bars,
    staves,
    timing: [...timing].sort(([a], [b]) => a - b).map(([tick, sounding]) => ({ written: tick / TICKS_PER_QUARTER, sounding })),
  };
}
