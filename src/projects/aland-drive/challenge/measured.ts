import type { ChallengeSpec } from "./specs";
import type { Challenge, Gate, ScenePoint, StartPlace } from "./types";

/*
 * What is measured from a challenge on the roads, in the shapes its two files
 * keep: its places (`places.json`, `tools/challenge-places.ts`) and its par and
 * target (`targets.json`, `tools/challenge-par.ts`). Each entry says what it was
 * made from, so a test can tell when a change to the list needs it measured again.
 */

export interface PlacesEntry {
  madeFrom: { car: string; waypoints: ScenePoint[]; lengthM: number | null };
  lengthM: number;
  /** The first player's, then the second's. */
  starts: StartPlace[];
  gates?: Gate[];
  camera?: Gate;
}

export interface TargetsEntry {
  /** The car's tuning print and the places' print, as par was measured with them. */
  tuning: string;
  places: string;
  par: number;
  target: number;
}

/** A short print of a challenge's places: any change to them changes it. */
export function placesPrint(entry: PlacesEntry): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(entry)) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** A challenge from its spec, its places and its par and target. */
export function challengeFrom(spec: ChallengeSpec, places: PlacesEntry, { par, target }: { par: number; target: number }): Challenge {
  if (places.starts.length !== 2) throw new Error(`${spec.id} has ${places.starts.length} start places, not two`);
  const starts = [places.starts[0], places.starts[1]] as const;
  const common = { id: spec.id, title: spec.title, car: spec.car, where: spec.where, waypoints: spec.waypoints, starts, lengthM: places.lengthM };
  if (spec.kind === "route") {
    if (!places.gates) throw new Error(`${spec.id} is a Route with no gates`);
    return { ...common, kind: "route", gates: places.gates, parS: par, targetS: target };
  }
  if (!places.camera) throw new Error(`${spec.id} is a Speed trap with no camera`);
  return { ...common, kind: "speed-trap", camera: places.camera, parKmh: par, targetKmh: target };
}
