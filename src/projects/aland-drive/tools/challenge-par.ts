// Each bucket list challenge driven solo, in its own car, by the scripted driver, in the simulation alone, through the
// challenge's own rules (`challenge/run.ts`): its par is the time at the finish or the speed at the camera. Each target
// is set from par by the one rule (`challenge/targets.ts`) at the difficulty the list asks for, and written with the par
// to `challenge/targets.json`. One core, no browser, no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/challenge-par.ts [--folder=<tiles>] [--only=<id>] [--profile]
//
// The driver goes flat out wherever the bends allow and brakes for each bend as late as a share of the car's own grip
// on the ground under it allows (`sim/car-limits.json`, dry), the boldest share it gets round at,
// from the first player's start place, held on the handbrake through the countdown. A run takes seconds. --profile
// prints the speed every 100 m, which is what a Speed trap's length is chosen from.

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { challengeLine, runOn } from "../challenge/line";
import { CHALLENGE_SPECS } from "../challenge/specs";
import { challengeFrom, placesPrint, type PlacesEntry, type TargetsEntry } from "../challenge/measured";
import { advanceRun, startRun, type ChallengeRun } from "../challenge/run";
import { difficultyOf, targetFromPar } from "../challenge/targets";
import type { Challenge } from "../challenge/types";
import { decodeRoadGraph, RoadGraph, type RoadMapFile } from "../map/road-graph";
import type { WorldManifest } from "../render/tile";
import { Autopilot, type SpeedPlan } from "../sim/autopilot";
import { NO_INPUT } from "../sim/car";
import { CAR_LIMITS, groundOf, tuningPrint } from "../sim/car-limits";
import { speedOf } from "../sim/car-state";
import { CARS } from "../sim/cars";
import { Drive, initPhysics } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import type { RoadLine } from "../sim/road-net";
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
 * The driver corners and brakes at all of the car's measured grip on the ground under it. That grip was measured on a
 * flat pad, so a crest, a camber or a rough track can ask for less: where the driver loses the road or stops, the run
 * starts again with the grip eased round that spot alone, until it gets there. So one bad bend slows par only there.
 */
const EASE_BY = 0.85;
const LEAST_SHARE = 0.3;
/** Round a spot where the driver lost it: mostly before it, where the braking for it happens. */
const EASE_BEFORE_M = 150;
const EASE_AFTER_M = 40;
const MOST_TRIES = 30;

/** A stretch of the route driven at a share of the grip. */
interface Eased {
  from: number;
  to: number;
  share: number;
}
/** How finely the ground along a route is read. */
const GROUND_STEP_M = 8;
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

/**
 * The grip on the ground under each stretch of the line, for this car: its carriageway's surface,
 * asphalt or gravel as the road is laid, and the limits table's least grip there, dry, cornering and braking.
 */
function speedPlan(challenge: Challenge, line: RoadLine, world: World, eased: readonly Eased[]): SpeedPlan {
  const limits = CAR_LIMITS[challenge.car].grounds;
  const least = (bands: readonly { g: number }[]) => Math.min(...bands.map(({ g }) => g)) * WORLD.gravity;
  const grips = { asphalt: limits[groundOf("dry", "asphalt")], gravel: limits[groundOf("dry", "gravel")] };
  const grip = {
    asphalt: { cornerMS2: least(grips.asphalt.corner), brakeMS2: least(grips.asphalt.braking) },
    gravel: { cornerMS2: least(grips.gravel.corner), brakeMS2: least(grips.gravel.braking) },
  };
  const stretches: (typeof grip.asphalt)[] = [];
  for (let along = 0; along <= line.length + RUN_ON_M + GROUND_STEP_M; along += GROUND_STEP_M) {
    const { x, z } = line.at(Math.min(along, line.length));
    stretches.push(world.roads.nearest(x, z)?.paved === false ? grip.gravel : grip.asphalt);
  }
  const shareAt = (along: number) => eased.find(({ from, to }) => along >= from && along <= to)?.share ?? 1;
  return {
    gripAt: (along) => {
      const { cornerMS2, brakeMS2 } = stretches[Math.max(0, Math.min(stretches.length - 1, Math.round(along / GROUND_STEP_M)))];
      const share = shareAt(along);
      return { cornerMS2: cornerMS2 * share, brakeMS2: brakeMS2 * share };
    },
    leastBrakeMS2: Math.min(grip.asphalt.brakeMS2, grip.gravel.brakeMS2) * Math.min(1, ...eased.map(({ share }) => share)),
  };
}

