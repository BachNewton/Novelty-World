import type { RaceSpec } from "./race-specs";
import type { ChallengeSpec } from "./specs";
import { MOST_PLAYERS, type BucketChallenge, type Gate, type RaceChallenge, type ScenePoint, type StartPlace } from "./types";

/*
 * What is measured from a challenge on the roads, in the shapes its two files
 * keep: its places (`places.json`, `tools/challenge-places.ts`) and its par and
 * target (`targets.json`, `tools/challenge-par.ts`). Each entry says what it was
 * made from, so a test can tell when a change to the list needs it measured again.
 */

export interface PlacesEntry {
  madeFrom: { car: string; waypoints: ScenePoint[]; lengthM: number | null };
  lengthM: number;
  /** The first player's, then the second's, side by side. */
  starts: StartPlace[];
  /** Co-op's third and fourth players', a row behind or ahead of the first two. */
  moreStarts?: StartPlace[];
  gates?: Gate[];
  camera?: Gate;
}

export interface TargetsEntry {
  /** The car's tuning print, the places' print and the ground and tyres, as par was measured with them. */
  tuning: string;
  places: string;
  ground: string;
  par: number;
  target: number;
}

/**
 * A short print of a challenge's places, as its par or laps were measured on them: any change to them changes it. Co-op's
 * extra places aren't in it, since par and laps are driven from the first places alone.
 */
export function placesPrint(entry: PlacesEntry | RacePlacesEntry): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify({ ...entry, moreStarts: undefined, reserve: undefined })) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A challenge from its spec, its places and its par and target. */
export function challengeFrom(spec: ChallengeSpec, places: PlacesEntry, { par, target }: { par: number; target: number }): BucketChallenge {
  const starts = [...places.starts, ...(places.moreStarts ?? [])];
  if (starts.length !== MOST_PLAYERS) throw new Error(`${spec.id} has ${starts.length} start places, not ${MOST_PLAYERS}: run tools/challenge-places.ts`);
  const common = { id: spec.id, title: spec.title, car: spec.car, where: spec.where, waypoints: spec.waypoints, starts, lengthM: places.lengthM, conditions: spec.conditions };
  if (spec.kind === "route") {
    if (!places.gates) throw new Error(`${spec.id} is a Route with no gates`);
    return { ...common, kind: "route", gates: places.gates, parS: par, targetS: target };
  }
  if (!places.camera) throw new Error(`${spec.id} is a Speed trap with no camera`);
  return { ...common, kind: "speed-trap", camera: places.camera, parKmh: par, targetKmh: target };
}

/** A race's places on the roads (`race-places.json`, `tools/race-places.ts`). */
export interface RacePlacesEntry {
  madeFrom: { car: string; waypoints: ScenePoint[] };
  /** Along the route from its first waypoint to the start line: on a circuit, where every lap begins and ends; on a sprint, the pole. */
  lineM: number;
  /** A circuit's lap from the start line round to it, or a sprint's whole way from the pole to the finish. */
  lapM: number;
  /** On a circuit, from the pole up to the start line, which the first lap adds. */
  runInM: number;
  /** How much of the way is laid in gravel, the rest asphalt, which its ground has to agree with. */
  gravel: number;
  grid: StartPlace[];
  /** A single-file grid's places for a bigger co-op field, in the order they're taken: behind its back on a circuit, ahead of its pole on a sprint. */
  reserve?: StartPlace[];
  /** One lap's lines, the last the finish. */
  gates: Gate[];
}

/** A race's laps (`race-laps.json`, `tools/race-laps.ts`), with the car's tuning and the places' print they were measured with. */
export interface RaceLapsEntry {
  tuning: string;
  places: string;
  laps: number;
}

/** A race from its spec, its places and its laps. */
export function raceFrom(spec: RaceSpec, places: RacePlacesEntry, laps: number): RaceChallenge {
  if (places.grid.length < 2) throw new Error(`${spec.id} has ${places.grid.length} places on its grid`);
  return {
    id: spec.id,
    kind: "race",
    tier: spec.tier,
    number: spec.number,
    title: spec.title,
    shape: spec.shape,
    ground: spec.ground,
    car: spec.car,
    where: spec.where,
    waypoints: spec.waypoints,
    starts: [places.grid[0], places.grid[1]],
    grid: places.grid,
    reserve: places.reserve ?? [],
    gates: places.gates,
    laps,
    lapM: places.lapM,
    lineM: places.lineM,
    lengthM: spec.shape === "circuit" ? laps * places.lapM + places.runInM : places.lapM,
  };
}
