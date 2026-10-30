import { TICKS_PER_BEAT } from "./formats/events";
import type { Note, Role, Score, Track } from "./types";

// Standard MIDI files, format 1: a tempo track, then a track per part, so a
// piece opens in any notation program or DAW, and any MIDI file plays here.

const DRUM_CHANNEL = 9;

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

function chunk(id: string, body: readonly number[]): number[] {
  const length = body.length;
  return [
    ...[...id].map((letter) => letter.charCodeAt(0)),
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...body,
  ];
}

function bytesOf(text: string): number[] {
  return [...new TextEncoder().encode(text)];
}

function trackBody(track: Track, channel: number): number[] {
  const events = track.notes.flatMap((note) => {
    const on = Math.round(note.start * TICKS_PER_BEAT);
    const off = Math.round((note.start + note.duration) * TICKS_PER_BEAT);
    return [
      { tick: on, status: 0x90 | channel, pitch: note.pitch, velocity: Math.max(1, Math.round(note.velocity * 127)) },
      { tick: off, status: 0x80 | channel, pitch: note.pitch, velocity: 0 },
    ];
  });
  // At one tick, offs before ons, so a repeated pitch isn't cut short.
  events.sort((a, b) => a.tick - b.tick || a.status - b.status);
  const name = bytesOf(track.name);
  const body = [0, 0xff, 0x03, ...variableLength(name.length), ...name];
  let at = 0;
  for (const { tick, status, pitch, velocity } of events) {
    body.push(...variableLength(tick - at), status, pitch, velocity);
    at = tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  return body;
}

export function scoreToMidi(score: Score): Uint8Array<ArrayBuffer> {
  const tempo = Math.round(60_000_000 / score.bpm);
  const tempoTrack = [
    0, 0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff,
    0, 0xff, 0x58, 4, score.metre[0], Math.log2(score.metre[1]), 24, 8,
    0, 0xff, 0x2f, 0,
  ];
  let nextChannel = 0;
  const tracks = score.tracks.map((track) => {
    if (track.role === "drums") return trackBody(track, DRUM_CHANNEL);
    if (nextChannel === DRUM_CHANNEL) nextChannel++;
    return trackBody(track, nextChannel++);
  });
  return new Uint8Array([
    ...chunk("MThd", [0, 1, 0, tracks.length + 1, TICKS_PER_BEAT >> 8, TICKS_PER_BEAT & 0xff]),
    ...chunk("MTrk", tempoTrack),
    ...tracks.flatMap((body) => chunk("MTrk", body)),
  ]);
}

// A file's parts have no roles, so each is guessed from its register: drums
// from the drum channel, the lowest part as bass, the highest as lead.
function guessRoles(tracks: readonly { notes: Note[]; drums: boolean }[]): Role[] {
  const heights = tracks.map(({ notes }) => notes.reduce((sum, note) => sum + note.pitch, 0) / notes.length);
  const pitched = tracks.flatMap(({ drums }, index) => (drums ? [] : [index]));
  const lowest = pitched.reduce((a, b) => (heights[b] < heights[a] ? b : a), pitched[0]);
  const highest = pitched.reduce((a, b) => (heights[b] > heights[a] ? b : a), pitched[0]);
  return tracks.map(({ drums }, index) => {
    if (drums) return "drums";
    if (pitched.length === 1) return "keys";
    if (index === highest) return "lead";
    if (index === lowest) return "bass";
    return "keys";
  });
}

export function midiToScore(bytes: Uint8Array, title: string): Score {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (text(0) !== "MThd") throw new Error("MIDI: not a MIDI file");
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error("MIDI: time-code timing isn't supported");
  let bpm = 120;
  let metre: [number, number] = [4, 4];
  const parts = new Map<string, { name: string; notes: Note[]; drums: boolean }>();

  let at = 8 + view.getUint32(4);
  let trackIndex = 0;
  while (at < bytes.length) {
    if (text(at) !== "MTrk") throw new Error("MIDI: expected a track");
    const end = at + 8 + view.getUint32(at + 4);
    let cursor = at + 8;
    let tick = 0;
    let status = 0;
    let name = "";
    const readVariable = (): number => {
      let value = 0;
      for (;;) {
        const byte = bytes[cursor++];
        value = (value << 7) | (byte & 0x7f);
        if (byte < 0x80) return value;
      }
    };
    const sounding = new Map<string, { note: Note; tick: number }>();
    while (cursor < end) {
      tick += readVariable();
      if (bytes[cursor] >= 0x80) status = bytes[cursor++];
      if (status === 0xff) {
        const type = bytes[cursor++];
        const length = readVariable();
        if (type === 0x51) bpm = 60_000_000 / ((bytes[cursor] << 16) | (bytes[cursor + 1] << 8) | bytes[cursor + 2]);
        if (type === 0x58) metre = [bytes[cursor], 2 ** bytes[cursor + 1]];
        if (type === 0x03) name = new TextDecoder().decode(bytes.subarray(cursor, cursor + length));
        cursor += length;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        cursor += readVariable();
        continue;
      }
      const kind = status & 0xf0;
      const channel = status & 0x0f;
      if (kind === 0xc0 || kind === 0xd0) {
        cursor += 1;
        continue;
      }
      const pitch = bytes[cursor++];
      const velocity = bytes[cursor++];
      if (kind !== 0x90 && kind !== 0x80) continue;
      const key = `${String(channel)}:${String(pitch)}`;
      const held = sounding.get(key);
      if (held !== undefined) {
        held.note.duration = (tick - held.tick) / division;
        sounding.delete(key);
      }
      if (kind === 0x90 && velocity > 0) {
        const partKey = `${String(trackIndex)}:${String(channel)}`;
        const part = parts.get(partKey) ?? { name: name || `part-${String(parts.size + 1)}`, notes: [], drums: channel === DRUM_CHANNEL };
        parts.set(partKey, part);
        const note: Note = { pitch, start: tick / division, duration: 0, velocity: velocity / 127 };
        part.notes.push(note);
        sounding.set(key, { note, tick });
      }
    }
    at = end;
    trackIndex++;
  }

  const list = [...parts.values()];
  const roles = guessRoles(list);
  return {
    title,
    bpm,
    metre,
    key: "C",
    tracks: list.map(({ name, notes }, index) => ({ name, role: roles[index], notes })),
  };
}
