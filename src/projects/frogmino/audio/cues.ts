import { crossedFinish, type Run } from "../run";
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

// The sounds between two moments of the game. A restart is silent and starts
// the streak over. Each pass of a row sounds once (a row the traffic brings
// round again is a new pass, and one going by beneath the frog on the
// overpass or the gantry is no pass), each bonk once, a hop as any frog starts one, the
// drop from the overpass, a change of piece (only a gate changes it, so each
// transformation sounds once, whichever way a frog went through) and
// crossing the finish line.
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
  const hopped = now.frogs.some((frog, i) => frog.latestHop !== null && frog.latestHop.startedAt !== was.frogs[i].latestHop?.startedAt);
  if (hopped) cues.push({ sound: "hop" });
  if (now.droppedAt !== null && was.droppedAt === null) cues.push({ sound: "drop" });
  if (now.frogs.some((frog, i) => frog.kind !== was.frogs[i].kind)) cues.push({ sound: "gate" });
  if (crossedFinish(now) && !crossedFinish(was)) cues.push({ sound: "finish" });
  return { cues, streak: next };
}
