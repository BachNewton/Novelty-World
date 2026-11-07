import placesFile from "./places.json";
import { challengeFrom, raceFrom, type PlacesEntry, type RaceLapsEntry, type RacePlacesEntry, type TargetsEntry } from "./measured";
import raceLapsFile from "./race-laps.json";
import racePlacesFile from "./race-places.json";
import { RACE_SPECS, type RaceSpec } from "./race-specs";
import { CHALLENGE_SPECS, type ChallengeSpec } from "./specs";
import targetsFile from "./targets.json";
import type { BucketChallenge, RaceChallenge } from "./types";

/*
 * The challenges and races as the game reads them: each hand-written list joined
 * with what was measured from it, its places on the roads and its par and
 * target, or a race's laps. A test
 * holds each measured entry to the list as it is now, so a change to a challenge
 * asks for it to be measured again.
 */

export const PLACES: Readonly<Record<string, PlacesEntry>> = placesFile;
export const TARGETS: Readonly<Record<string, TargetsEntry>> = targetsFile;

function joined(spec: ChallengeSpec): BucketChallenge {
  const places = PLACES[spec.id] as PlacesEntry | undefined;
  const targets = TARGETS[spec.id] as TargetsEntry | undefined;
  if (!places || !targets) throw new Error(`${spec.id} hasn't been measured: run tools/challenge-places.ts, then tools/challenge-par.ts`);
  return challengeFrom(spec, places, targets);
}

export const CHALLENGES: readonly BucketChallenge[] = CHALLENGE_SPECS.map(joined);

export const RACE_PLACES: Readonly<Record<string, RacePlacesEntry>> = racePlacesFile;
export const RACE_LAPS: Readonly<Record<string, RaceLapsEntry>> = raceLapsFile;

function joinedRace(spec: RaceSpec): RaceChallenge {
  const places = RACE_PLACES[spec.id] as RacePlacesEntry | undefined;
  const laps = RACE_LAPS[spec.id] as RaceLapsEntry | undefined;
  if (!places || !laps) throw new Error(`${spec.id} hasn't been measured: run tools/race-places.ts, then tools/race-laps.ts`);
  return raceFrom(spec, places, laps.laps);
}

export const RACES: readonly RaceChallenge[] = RACE_SPECS.map(joinedRace);

export function challengeById(id: string): BucketChallenge {
  const challenge = CHALLENGES.find((each) => each.id === id);
  if (!challenge) throw new Error(`no challenge ${id}`);
  return challenge;
}
