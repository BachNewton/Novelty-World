import {
  bars as barCount,
  beatsAt,
  keyAt,
  occurrenceNotes,
  parseKeyName,
  parseRoman,
  parseSymbol,
  type Analysis,
  type Chord,
  type ChordTones,
  type Occurrence,
  type Pattern,
  type Span,
  type Theme,
} from "./analysis";
import { pedalsOf, soundedEnd } from "./tempo";
import { barBeats, type Note, type Score } from "./types";

// Holds an analysis against its score: a chord that isn't sounding, a numeral
// that doesn't spell its chord, a cadence with no dominant, a return that
// isn't the theme. Returns what it finds, one line each.

// The share of what sounds that must belong to the chord. What's left is
// passing notes, suspensions, pedal and figuration.
const CHORD_SHARE = 0.55;
const AMBIGUOUS_SHARE = 0.35;
// Notes shorter than this count for less: a run says little about its chord.
const FLEETING = 0.3;

const MATCH_SHARE: Record<Occurrence["as"], number> = {
  literal: 0.85,
  transposed: 0.8,
  inverted: 0.7,
  retrograde: 0.7,
  augmented: 0.75,
  diminished: 0.75,
  fragmented: 0.8,
  sequenced: 0.65,
  varied: 0.5,
};
// In quarters: how far a written rubato or swing moves a note off its place.
const ONSET_REACH = 0.14;

interface Sounding {
  pitch: number;
  weight: number;
  start: number;
}

// What sounds, so with the pedal's ring: a held note under it is still harmony.
function soundingIn(score: Score, from: number, to: number): Sounding[] {
  return score.tracks
    .filter((track) => track.role !== "drums")
    .flatMap((track) => {
      const pedals = pedalsOf(score, track);
      return track.notes.flatMap((note) => {
        const end = soundedEnd(note.start + note.duration, pedals);
        const overlap = Math.min(to, end) - Math.max(from, note.start);
        if (overlap <= 0) return [];
        return [{ pitch: note.pitch, start: note.start, weight: overlap * (end - note.start < FLEETING ? 0.5 : 1) }];
      });
    });
}

function bassesIn(sounding: readonly Sounding[]): Set<number> {
  const byOnset = new Map<number, number>();
  for (const { start, pitch } of sounding) byOnset.set(start, Math.min(byOnset.get(start) ?? 127, pitch));
  const lowest = Math.min(...byOnset.values());
  // Anything within an octave of the floor is the bass line, not a tenor note.
  return new Set([...byOnset.values()].filter((pitch) => pitch < lowest + 12).map((pitch) => pitch % 12));
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((tone) => b.includes(tone));
}

function checkSpans(spans: readonly Span[], last: number, what: string): string[] {
  const problems: string[] = [];
  let next = 1;
  for (const { name, bars: [first, end] } of spans) {
    if (first !== next) problems.push(`${what} "${name}" starts at bar ${String(first)}, and bar ${String(next)} is next`);
    if (end < first) problems.push(`${what} "${name}" runs backwards`);
    next = end + 1;
  }
  if (next !== last + 1) problems.push(`the ${what}s end at bar ${String(next - 1)}, and the piece at bar ${String(last)}`);
  return problems;
}

function checkRoman(chord: Chord, key: string, tones: ChordTones): string[] {
  if (chord.roman === null) return [];
  const reading = parseRoman(chord.roman, key);
  const ped = chord.roman.endsWith("(ped)");
  const problems: string[] = [];
  if (reading.root !== tones.root || !sameSet(reading.tones, tones.tones)) problems.push(`${chord.roman} in ${key} doesn't spell ${chord.symbol}`);
  if (!ped) {
    const bass = reading.inversion === null ? reading.tones[0] : reading.tones[reading.inversion];
    const stated = tones.bass ?? tones.tones[0];
    if (bass !== stated) problems.push(`${chord.roman}'s figure and ${chord.symbol}'s bass disagree`);
  }
  return problems;
}

function checkCadence(chord: Chord, before: Chord | undefined, key: string, score: Score, top: number): string[] {
  if (chord.cadence === undefined) return [];
  const tonic = parseKeyName(key).tonic;
  const dominant = (tonic + 7) % 12;
  const leading = (tonic + 11) % 12;
  const root = parseSymbol(chord.symbol).root;
  const previous = before === undefined || before.symbol === "N.C." ? null : parseSymbol(before.symbol).root;
  const fromDominant = previous === dominant || previous === leading;
  const name = chord.cadence;
  if (name === "HC") return root === dominant ? [] : [`a half cadence on ${chord.symbol}, not on the dominant of ${key}`];
  if (name === "PC") return previous === (tonic + 5) % 12 && root === tonic ? [] : [`a plagal cadence that isn't IV to I in ${key}`];
  if (name === "DC") return fromDominant && root !== tonic ? [] : [`a deceptive cadence that isn't V to something other than I in ${key}`];
  const problems = fromDominant && root === tonic ? [] : [`${name} that isn't V to I in ${key}`];
  const inverted = (entry: Chord): boolean => parseSymbol(entry.symbol).bass !== null;
  const rootPositions = !inverted(chord) && (before === undefined || !inverted(before));
  if (name === "PAC" && !rootPositions) problems.push(`a PAC on an inverted chord`);
  if (name === "PAC" && top % 12 !== tonic) problems.push(`a PAC whose top note isn't the tonic of ${key}`);
  if (name === "IAC" && top % 12 === tonic && rootPositions) problems.push(`an IAC that has the tonic on top in root position: a PAC`);
  return problems.map((problem) => `${problem} (${score.title})`);
}

