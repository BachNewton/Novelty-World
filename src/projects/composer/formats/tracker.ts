import { parseNote } from "@/shared/lib/sound";
import { KICK, HAT, SNARE, ROLES, type Note, type Role, type Score, type Track } from "../types";

// A piece as tracker lines, Frogmino's way of writing music: one token per
// sixteenth, read like a drum machine's grid.
//
//   title: Example
//   bpm: 96
//   metre: 4/4
//   key: Am
//
//   lead melody: A4 . . - C5 . E5 . | D5 . . . - . . .
//   bass bass:   A2 . . . . . . . . | E2 . . . . . . .
//   lead melody: ...
//
// A line is a role, a track's name, then tokens. Lines of one track join end
// to end, so a repeat is a line written again; a note stops at its line's end.
// A note rings until the next
// note or a dash; a dot continues; k, s and h are the kick, snare and hat on
// a drums line. A note may carry .1 to .9 to be quieter, and a
// chord is notes joined with +, as C4+E4+G4.

const ROWS_PER_BEAT = 4;
const DRUMS: Record<string, number> = { k: KICK, s: SNARE, h: HAT };

function isRole(word: string): word is Role {
  return (ROLES as readonly string[]).includes(word);
}

function noteOn(token: string, row: number): Note[] {
  const drum = DRUMS[token] as number | undefined;
  if (drum !== undefined) return [{ pitch: drum, start: row / ROWS_PER_BEAT, duration: 0, velocity: 0.8 }];
  return token.split("+").map((name) => {
    const { semitone, quieter } = parseNote(name);
    // C4 is 48 semitones from C0 and MIDI note 60.
    return { pitch: semitone + 12, start: row / ROWS_PER_BEAT, duration: 0, velocity: 0.8 * (1 - quieter) };
  });
}

function readLine(tokens: readonly string[], firstRow: number, track: Track): void {
  let sounding: Note[] = [];
  const close = (row: number): void => {
    for (const note of sounding) note.duration = row / ROWS_PER_BEAT - note.start;
    sounding = [];
  };
  tokens.forEach((token, index) => {
    const row = firstRow + index;
    if (token === ".") return;
    close(row);
    if (token === "-") return;
    sounding = noteOn(token, row);
    track.notes.push(...sounding);
  });
  close(firstRow + tokens.length);
}

export function trackerScore(source: string): Score {
  const header = new Map<string, string>();
  const tracks = new Map<string, { track: Track; rows: number }>();
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon < 0) throw new Error(`Tracker: a line with no colon: "${line}"`);
    const head = line.slice(0, colon).trim().split(/\s+/);
    const rest = line.slice(colon + 1).trim();
    if (head.length === 1) {
      header.set(head[0], rest);
      continue;
    }
    const [role, name] = head;
    if (!isRole(role)) throw new Error(`Tracker: "${role}" is not a role, in "${line}"`);
    const entry = tracks.get(name) ?? { track: { name, role, notes: [] }, rows: 0 };
    tracks.set(name, entry);
    const tokens = rest.split(/\s+/).filter((token) => token !== "|");
    readLine(tokens, entry.rows, entry.track);
    entry.rows += tokens.length;
  }
  const field = (name: string): string => {
    const value = header.get(name);
    if (value === undefined) throw new Error(`Tracker: no ${name}:`);
    return value;
  };
  const [beats, unit] = field("metre").split("/").map(Number);
  return {
    title: field("title"),
    bpm: Number(field("bpm")),
    metre: [beats, unit],
    key: field("key"),
    tracks: [...tracks.values()].map(({ track }) => track),
  };
}
