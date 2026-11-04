// Each bucket list challenge driven solo, in its own car, by the scripted driver, in the simulation alone, through the
// challenge's own rules (`challenge/run.ts`): its par is the time at the finish or the speed at the camera. Each target
// is set from par by the one rule (`challenge/targets.ts`) at the difficulty the list asks for, and written with the par
// to `challenge/targets.json`. One core, no browser, no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/challenge-par.ts [--folder=<tiles>] [--only=<id>] [--profile]
//
// The driver goes flat out wherever the bends allow and takes each bend at a share of the car's own measured grip
// (`sim/car-limits.json`), the boldest share it gets round at, from the first player's start place, held on the
// handbrake through the countdown. A run takes seconds; all twelve, well under a minute. --profile
// prints the speed every 100 m, which is what a Speed trap's length is chosen from.

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { challengeLine } from "../challenge/line";
import { CHALLENGE_SPECS } from "../challenge/specs";
import { challengeFrom, placesPrint, type PlacesEntry, type TargetsEntry } from "../challenge/measured";
import { advanceRun, startRun, type ChallengeRun } from "../challenge/run";
import { difficultyOf, targetFromPar } from "../challenge/targets";
import type { Challenge } from "../challenge/types";
import { decodeRoadGraph, RoadGraph, type RoadMapFile } from "../map/road-graph";
import type { WorldManifest } from "../render/tile";
import { Autopilot } from "../sim/autopilot";
import { NO_INPUT } from "../sim/car";
import { CAR_LIMITS, tuningPrint } from "../sim/car-limits";
import { speedOf } from "../sim/car-state";
import { CARS } from "../sim/cars";
import { Drive, initPhysics } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import { RoadLine } from "../sim/road-net";
import { STEP_S, WORLD } from "../sim/tuning";
import type { World } from "../sim/world";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const PROFILE = process.argv.includes("--profile");
const OUT = "src/projects/aland-drive/challenge/targets.json";
const PLACES = JSON.parse(readFileSync("src/projects/aland-drive/challenge/places.json", "utf8")) as Record<string, PlacesEntry>;

const FLAT_OUT_MS = 150;
/**
 * Shares of the car's least grip in a steady corner to take bends at, boldest first: the first the driver gets round
 * at, without rolling the car or losing the road, sets par. The driver can't trail-brake or pick a line, and on a rough
 * track a tall car rolls well short of its grip on the flat.
 */
const GRIP_SHARES = [0.9, 0.8, 0.7, 0.6, 0.5];
/** Past the finish, so the driver doesn't turn for the line's last point as it gets there. */
const RUN_ON_M = 150;
/** The ground is loaded this far round the car, and the tiles under it must have their detail. */
const GROUND_REACH_M = 400;
const LOST_M = 30;
const STOPPED_MS = 0.3;
const GIVE_UP_STOPPED_S = 10;
const LONGEST_S = 600;
const PROFILE_EVERY_M = 100;

const round = (value: number, places: number) => Number(value.toFixed(places));

// eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder the caller named
const mapBytes = gunzipSync(readFileSync(join(FOLDER, "map.json.gz")));
const graph = new RoadGraph(decodeRoadGraph(JSON.parse(mapBytes.toString("utf8")) as RoadMapFile, mapBytes.length));
// eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder the caller named
const manifest = JSON.parse(readFileSync(join(FOLDER, "world.json"), "utf8")) as WorldManifest;

function tilesNear(line: RoadLine): Set<string> {
  const names = new Set<string>();
  for (let along = 0; along <= line.length; along += GROUND_REACH_M / 2) {
    const { x, z } = line.at(along);
    for (const { name, west, north } of manifest.tiles) {
      if (x >= west - GROUND_REACH_M && x < west + manifest.tileM + GROUND_REACH_M && -z <= north + GROUND_REACH_M && -z > north - manifest.tileM - GROUND_REACH_M) names.add(name);
    }
  }
  return names;
}

/** The route and a straight run on past its end. */
function runOn(line: RoadLine): RoadLine {
  const end = line.at(line.length);
  const points = Float32Array.from([...line.points, end.x - Math.sin(end.heading) * RUN_ON_M, 0, end.z - Math.cos(end.heading) * RUN_ON_M]);
  return new RoadLine(points);
}

interface Measured {
  par: number;
  simS: number;
  profile: string[];
}

