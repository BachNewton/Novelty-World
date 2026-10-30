import abcjs from "abcjs";
import { ROLES, type Note, type Role, type Score, type Track } from "../types";

// A piece in ABC notation, the plain-text music notation folk tunes are
// shared in. abcjs reads it, and hands back timed notes with repeats, ties
// and dynamics played out.
//
// One thing is added: a comment line `%%role <voice number> <role> <name>`
// says what each voice (V:1, V:2…) does, since ABC has no such idea.

interface AudioNote {
  cmd: "note";
  pitch: number;
  // In whole notes.
  start: number;
  duration: number;
  volume: number;
}

function isRole(word: string): word is Role {
  return (ROLES as readonly string[]).includes(word);
}

function isNote(event: { cmd: string }): event is AudioNote {
  return event.cmd === "note";
}

function field(source: string, pattern: RegExp): string {
  const match = pattern.exec(source);
  if (match === null) throw new Error(`ABC: no field matching ${String(pattern)}`);
  return match[1].trim();
}

function declaredRoles(source: string): Map<number, { role: Role; name: string }> {
  const roles = new Map<number, { role: Role; name: string }>();
  for (const [, voice, role, name] of source.matchAll(/^%%role\s+(\d+)\s+(\w+)\s+(\S+)/gm)) {
    if (!isRole(role)) throw new Error(`ABC: "${role}" is not a role`);
    roles.set(Number(voice), { role, name });
  }
  return roles;
}

export function abcScore(source: string): Score {
  const [tune] = abcjs.parseOnly(source);
  const audio = tune.setUpAudio({ chordsOff: true }) as unknown as {
    tempo: number;
    tracks: { cmd: string }[][];
  };
  const roles = declaredRoles(source);
  const tracks: Track[] = audio.tracks.map((events, index) => {
    const notes: Note[] = events.filter(isNote).map((event) => ({
      pitch: event.pitch,
      start: event.start * 4,
      duration: event.duration * 4,
      velocity: Math.min(1, event.volume / 127),
    }));
    const declared = roles.get(index + 1) ?? { role: "keys" as const, name: `voice-${String(index + 1)}` };
    return { ...declared, notes };
  });
  const [beats, unit] = field(source, /^M:\s*(.+)$/m).split("/").map(Number);
  return {
    title: field(source, /^T:\s*(.+)$/m),
    bpm: audio.tempo,
    metre: [beats, unit],
    key: field(source, /^K:\s*(.+)$/m).split(/\s/)[0],
    tracks,
  };
}
