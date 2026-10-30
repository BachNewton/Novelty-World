import type { Note, Score, Track } from "../types";
import { TICKS_PER_QUARTER, type Metre, type Span } from "./metre";

// From played time to written time. A score's ticks hold what sounds: a note
// cut to half its length for bounce, swing, a player's small strays. Notation
// holds what is meant, so every onset goes to a grid chosen beat by beat, and
// every note to the length its player was asked for.

export interface Placed extends Span {
  note: Note;
  staccato: boolean;
}

// An onset this close before a cell's end belongs to the next cell.
const CELL_LEAD = 3;
const SIXTEENTH = 12;
// In quarters per onset, what a finer or odder grid must buy in accuracy to be
// worth reading: a player's stray is not a triplet.
const GRID_COST: Record<number, number> = { [SIXTEENTH]: 0, 16: 0.05, 8: 0.06, 6: 0.08 };
const EIGHTH = 24;

// The share of a note's written length it sounds, at which it reads as a
// shorter note on purpose, not a held one.
const HELD_GATE = 0.85;
const STACCATO_GATE = 0.7;
// Shorter than this is a plucked or stabbed note, however short: read as
// staccato, not as a tiny written value.
const SHORTEST_GATE = 0.4;
const PLUCKED_GATE = 0.5;
// Notes that habitually ring into the next are a pedal's work, not voices.
const PEDAL_GATE = 1.3;
// In quarters: notes further apart than this say nothing about their gate.
const GATE_REACH = 2;

const SWING_RANGE: Span = { start: 0.56, end: 0.72 };
const STRAIGHT_NEAR = 0.04;
const MIN_SWUNG = 8;

// Where a swung piece's off-beat lands in the beat, or null for straight time.
export function swingOf(score: Score, metre: Metre): number | null {
  if (metre.compound || metre.beats.length < 2) return null;
  const onsets = score.tracks.filter((track) => track.role !== "drums").flatMap((track) => track.notes.map((note) => note.start % 1));
  const swung = onsets.filter((onset) => onset > SWING_RANGE.start && onset < SWING_RANGE.end).sort((a, b) => a - b);
  const straight = onsets.filter((onset) => Math.abs(onset - 0.5) < STRAIGHT_NEAR);
  if (swung.length < MIN_SWUNG || swung.length < straight.length * 3) return null;
  return swung[swung.length >> 1];
}

// A sounding time in quarters as the straight time it is written in.
export function unswing(beats: number, swing: number | null): number {
  if (swing === null) return beats;
  const whole = Math.floor(beats);
  const inBeat = beats - whole;
  return whole + (inBeat < swing ? (inBeat / swing) / 2 : 0.5 + ((inBeat - swing) / (1 - swing)) / 2);
}

function gridsFor(cell: Span): number[] {
  return cell.end - cell.start === TICKS_PER_QUARTER ? [SIXTEENTH, 16, 8, 6] : [SIXTEENTH, 6];
}

function bestGrid(cellStart: number, cell: Span, onsets: readonly number[]): number {
  let [chosen, lowest] = [SIXTEENTH, Infinity];
  for (const grid of gridsFor(cell)) {
    let error = 0;
    for (const onset of onsets) {
      const inCell = onset - cellStart;
      error += Math.abs(inCell - Math.round(inCell / grid) * grid);
    }
    const cost = error / onsets.length / TICKS_PER_QUARTER + GRID_COST[grid];
    if (cost < lowest - 1e-9) [chosen, lowest] = [grid, cost];
  }
  return chosen;
}

function median(values: readonly number[]): number {
  return [...values].sort((a, b) => a - b)[values.length >> 1];
}

interface Grid {
  // The start of each cell in the piece, and its grid.
  round: (tick: number) => number;
}

function buildGrid(onsets: readonly number[], metre: Metre): Grid {
  const cellAt = (tick: number): { start: number; cell: Span } => {
    const bar = Math.floor(tick / metre.barTicks);
    const inBar = tick - bar * metre.barTicks;
    const cell = metre.cells.find(({ end }) => inBar < end) ?? metre.cells[0];
    return { start: bar * metre.barTicks + cell.start, cell };
  };
  const inCell = new Map<number, number[]>();
  for (const onset of onsets) {
    const { start } = cellAt(onset + CELL_LEAD);
    inCell.set(start, [...(inCell.get(start) ?? []), onset]);
  }
  const grids = new Map([...inCell].map(([start, list]) => [start, bestGrid(start, cellAt(start).cell, list)]));
  return {
    round(tick) {
      const { start } = cellAt(tick + CELL_LEAD);
      const grid = grids.get(start) ?? SIXTEENTH;
      return start + Math.round((tick - start) / grid) * grid;
    },
  };
}

// A track's usual gate: how much of the gap to the next note its notes fill.
function usualGate(notes: readonly Note[]): number {
  const gates: number[] = [];
  notes.forEach((note, index) => {
    const next = notes.slice(index + 1).find((later) => later.start > note.start);
    if (next !== undefined && next.start - note.start <= GATE_REACH) gates.push(note.duration / (next.start - note.start));
  });
  return gates.length === 0 ? 1 : median(gates);
}

export function placeTrack(track: Track, metre: Metre, swing: number | null, timing: Map<number, number>): Placed[] {
  const tick = (beats: number): number => unswing(beats, swing) * TICKS_PER_QUARTER;
  const notes = [...track.notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const heard = usualGate(notes);
  const pedalled = heard >= PEDAL_GATE;
  const short = heard < HELD_GATE;
  const gate = heard < SHORTEST_GATE ? PLUCKED_GATE : Math.min(1, heard);
  const starts = notes.map((note) => tick(note.start));
  const grid = buildGrid(starts, metre);
  const rounded = starts.map(grid.round);
  const onsets = [...new Set(rounded)].sort((a, b) => a - b);

  return notes.map((note, index) => {
    const start = rounded[index];
    if (!timing.has(start)) timing.set(start, note.start);
    const sounded = tick(note.start + note.duration) - starts[index];
    let end = grid.round(tick(note.start + note.duration / gate));
    end = Math.max(end, start + (short ? EIGHTH : SIXTEENTH / 2));
    const next = onsets.find((onset) => onset > start);
    if (next !== undefined && (end > next ? end - next <= Math.max(SIXTEENTH / 2, (end - start) / 4) : next - end <= Math.max(SIXTEENTH / 2, (end - start) / 4))) end = next;
    if (next !== undefined && (short || pedalled) && end > next) end = next;
    const length = end - start;
    return { note, start, end, staccato: length <= TICKS_PER_QUARTER && sounded / length < STACCATO_GATE };
  });
}
