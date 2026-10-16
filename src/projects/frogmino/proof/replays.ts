import { PERCH_COURSE, perchReplay } from "./perch";
import type { ReplayData } from "./replay-data";
import { SAVED_REPLAYS } from "./saved-replays";

// Every replay `?replay=<name>` can show: the solver's proofs saved by the
// prove CLI, and the perch, made from the saved proof of its course.
export const REPLAYS: Readonly<Record<string, ReplayData>> = { perch: perchReplay(savedProof(`proof-${PERCH_COURSE.id}`)), ...SAVED_REPLAYS };

function savedProof(name: string): ReplayData {
  if (!Object.hasOwn(SAVED_REPLAYS, name)) throw new Error(`Frogmino: no saved proof "${name}"; save it with the prove CLI`);
  return SAVED_REPLAYS[name];
}

// A replay by name; fails loudly on one that doesn't exist, naming those that
// do.
export function findReplay(name: string): ReplayData {
  if (!Object.hasOwn(REPLAYS, name)) {
    throw new Error(`Frogmino: no replay "${name}"; the replays are ${Object.keys(REPLAYS).join(", ")}`);
  }
  return REPLAYS[name];
}
