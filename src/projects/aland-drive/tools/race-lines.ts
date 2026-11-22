// Every race's racing line, drawn from the built tiles and written for the game to fetch
// (`public/aland-drive/race-lines/<id>.json`, `racers/race-line-file.ts`): the minimum-curvature line through the
// laid carriageway for the widest car of the race's field (`racers/racing-line.ts`), with the road's surface along it.
// No browser and no network: it reads the road map and the tiles from disk, a few seconds a race. Each line is read
// against what stands beside it, and a stretch that passes nearer a wall than its car can is said: a building on the
// built road, or a gap in the laid road bridged across one. So is a finish with too little line past it for the
// finishers to stop clear of those still racing: a finish at a road's end.
//
//   npx tsx src/projects/aland-drive/tools/race-lines.ts [--folder=<tiles>] [--only=<id>,<id>]
//
// Run it after changing a race's waypoints, car or laps, or after a rebuild of the roads: a test holds each file to the
// list and the tiles' version as they are.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RACES } from "../challenge/list";
import { RACE_SPECS } from "../challenge/race-specs";
import { fieldOf } from "../racers/field";
import { RACE_LINES_FOLDER, raceLineFile } from "../racers/race-line-file";
import { loadRace, racingLineFor, type LoadedRace } from "../racers/vet";
import { CARS } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import type { RoadLine } from "../sim/road-net";
import { option, readRoads } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const OUT = join("public", RACE_LINES_FOLDER);

/** A line may pass this much nearer a wall than its car's half width before it is said, read every this far along it. */
const WALL_ROOM_M = 0.3;
const WALL_READ_M = 2;

/** Where a line passes nearer a wall than its car can: each stretch along it, with the nearest the line's middle comes. */
function wallsBeside({ walls }: LoadedRace, line: RoadLine, halfWidthM: number): string[] {
  const stretches: string[] = [];
  // The stretch the line is in, from where it began, or below zero while it is clear of every wall.
  let from = -1;
  let nearestIn = Infinity;
  for (let along = 0; along <= line.length; along += WALL_READ_M) {
    const { x, y, z } = line.at(along);
    const nearest = walls.nearestM(x, y, z, halfWidthM + WALL_ROOM_M);
    if (nearest < halfWidthM + WALL_ROOM_M) {
      if (from < 0) from = along;
      nearestIn = Math.min(nearestIn, nearest);
    } else if (from >= 0) {
      stretches.push(`${from}-${along} m (${nearestIn.toFixed(2)} m)`);
      from = -1;
      nearestIn = Infinity;
    }
  }
  if (from >= 0) stretches.push(`${from}-${line.length.toFixed(0)} m (${nearestIn.toFixed(2)} m)`);
  return stretches;
}

/** The finishers of a full grid stop past the finish and off the line: with less line than this past it, they stand in the way of those still racing. */
const PAST_FINISH_M = 60;
const FINISH_READ_M = 600;

/** How much of a line lies past the race's finish: the line's end less its nearest point to the finish, read back from its end. */
function pastFinishM(finish: { x: number; z: number }, line: RoadLine): number {
  let nearest = { distanceM: Infinity, along: line.length };
  for (let along = line.length; along >= Math.max(0, line.length - FINISH_READ_M); along -= 1) {
    const { x, z } = line.at(along);
    const distanceM = Math.hypot(x - finish.x, z - finish.z);
    if (distanceM < nearest.distanceM) nearest = { distanceM, along };
  }
  return line.length - nearest.along;
}

const roads = readRoads(FOLDER);
await initPhysics();
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the list's own folder under public/
mkdirSync(OUT, { recursive: true });
for (const spec of RACE_SPECS) {
  if (ONLY !== "" && !ONLY.split(",").includes(spec.id)) continue;
  const race = RACES.find(({ id }) => id === spec.id);
  if (!race) throw new Error(`${spec.id} isn't measured yet`);
  const loaded = loadRace(FOLDER, spec.id, roads);
  // The widest car of the field: a narrower one has the more room.
  const widest = fieldOf(race.car).reduce((best, car) => (CARS[car].car.halfSize[0] > CARS[best].car.halfSize[0] ? car : best));
  const drawn = racingLineFor(loaded, widest);
  const file = raceLineFile(spec, race.laps, roads.manifest.version, drawn);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the list's own folder, a file per race
  writeFileSync(join(OUT, `${spec.id}.json`), `${JSON.stringify(file)}\n`);
  const beside = wallsBeside(loaded, drawn.line, CARS[widest].car.halfSize[0]);
  const past = pastFinishM(race.gates[race.gates.length - 1], drawn.line);
  console.log(`${spec.number} ${spec.id}: ${file.points.length / 3} points over ${(drawn.line.length / 1000).toFixed(2)} km, for ${widest}${beside.length === 0 ? "" : `; NEARER A WALL THAN THE CAR CAN PASS at ${beside.join(", ")}`}${past >= PAST_FINISH_M ? "" : `; ONLY ${past.toFixed(0)} m OF LINE PAST ITS FINISH`}`);
}
