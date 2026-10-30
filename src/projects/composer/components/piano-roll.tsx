"use client";

import { useEffect, useRef } from "react";
import { noteKey, toneVar } from "../analysis";
import { cursor, position } from "../player";
import { indexAt } from "../notation/timeline";
import { allPedals, timingOf } from "../tempo";
import { barBeats, scoreBeats, type Score } from "../types";

// The piano roll: notes fall onto a keyboard and reach it as they sound, one
// colour per track. Drawn afresh on animation frames against the audio clock,
// which is the feature, and only what is on screen.

const MARGIN_PITCHES = 2;
const MIN_SPAN = 24;
const EMPTY_RANGE: readonly [number, number] = [48, 72];
const HIGHEST_MIDI = 127;

// How much of the piece is on screen: a span of beats, kept to what an eye can
// read at any tempo.
const VIEW_BEATS = 8;
const MIN_VIEW_SECONDS = 3;
const MAX_VIEW_SECONDS = 6;

// In white-key widths, off a real piano: a black key sits a little to the
// outside of its group, not dead on the crack between two white keys.
const BLACK_WIDTH = 0.58;
const BLACK_OFFSET: Partial<Record<number, number>> = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };
const BLACK_LENGTH = 0.63;
const KEY_HEIGHT_IN_WIDTHS = 4.5;
const MIN_KEYBOARD_HEIGHT = 48;
const MAX_KEYBOARD_SHARE = 0.22;

const NOTE_RADIUS = 2;
const BAR_LABEL = 10;
const MIN_NOTE_LENGTH = 2;
const PEDAL_WIDTH = 3;

interface RollNote {
  start: number;
  end: number;
  velocity: number;
  track: number;
  key: string;
}

// One key and the notes that fall on it, in seconds, by start. `reach[i]` is
// the latest end among notes up to i: it never falls, so a search can skip
// what has passed even when a long note overlaps shorter ones. Each key has
// its own, so a drone on one pitch never slows the others.
export interface Key {
  pitch: number;
  black: boolean;
  // In white-key widths from the keyboard's left edge.
  left: number;
  right: number;
  notes: RollNote[];
  reach: number[];
}

export interface Keyboard {
  // White keys first, so black keys and their notes draw on top.
  keys: Key[];
  whites: number;
}

function isBlack(pitch: number): boolean {
  return BLACK_OFFSET[pitch % 12] !== undefined;
}

// Rounding to the edges of a black-key group (C or F below, E or B above) means
// the range starts and ends on a white key, with no half-covered black key.
function edgeBelow(pitch: number): number {
  let edge = Math.max(0, pitch);
  while (edge % 12 !== 0 && edge % 12 !== 5) edge--;
  return edge;
}

function edgeAbove(pitch: number): number {
  let edge = pitch;
  while (edge % 12 !== 4 && edge % 12 !== 11) edge++;
  return Math.min(HIGHEST_MIDI, edge);
}

// Drums aren't pitches, so they neither fall nor stretch the range.
export function fitKeys(score: Score): readonly [number, number] {
  let lowest = Infinity;
  let highest = -Infinity;
  for (const track of score.tracks) {
    if (track.role === "drums") continue;
    for (const { pitch } of track.notes) {
      lowest = Math.min(lowest, pitch);
      highest = Math.max(highest, pitch);
    }
  }
  if (lowest > highest) return EMPTY_RANGE;
  let low = edgeBelow(lowest - MARGIN_PITCHES);
  let high = edgeAbove(highest + MARGIN_PITCHES);
  while (high - low < MIN_SPAN) {
    low = edgeBelow(low - 1);
    high = edgeAbove(high + 1);
  }
  return [low, high];
}

export function buildKeyboard(score: Score): Keyboard {
  const [low, high] = fitKeys(score);
  const time = timingOf(score);
  const byPitch = new Map<number, RollNote[]>();
  score.tracks.forEach((track, index) => {
    if (track.role === "drums") return;
    for (const note of track.notes) {
      const notes = byPitch.get(note.pitch) ?? [];
      notes.push({
        start: time.seconds(note.start),
        end: time.seconds(note.start + note.duration),
        velocity: note.velocity,
        track: index,
        key: noteKey(track.name, note.start, note.pitch),
      });
      byPitch.set(note.pitch, notes);
    }
  });

  const keys: Key[] = [];
  let whites = 0;
  for (let pitch = low; pitch <= high; pitch++) {
    const notes = (byPitch.get(pitch) ?? []).sort((a, b) => a.start - b.start);
    let furthest = -Infinity;
    const reach = notes.map(({ end }) => (furthest = Math.max(furthest, end)));
    const black = isBlack(pitch);
    const centre = whites + (BLACK_OFFSET[pitch % 12] ?? 0);
    const left = black ? centre - BLACK_WIDTH / 2 : whites;
    const right = black ? centre + BLACK_WIDTH / 2 : whites + 1;
    keys.push({ pitch, black, left, right, notes, reach });
    if (!black) whites++;
  }
  keys.sort((a, b) => Number(a.black) - Number(b.black));
  return { keys, whites };
}