function checkHarmony(score: Score, analysis: Analysis): string[] {
  const problems: string[] = [];
  const end = barCount(score) * barBeats(score);
  analysis.chords.forEach((chord, index) => {
    const where = `bar ${String(chord.bar)}.${String(chord.beat)} ${chord.symbol}`;
    const from = beatsAt(score, chord);
    const after = analysis.chords.at(index + 1);
    const to = after === undefined ? end : beatsAt(score, after);
    if (to <= from) problems.push(`${where}: out of order`);
    if (chord.symbol === "N.C.") return;
    const key = keyAt(analysis, score, from).key;
    const tones = parseSymbol(chord.symbol);
    const say = (problem: string): void => void problems.push(`${where}: ${problem}`);
    checkRoman(chord, key, tones).forEach(say);

    const sounding = soundingIn(score, from, to);
    if (sounding.length === 0) {
      say("nothing sounds here");
      return;
    }
    const total = sounding.reduce((sum, { weight }) => sum + weight, 0);
    const inChord = sounding.filter(({ pitch }) => tones.tones.includes(pitch % 12)).reduce((sum, { weight }) => sum + weight, 0);
    const share = inChord / total;
    const needed = chord.ambiguous === true ? AMBIGUOUS_SHARE : CHORD_SHARE;
    if (share < needed) say(`only ${String(Math.round(share * 100))}% of what sounds is in the chord`);
    if (chord.ambiguous !== true) {
      const heard = new Set(sounding.map(({ pitch }) => pitch % 12));
      // The fifth of a plain chord may go unsaid; every other tone defines it.
      const fifth = (tones.root + 7) % 12;
      const missing = tones.tones.filter((tone) => !heard.has(tone) && tone !== fifth);
      if (missing.length > 0) say(`${String(missing.length)} of its tones never sound`);
      const stated = tones.bass ?? tones.root;
      if (!bassesIn(sounding).has(stated)) say("that bass isn't in the bass");
    }
    const atStart = sounding.filter(({ start }) => Math.abs(start - from) < 0.5);
    const top = Math.max(...(atStart.length > 0 ? atStart : sounding).map(({ pitch }) => pitch));
    checkCadence(chord, analysis.chords.at(index - 1), key, score, top).forEach(say);
  });
  return problems;
}

interface Shape {
  // Quarters and semitones from its first note.
  at: number;
  pitch: number;
}

function shapeOf(notes: readonly Note[]): Shape[] {
  return notes.map((note) => ({ at: note.start - notes[0].start, pitch: note.pitch - notes[0].pitch }));
}

function agreement(reference: readonly Shape[], heard: readonly Shape[], tolerance: number): number {
  const count = Math.max(reference.length, heard.length);
  if (count === 0) return 0;
  let matched = 0;
  for (const { at, pitch } of reference) {
    if (heard.some((note) => Math.abs(note.at - at) <= ONSET_REACH && Math.abs(note.pitch - pitch) <= tolerance)) matched++;
  }
  return matched / count;
}

function window(shape: readonly Shape[], from: number, length: number): Shape[] {
  const inside = shape.filter(({ at }) => at >= from - 1e-6 && at < from + length - ONSET_REACH);
  if (inside.length === 0) return [];
  return inside.map(({ at, pitch }) => ({ at: at - inside[0].at, pitch: pitch - inside[0].pitch }));
}

