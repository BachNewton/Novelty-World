// Every race's racing line, drawn from the built tiles and written for the game to fetch
// (`public/aland-drive/race-lines/<id>.json`, `racers/race-line-file.ts`): the minimum-curvature line through the
// laid carriageway for the widest car of the race's field (`racers/racing-line.ts`), with the road's surface along it.
// No browser and no network: it reads the road map and the tiles from disk, a few seconds a race.
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
import { loadRace, racingLineFor } from "../racers/vet";
import { CARS } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import { option, readRoads } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const OUT = join("public", RACE_LINES_FOLDER);

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
  console.log(`${spec.number} ${spec.id}: ${file.points.length / 3} points over ${(drawn.line.length / 1000).toFixed(2)} km, for ${widest}`);
}