// The notes on a key that overlap a span of time. Touches only those, whatever
// the piece's length.
export function notesIn(key: Key, from: number, to: number): RollNote[] {
  let low = 0;
  let high = key.reach.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (key.reach[middle] > from) high = middle;
    else low = middle + 1;
  }
  const found: RollNote[] = [];
  for (let index = low; index < key.notes.length; index++) {
    const note = key.notes[index];
    if (note.start >= to) break;
    if (note.end > from) found.push(note);
  }
  return found;
}

export interface RollLight {
  // Notes to light, by `noteKey`, and the tone they light in.
  notes: ReadonlySet<string> | null;
  tone: number;
  // A track to pick out, by index.
  focus: number | null;
}

const DIM = 0.14;

function paintRoll(canvas: HTMLCanvasElement, score: Score, keyboard: Keyboard, light: RollLight) {
  const draw = canvas.getContext("2d", { alpha: false });
  if (draw === null) throw new Error("Composer: no 2D canvas");
  const styles = getComputedStyle(canvas);
  const token = (name: string): string => styles.getPropertyValue(name);
  const colours = {
    roll: token("--color-surface-secondary"),
    octave: token("--color-surface-tertiary"),
    bar: token("--color-border-hover"),
    gap: token("--color-surface-primary"),
    whiteKey: token("--color-text-primary"),
    blackKey: token("--color-surface-primary"),
    edge: token("--color-border-hover"),
  };
  const trackColour = score.tracks.map((_, index) => token(toneVar(index + 1)));
  const litColour = token(toneVar(light.tone));
  const barLabel = token("--color-text-muted");
  const time = timingOf(score);
  const viewSeconds = Math.min(MAX_VIEW_SECONDS, Math.max(MIN_VIEW_SECONDS, (VIEW_BEATS * 60) / time.points[0].bpm));
  const barLength = barBeats(score);
  const barTimes = Array.from({ length: Math.ceil(scoreBeats(score) / barLength) + 1 }, (_, bar) => time.seconds(bar * barLength));
  const barsIn = (from: number, to: number): number[] => {
    const found: number[] = [];
    for (let bar = indexAt(barTimes, from) + 1; bar < barTimes.length && barTimes[bar] < to; bar++) found.push(bar);
    return found;
  };
  const pedals = allPedals(score).map(({ start, end }) => ({ start: time.seconds(start), end: time.seconds(end) }));

  let scale = 1;
  let width = 0;
  let height = 0;
  let keyTop = 0;
  let blackLength = 0;
  // Key edges land on whole device pixels, so no key blurs into its neighbour.
  let placed: { key: Key; x: number; width: number }[] = [];

  const resize = (): void => {
    scale = window.devicePixelRatio;
    width = Math.round(canvas.clientWidth * scale);
    height = Math.round(canvas.clientHeight * scale);
    canvas.width = width;
    canvas.height = height;
    const unit = width / keyboard.whites;
    const keyHeight = Math.min(height * MAX_KEYBOARD_SHARE, Math.max(MIN_KEYBOARD_HEIGHT * scale, unit * KEY_HEIGHT_IN_WIDTHS));
    keyTop = Math.round(height - keyHeight);
    blackLength = Math.round(keyHeight * BLACK_LENGTH);
    placed = keyboard.keys.map((key) => {
      const x = Math.round(key.left * unit);
      return { key, x, width: Math.round(key.right * unit) - x };
    });
  };

  // `view` is the time at the keyboard's edge; `at` is the time being heard,
  // or null when nothing is.
  const paint = (view: number, at: number | null): void => {
    // Not laid out yet, or in a collapsed pane.
    if (width === 0 || height === 0) return;
    const hair = Math.max(1, Math.round(scale));
    const pixelsPerSecond = keyTop / viewSeconds;
    const yOf = (time: number): number => keyTop - (time - view) * pixelsPerSecond;

    draw.fillStyle = colours.roll;
    draw.fillRect(0, 0, width, keyTop);

    draw.fillStyle = colours.octave;
    for (const { key, x } of placed) if (key.pitch % 12 === 0) draw.fillRect(x, 0, hair, keyTop);

    draw.fillStyle = colours.bar;
    for (const bar of barsIn(view, view + viewSeconds)) draw.fillRect(0, Math.round(yOf(barTimes[bar])), width, hair);

    // The pedal down, a band up the left edge.
    draw.fillStyle = colours.bar;
    for (const pedal of pedals) {
      if (pedal.end <= view || pedal.start >= view + viewSeconds) continue;
      const bottom = Math.min(keyTop, yOf(pedal.start));
      draw.fillRect(0, yOf(pedal.end) + hair, PEDAL_WIDTH * scale, bottom - yOf(pedal.end) - hair);
    }

    for (const { key, x, width: keyWidth } of placed) {
      for (const note of notesIn(key, view, view + viewSeconds)) {
        const bottom = yOf(note.start);
        const length = Math.max(MIN_NOTE_LENGTH * scale, (note.end - note.start) * pixelsPerSecond - hair);
        const left = x + hair;
        const noteWidth = Math.max(hair, keyWidth - hair * 2);
        // A black key's note crosses its white neighbours' columns, so it
        // gets a dark edge to stay readable over theirs.
        if (key.black) {
          draw.globalAlpha = 1;
          draw.fillStyle = colours.gap;
          draw.fillRect(x, bottom - length - hair, keyWidth, length + hair * 2);
        }
        const lit = light.notes?.has(note.key) === true;
        const dimmed = (light.notes !== null && !lit) || (light.focus !== null && note.track !== light.focus);
        draw.globalAlpha = dimmed ? DIM : lit ? 1 : 0.35 + 0.65 * note.velocity;
        draw.fillStyle = lit ? litColour : trackColour[note.track];
        draw.beginPath();
        draw.roundRect(left, bottom - length, noteWidth, length, Math.min(NOTE_RADIUS * scale, noteWidth / 2));
        draw.fill();
      }
    }
    draw.globalAlpha = 1;

    draw.fillStyle = barLabel;
    draw.font = `${String(BAR_LABEL * scale)}px sans-serif`;
    draw.textBaseline = "bottom";
    for (const bar of barsIn(view, view + viewSeconds)) draw.fillText(String(bar + 1), (3 + PEDAL_WIDTH) * scale, Math.round(yOf(barTimes[bar])) - hair);

    draw.fillStyle = colours.gap;
    draw.fillRect(0, keyTop, width, height - keyTop);
    for (const { key, x, width: keyWidth } of placed) {
      const sounding = at === null ? undefined : notesIn(key, at, at).at(-1);
      const lit = sounding === undefined ? undefined : trackColour[sounding.track];
      draw.fillStyle = lit ?? (key.black ? colours.blackKey : colours.whiteKey);
      if (key.black) draw.fillRect(x, keyTop, keyWidth, blackLength);
      else draw.fillRect(x, keyTop, keyWidth - hair, height - keyTop);
    }
    draw.fillStyle = colours.edge;
    draw.fillRect(0, keyTop, width, hair * 2);
  };

  return { resize, paint };
}

export function PianoRoll({ score, light }: { score: Score; light: RollLight }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (element === null) return;
    const roll = paintRoll(element, score, buildKeyboard(score), light);
    let scale = window.devicePixelRatio;
    let shownView = 0;
    let shownAt: number | null = null;

    const repaint = (view: number, at: number | null): void => {
      shownView = view;
      shownAt = at;
      roll.paint(view, at);
    };

    const fit = (): void => {
      scale = window.devicePixelRatio;
      roll.resize();
      repaint(shownView, shownAt);
    };

    const resizes = new ResizeObserver(fit);
    resizes.observe(element);

    let frame = requestAnimationFrame(function follow() {
      // Zooming and moving between screens change the ratio without a resize.
      if (window.devicePixelRatio !== scale) fit();
      const at = position();
      const view = cursor();
      if (view !== shownView || at !== shownAt) repaint(view, at);
      frame = requestAnimationFrame(follow);
    });

    return () => {
      cancelAnimationFrame(frame);
      resizes.disconnect();
    };
  }, [score, light]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden bg-surface-secondary">
      <canvas ref={canvas} role="img" aria-label={`Piano roll of ${score.title}`} className="block size-full" />
    </div>
  );
}