/** How much of the route is gravel, which is what its car should be chosen for. */
function gravelShare(line: RoadLine, world: World): number {
  let gravel = 0;
  let all = 0;
  for (let along = 0; along <= line.length; along += GROUND_STEP_M, all++) {
    const { x, z } = line.at(along);
    if (world.roads.nearest(x, z)?.paved === false) gravel++;
  }
  return gravel / all;
}

interface Measured {
  par: number;
  simS: number;
  profile: string[];
}

/** Par at one share of the car's grip, or why the driver didn't get there. */
function measure(challenge: Challenge, line: RoadLine, world: World, eased: readonly Eased[]): Measured | { failed: string; along: number } {
  const [place] = challenge.starts;
  const road = world.roads.nearest(place.x, place.z);
  if (!road) throw new Error(`${challenge.id}: no road at the start`);
  const drive = new Drive(world, { ...road, x: place.x, z: place.z, heading: place.heading }, challenge.car);
  const driven = runOn(line, RUN_ON_M);
  const pilot = new Autopilot(driven, FLAT_OUT_MS, 0, 0, undefined, speedPlan(challenge, driven, world, eased));
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
      const gates = challenge.kind === "route" ? `, before gate ${run.players[0].nextGate + 1} of ${challenge.gates.length}` : "";
      const where = `${sample.x.toFixed(0)}, ${sample.z.toFixed(0)}, ${pilot.along.toFixed(0)} m along${gates}`;
      if (Math.hypot(onLine.x - sample.x, onLine.z - sample.z) > LOST_M) return { failed: `lost the road at ${where}`, along: pilot.along };
      stoppedS = sample.speedMS < STOPPED_MS ? stoppedS + STEP_S : 0;
      if (stoppedS > GIVE_UP_STOPPED_S) return { failed: `stopped at ${where}`, along: pilot.along };
      if (PROFILE && pilot.along >= nextProfileM) {
        profile.push(`${nextProfileM} m ${(sample.speedMS * 3.6).toFixed(1)}`);
        nextProfileM += PROFILE_EVERY_M;
      }
    }
    return { failed: `not over after ${LONGEST_S} s`, along: Infinity };
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
  const eased: Eased[] = [];
  for (let tries = 0; tries < MOST_TRIES; tries++) {
    const attempt = measure(challenge, line, world, eased);
    if (!("failed" in attempt)) {
      measured = attempt;
      break;
    }
    const { failed, along } = attempt;
    const spot = eased.find(({ from, to }) => along >= from && along <= to);
    if (spot) {
      // Failing there again: gentler, and from further back, where a fast approach brakes for it.
      spot.share *= EASE_BY;
      spot.from -= EASE_BEFORE_M;
    }
    else eased.push({ from: along - EASE_BEFORE_M, to: along + EASE_AFTER_M, share: EASE_BY });
    const least = Math.min(...eased.map(({ share }) => share));
    console.log(`${spec.id}: ${failed}; easing ${eased.length} spot${eased.length === 1 ? "" : "s"}, the least to ${least.toFixed(2)} of its grip`);
    if (!Number.isFinite(along) || least < LEAST_SHARE) break;
  }
  if (!measured) throw new Error(`${spec.id}: the driver never got there`);
  const gripShare = eased.length === 0 ? "all" : `${eased.length} eased to ${Math.min(...eased.map(({ share }) => share)).toFixed(2)}`;
  const { par, simS, profile } = measured;
  const target = targetFromPar(spec.kind, par, spec.difficulty);
  targets[spec.id] = { tuning: tuningPrint(CARS[spec.car]), places: placesPrint(places), par: round(par, 2), target };
  const unit = spec.kind === "route" ? "s" : "km/h";
  rows.push([spec.id, spec.car, `${(places.lengthM / 1000).toFixed(2)} km`, `${(gravelShare(line, world) * 100).toFixed(0)}%`, gripShare, `${par.toFixed(1)} ${unit}`, `${target} ${unit}`, difficultyOf(challengeFrom(spec, places, { par, target })), `${simS.toFixed(0)} s`]);
  if (PROFILE) console.log(`${spec.id}: ${profile.join(", ")}`);
  console.log(`measured ${spec.id}: par ${par.toFixed(1)}, grip ${gripShare}`);
}
// In the list's order, and only what the list still has.
const kept = Object.fromEntries(CHALLENGE_SPECS.flatMap(({ id }) => (id in targets ? [[id, targets[id]]] : [])));
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
const head = ["challenge", "car", "length", "gravel", "grip", "par", "target", "difficulty", "driven"];
const widths = head.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
for (const row of [head, ...rows]) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
