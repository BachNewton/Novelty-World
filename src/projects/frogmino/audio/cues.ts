import { crossedFinish, type Run } from "../run";
import { passStreakSemitones, type SoundId } from "./sounds";

// Turns what changed in the game's state into sounds, so the rules never know
// about audio. Pure: the caller keeps the pass streak between calls.

export interface SoundCue {
  sound: SoundId;
  semitones?: number;
  // Whose frog it is, for a sound each frog makes: each player's keeps its
  // own minimum gap.
  voice?: number;
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

// The sounds between two moments of the game. A restart is silent and starts
// the streak over. Each pass of a row sounds once (a row the traffic brings
// round again is a new pass, and one going by beneath the frog on the
// gantry is no pass), each bonk once, a hop for each frog that starts one, in
// its own voice, the jump out of the helicopter and crossing the finish line.
export function soundCues(before: GameMoment, after: GameMoment, streak: number): Heard {
  if (after.runId !== before.runId) return { cues: [], streak: 0 };
  const was = before.run;
  const now = after.run;
  const cues: SoundCue[] = [];
  let next = streak;
  for (let i = now.passes - was.passes; i > 0; i--) {
    cues.push({ sound: "pass", semitones: passStreakSemitones(next) });
    next++;
  }
  if (now.lastBonk !== null && now.lastBonk.tick !== was.lastBonk?.tick) {
    cues.push({ sound: "bonk" });
    next = 0;
  }
  now.frogs.forEach((frog, i) => {
    if (frog.latestHop !== null && frog.latestHop.startedAt !== was.frogs[i].latestHop?.startedAt) cues.push({ sound: "hop", voice: i });
  });
  if (now.droppedAt !== null && was.droppedAt === null) cues.push({ sound: "drop" });
  if (crossedFinish(now) && !crossedFinish(was)) cues.push({ sound: "finish" });
  return { cues, streak: next };
}
