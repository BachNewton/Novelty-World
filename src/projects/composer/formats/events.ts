import { ROLES, type PedalSpan, type Role, type Score, type TempoPoint, type Track } from "../types";

// A piece as bare MIDI events, in numbers
// rather than note names: 480 ticks to the quarter, pitch and velocity from 0
// to 127. `tempo` changes the tempo at a tick; `glide` arrives at one by a tick,
// evenly from the last. `pedal` is down from a tick for a length: under a `track`
// line for that track, above them all for every track.
//
//   title: Example
//   bpm: 96
//   metre: 4/4
//   key: Am
//
//   tempo 3840 80
//   glide 7680 60
//   pedal 0 1920
//
//   track lead melody
//   # tick length pitch velocity
//   0 480 69 90
//   480 240 72 84
//
//   track bass bass
//   pedal 960 960
//   0 1920 45 70

const TICKS_PER_BEAT = 480;

function isRole(word: string): word is Role {
  return (ROLES as readonly string[]).includes(word);
}

export function eventsScore(source: string): Score {
  const header = new Map<string, string>();
  const tracks: Track[] = [];
  const changes: TempoPoint[] = [];
  const pedal: PedalSpan[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("track ")) {
      const [, role, name] = line.split(/\s+/);
      if (!isRole(role)) throw new Error(`Events: "${role}" is not a role, in "${line}"`);
      tracks.push({ name, role, notes: [] });
      continue;
    }
    const [word, ...rest] = line.split(/\s+/);
    if (word === "tempo" || word === "glide") {
      const [tick, bpm] = rest.map(Number);
      changes.push({ beat: tick / TICKS_PER_BEAT, bpm, ...(word === "glide" ? { glide: true } : {}) });
      continue;
    }
    if (word === "pedal") {
      const [tick, length] = rest.map(Number);
      const span = { start: tick / TICKS_PER_BEAT, end: (tick + length) / TICKS_PER_BEAT };
      const track = tracks.at(-1);
      if (track === undefined) pedal.push(span);
      else (track.pedal ??= []).push(span);
      continue;
    }
    const colon = line.indexOf(":");
    if (colon >= 0) {
      header.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      continue;
    }
    const numbers = line.split(/\s+/).map(Number);
    const track = tracks.at(-1);
    if (numbers.length !== 4 || numbers.some(Number.isNaN) || track === undefined) {
      throw new Error(`Events: not an event: "${line}"`);
    }
    const [tick, length, pitch, velocity] = numbers;
    track.notes.push({
      pitch,
      start: tick / TICKS_PER_BEAT,
      duration: length / TICKS_PER_BEAT,
      velocity: velocity / 127,
    });
  }
  const field = (name: string): string => {
    const value = header.get(name);
    if (value === undefined) throw new Error(`Events: no ${name}:`);
    return value;
  };
  const [beats, unit] = field("metre").split("/").map(Number);
  return { title: field("title"), tempo: [{ beat: 0, bpm: Number(field("bpm")) }, ...changes], pedal, metre: [beats, unit], key: field("key"), tracks };
}
