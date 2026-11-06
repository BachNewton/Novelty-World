import placesFile from "./places.json";
import { challengeFrom, type PlacesEntry, type TargetsEntry } from "./measured";
import { CHALLENGE_SPECS, type ChallengeSpec } from "./specs";
import targetsFile from "./targets.json";
import type { Challenge } from "./types";

/*
 * The challenges as the game reads them: the hand-written list joined with what
 * was measured from it, its places on the roads and its par and target. A test
 * holds each measured entry to the list as it is now, so a change to a challenge
 * asks for it to be measured again.
 */

export const PLACES: Readonly<Record<string, PlacesEntry>> = placesFile;
export const TARGETS: Readonly<Record<string, TargetsEntry>> = targetsFile;

function joined(spec: ChallengeSpec): Challenge {
  const places = PLACES[spec.id] as PlacesEntry | undefined;
  const targets = TARGETS[spec.id] as TargetsEntry | undefined;
  if (!places || !targets) throw new Error(`${spec.id} hasn't been measured: run tools/challenge-places.ts, then tools/challenge-par.ts`);
  return challengeFrom(spec, places, targets);
}

export const CHALLENGES: readonly Challenge[] = CHALLENGE_SPECS.map(joined);

export function challengeById(id: string): Challenge {
  const challenge = CHALLENGES.find((each) => each.id === id);
  if (!challenge) throw new Error(`no challenge ${id}`);
  return challenge;
}
