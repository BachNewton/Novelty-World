// Each bucket list challenge driven solo, in its own car, by the scripted driver, in the simulation alone, through the
// challenge's own rules (`challenge/run.ts`): its par is the time at the finish or the speed at the camera. Each target
// is set from par by the one rule (`challenge/targets.ts`) at the difficulty the list asks for, and written with the par
// to `challenge/targets.json`. One core, no browser, no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/challenge-par.ts [--folder=<tiles>] [--only=<id>] [--profile]
//
// The driver goes flat out wherever the bends allow and brakes for each bend as late as a share of the car's own grip
// on the ground under it allows (`sim/limits/`, dry), the boldest share it gets round at,
// from the first player's start place, held on the handbrake through the countdown. A run takes seconds. --profile
// prints the speed every 100 m, which is what a Speed trap's length is chosen from.

import { readFileSync, writeFileSync } from "node:fs";
import { challengeLine } from "../challenge/line";
import { CHALLENGE_SPECS } from "../challenge/specs";
import { challengeFrom, placesPrint, type PlacesEntry, type TargetsEntry } from "../challenge/measured";
import { difficultyOf, targetFromPar } from "../challenge/targets";
import type { BucketChallenge } from "../challenge/types";
import { tuningPrint } from "../sim/car-limits";
import { CARS } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import { drivePar, gripShareText, tilesNear } from "./par-driver";
import { gravelShare, option, readRoads, round } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const PROFILE = process.argv.includes("--profile");
const OUT = "src/projects/aland-drive/challenge/targets.json";
const PLACES = JSON.parse(readFileSync("src/projects/aland-drive/challenge/places.json", "utf8")) as Record<string, PlacesEntry>;

const { graph, manifest } = readRoads(FOLDER);

await initPhysics();
const targets = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, TargetsEntry>;
const rows: string[][] = [];
for (const spec of CHALLENGE_SPECS) {
  if (ONLY !== "" && spec.id !== ONLY) continue;
  const places = PLACES[spec.id] as PlacesEntry | undefined;
  if (!places) throw new Error(`${spec.id} has no places: run tools/challenge-places.ts first`);
  const challenge = challengeFrom(spec, places, { par: 0, target: 0 });
  const line = challengeLine(graph, spec.waypoints);
  const world = readWorld(FOLDER, tilesNear(manifest, line));
  // Unbeatable while measuring: a Route is only lost against its target, which par is what sets.
  const unbounded: BucketChallenge = challenge.kind === "route" ? { ...challenge, targetS: Infinity } : { ...challenge, targetKmh: 0 };
  const { measured, eased } = drivePar(unbounded, line, 0, world, PROFILE);
  const gripShare = gripShareText(eased);
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