// How well a stretch of notes is the statement under a transformation, from 0
// to 1, by rhythm and pitch at once.
export function matchShare(statement: readonly Note[], heard: readonly Note[], occurrence: Pick<Occurrence, "as" | "tonal" | "every" | "beats">, quarters: number): number {
  const reference = shapeOf(statement);
  const shape = shapeOf(heard);
  const tolerance = occurrence.tonal === true ? 1 : 0;
  const span = quarters;
  switch (occurrence.as) {
    case "literal":
      return agreement(window(reference, 0, span), shape, 0);
    case "transposed":
      return agreement(window(reference, 0, span), shape, tolerance);
    case "varied":
      return agreement(window(reference, 0, span), shape, 2);
    case "inverted":
      return agreement(window(reference, 0, span).map(({ at, pitch }) => ({ at, pitch: -pitch })), shape, Math.max(tolerance, 1));
    case "retrograde": {
      const total = reference.at(-1)?.at ?? 0;
      const backwards = [...reference].reverse().map(({ at, pitch }) => ({ at: total - at, pitch: pitch - (reference.at(-1)?.pitch ?? 0) }));
      return agreement(backwards, shape, Math.max(tolerance, 1));
    }
    case "augmented":
    case "diminished": {
      const factor = occurrence.every ?? 2;
      const stretch = occurrence.as === "augmented" ? factor : 1 / factor;
      return agreement(reference.map(({ at, pitch }) => ({ at: at * stretch, pitch })).filter(({ at }) => at < span), shape, tolerance);
    }
    case "fragmented":
      return Math.max(0, ...reference.map(({ at }) => agreement(window(reference, at, span), shape, Math.max(tolerance, 1))));
    case "sequenced": {
      const period = ((occurrence.every ?? occurrence.beats) * span) / occurrence.beats;
      const unit = window(reference, 0, period);
      const chunks = Math.max(1, Math.round(span / period));
      const shares = Array.from({ length: chunks }, (_, index) => agreement(unit, window(shape, index * period, period), Math.max(tolerance, 1)));
      return shares.reduce((sum, share) => sum + share, 0) / chunks;
    }
  }
}

function checkTheme(score: Score, theme: Theme): string[] {
  const [statement] = theme.occurrences;
  if (statement.as !== "literal") return [`theme ${theme.id}: its first occurrence is the statement, and must be literal`];
  const reference = occurrenceNotes(score, statement);
  if (reference.length < 2) return [`theme ${theme.id}: its statement has ${String(reference.length)} notes`];
  const unit = 4 / score.metre[1];
  return theme.occurrences.flatMap((occurrence) => {
    const where = `theme ${theme.id} at ${String(occurrence.bar)}.${String(occurrence.beat)} on ${occurrence.track}`;
    const heard = occurrenceNotes(score, occurrence);
    if (heard.length < 2) return [`${where}: nothing there`];
    const problems: string[] = [];
    const share = matchShare(reference, heard, occurrence, occurrence.beats * unit);
    if (share < MATCH_SHARE[occurrence.as]) problems.push(`${where}: only ${String(Math.round(share * 100))}% matches as ${occurrence.as}`);
    if (occurrence.by !== undefined && occurrence.as !== "fragmented" && occurrence.as !== "sequenced") {
      const moved = heard[0].pitch - reference[0].pitch;
      if (moved !== occurrence.by) problems.push(`${where}: stated ${String(occurrence.by)} semitones, and it moved ${String(moved)}`);
    }
    if (occurrence.as === "literal" && heard[0].pitch !== reference[0].pitch) problems.push(`${where}: literal, but at another pitch`);
    return problems;
  });
}

function checkPattern(score: Score, pattern: Pattern, last: number): string[] {
  const bar = barBeats(score);
  return pattern.spans.flatMap(({ track, bars: [first, end] }) => {
    const where = `pattern ${pattern.id} on ${track}, bars ${String(first)}-${String(end)}`;
    if (end > last || end < first) return [`${where}: outside the piece`];
    const notes = score.tracks.find((candidate) => candidate.name === track)?.notes;
    if (notes === undefined) return [`${where}: no such track`];
    const inside = notes.filter((note) => note.start >= (first - 1) * bar - 1e-6 && note.start < end * bar - 1e-6);
    if (inside.length === 0) return [`${where}: nothing there`];
    if (pattern.every === undefined) return [];
    const period = (pattern.every * 4) / score.metre[1];
    const onsets = new Set(inside.map((note) => Math.round(note.start * 48)));
    const repeated = [...onsets].filter((onset) => {
      const next = onset + period * 48;
      const previous = onset - period * 48;
      return onsets.has(next) || onsets.has(previous);
    });
    const share = repeated.length / onsets.size;
    return share < 0.7 ? [`${where}: only ${String(Math.round(share * 100))}% of its rhythm repeats every ${String(pattern.every)}`] : [];
  });
}

export function checkAnalysis(score: Score, analysis: Analysis): string[] {
  const last = barCount(score);
  const problems = [
    ...checkSpans(analysis.sections, last, "section"),
    ...checkSpans(analysis.movements ?? analysis.sections, last, "movement"),
    ...checkHarmony(score, analysis),
    ...analysis.themes.flatMap((theme) => checkTheme(score, theme)),
    ...analysis.patterns.flatMap((pattern) => checkPattern(score, pattern, last)),
  ];
  if (analysis.keys.length === 0 || analysis.keys[0].bar !== 1) problems.push("the keys don't start at bar 1");
  for (const area of analysis.keys.slice(1)) if (area.how === undefined) problems.push(`bar ${String(area.bar)}: a key change with no how`);
  for (const area of analysis.keys) parseKeyName(area.key);
  for (const { bars: [first, end], mark } of analysis.tempo) if (end > last || end < first) problems.push(`tempo "${mark}": outside the piece`);
  return problems;
}