/** Par at one share of the car's grip, or why the driver didn't get there. */
function measure(challenge: Challenge, line: RoadLine, world: World, gripShare: number): Measured | { failed: string } {
  const [place] = challenge.starts;
  const road = world.roads.nearest(place.x, place.z);
  if (!road) throw new Error(`${challenge.id}: no road at the start`);
  const drive = new Drive(world, { ...road, x: place.x, z: place.z, heading: place.heading }, challenge.car);
  const cornerG = Math.min(...CAR_LIMITS[challenge.car].corner.map(({ g }) => g));
  const driven = runOn(line);
  const pilot = new Autopilot(driven, FLAT_OUT_MS, 0, 0, undefined, gripShare * cornerG * WORLD.gravity);
  // Unbeatable while measuring: a Route is only lost against its target, which par is what sets.
  const unbounded: Challenge = challenge.kind === "route" ? { ...challenge, targetS: Infinity } : { ...challenge, targetKmh: 0 };
  let run: ChallengeRun = startRun(unbounded, 1);
  const profile: string[] = [];
  let nextProfileM = PROFILE_EVERY_M;
  let stoppedS = 0;
  try {
    for (let step = 0; step < LONGEST_S / STEP_S; step++) {
      const state = drive.stateAt(1);
      const sample = { x: state.position[0], z: state.position[2], speedMS: speedOf(state) };
      run = advanceRun(run, STEP_S, [sample]).run;
      if (run.outcome) {
        const [par] = run.outcome.results;
        if (par === null) throw new Error(`${challenge.id}: over with no result`);
        return { par, simS: run.clockS, profile };
      }
      if (run.clockS < 0) {
        // The handbrake, not the brake: held at a standstill, the brake is reverse.
        drive.step({ ...NO_INPUT, handbrake: true });
        continue;
      }
      drive.step(pilot.input(state));
      const onLine = driven.at(pilot.along);
      const where = `${sample.x.toFixed(0)}, ${sample.z.toFixed(0)}, ${pilot.along.toFixed(0)} m along`;
      if (Math.hypot(onLine.x - sample.x, onLine.z - sample.z) > LOST_M) return { failed: `lost the road at ${where}` };
      stoppedS = sample.speedMS < STOPPED_MS ? stoppedS + STEP_S : 0;
      if (stoppedS > GIVE_UP_STOPPED_S) return { failed: `stopped at ${where}` };
      if (PROFILE && pilot.along >= nextProfileM) {
        profile.push(`${nextProfileM} m ${(sample.speedMS * 3.6).toFixed(1)}`);
        nextProfileM += PROFILE_EVERY_M;
      }
    }
    return { failed: `not over after ${LONGEST_S} s` };
  } finally {
    drive.dispose();
  }
}

await initPhysics();
const targets = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, TargetsEntry>;
const rows: string[][] = [];
for (const spec of CHALLENGE_SPECS) {
  if (ONLY !== "" && spec.id !== ONLY) continue;
  const places = PLACES[spec.id] as PlacesEntry | undefined;
  if (!places) throw new Error(`${spec.id} has no places: run tools/challenge-places.ts first`);
  const challenge = challengeFrom(spec, places, { par: 0, target: 0 });
  const line = challengeLine(graph, spec.waypoints);
  const world = readWorld(FOLDER, tilesNear(line));
  let measured: Measured | null = null;
  let gripShare = 0;
  for (const share of GRIP_SHARES) {
    const attempt = measure(challenge, line, world, share);
    if ("failed" in attempt) {
      console.log(`${spec.id} at ${share} of its grip: ${attempt.failed}`);
      continue;
    }
    [measured, gripShare] = [attempt, share];
    break;
  }
  if (!measured) throw new Error(`${spec.id}: the driver never got there`);
  const { par, simS, profile } = measured;
  const target = targetFromPar(spec.kind, par, spec.difficulty);
  targets[spec.id] = { tuning: tuningPrint(CARS[spec.car]), places: placesPrint(places), par: round(par, 2), target };
  const unit = spec.kind === "route" ? "s" : "km/h";
  rows.push([spec.id, spec.car, `${(places.lengthM / 1000).toFixed(2)} km`, String(gripShare), `${par.toFixed(1)} ${unit}`, `${target} ${unit}`, difficultyOf(challengeFrom(spec, places, { par, target })), `${simS.toFixed(0)} s`]);
  if (PROFILE) console.log(`${spec.id}: ${profile.join(", ")}`);
  console.log(`measured ${spec.id}`);
}
// In the list's order, and only what the list still has.
const kept = Object.fromEntries(CHALLENGE_SPECS.flatMap(({ id }) => (id in targets ? [[id, targets[id]]] : [])));
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
const head = ["challenge", "car", "length", "grip share", "par", "target", "difficulty", "driven"];
const widths = head.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
for (const row of [head, ...rows]) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
