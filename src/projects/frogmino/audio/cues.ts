import { isDone, type Run } from "../run";
import { passStreakSemitones, type SoundId } from "./sounds";

// Turns what changed in the game's state into sounds, so the rules never know
// about audio. Pure: the caller keeps the pass streak between calls.

export interface SoundCue {
  sound: SoundId;
  semitones?: number;
}

// The store's state as far as sound cares: the run, and which run it is.
export interface GameMoment {
  run: Run;
  runId: number;
}

export interface Heard {
  cues: SoundCue[];
  // Clean passes in a row, which the pass sound climbs a scale with.
  streak: number;
}

function newlyPassed(before: Run, after: Run): number {
  return after.walls.filter((wall, i) => wall.passed && !before.walls[i].passed).length;
}

// The sounds between two moments of the game. A restart is silent and starts
// the streak over. Each pass of a row sounds once (a row the traffic brings
// round again is a new pass), each bonk once, a hop as it starts, a change of
// piece (only a pull-off swap changes it) and reaching the end.
export function soundCues(before: GameMoment, after: GameMoment, streak: number): Heard {
  if (after.runId !== before.runId) return { cues: [], streak: 0 };
  const was = before.run;
  const now = after.run;
  const cues: SoundCue[] = [];
  let next = streak;
  for (let i = newlyPassed(was, now); i > 0; i--) {
    cues.push({ sound: "pass", semitones: passStreakSemitones(next) });
    next++;
  }
  if (now.lastBonk !== null && now.lastBonk.time !== was.lastBonk?.time) {
    cues.push({ sound: "bonk" });
    next = 0;
  }
  const hop = now.frog.latestHop;
  if (hop !== null && hop.startedAt !== was.frog.latestHop?.startedAt) cues.push({ sound: "hop" });
  if (now.frog.kind !== was.frog.kind) cues.push({ sound: "swap" });
  if (isDone(now) && !isDone(was)) cues.push({ sound: "finish" });
  return { cues, streak: next };
}
