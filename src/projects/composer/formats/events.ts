import { ROLES, type Role, type Score, type Track } from "../types";

// A piece as bare MIDI events, the way a MIDI file holds them, in numbers
// rather than note names: 480 ticks to the quarter, pitch and velocity from 0
// to 127.
//
//   title: Example
//   bpm: 96
//   metre: 4/4
//   key: Am
//
//   track lead melody
//   # tick length pitch velocity
//   0 480 69 90
//   480 240 72 84
//
//   track bass bass
//   0 1920 45 70

export const TICKS_PER_BEAT = 480;

function isRole(word: string): word is Role {
  return (ROLES as readonly string[]).includes(word);
}

export function eventsScore(source: string): Score {
  const header = new Map<string, string>();
  const tracks: Track[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("track ")) {
      const [, role, name] = line.split(/\s+/);
      if (!isRole(role)) throw new Error(`Events: "${role}" is not a role, in "${line}"`);
      tracks.push({ name, role, notes: [] });
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
  return { title: field("title"), bpm: Number(field("bpm")), metre: [beats, unit], key: field("key"), tracks };
}
