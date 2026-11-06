// Each circuit driven for one lap from the pole, in its own car, by the scripted driver that sets the challenges' par
// (`tools/par-driver.ts`), through the race's own rules (`challenge/run.ts`), dry: the lap sets how many make a race of
// about seven minutes and never more than ten (`ideas/races.md`, "Length"), written to `challenge/race-laps.json`. A
// sprint is one lap and isn't driven. One core, no browser, no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/race-laps.ts [--folder=<tiles>] [--only=<id>,<id>] [--out=<file>]
//
// This is a stand-in for the race vetting tool, which drives every car of the field in every condition from every place
// on the grid; that a lap can be driven at all is what it checks so far.

import { readFileSync, writeFileSync } from "node:fs";
import { timeText } from "../challenge/format";
import { raceRoute } from "../challenge/line";
import { placesPrint, raceFrom, type RaceLapsEntry, type RacePlacesEntry } from "../challenge/measured";
import { RACE_SPECS } from "../challenge/race-specs";
import { tuningPrint } from "../sim/car-limits";
import { CARS } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import { drivePar, gripShareText, tilesNear } from "./par-driver";
import { option, readRoads } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const OUT = option("out", "src/projects/aland-drive/challenge/race-laps.json");
const PLACES = JSON.parse(readFileSync("src/projects/aland-drive/challenge/race-places.json", "utf8")) as Record<string, RacePlacesEntry>;

/**
 * The nearest the driver aims on a track whose corner it can't make with its usual look, which cuts a tight corner: a
 * town's hairpin round a one-way block, with a lamp post on its kerb. Driven again with it only where the usual fails.
 */
const TIGHT_LOOK_M = 2.5;
/** A race of about this long, and never longer than the most, unless one lap is. */
const RACE_S = 420;
const LONGEST_RACE_S = 600;

const { graph, manifest } = readRoads(FOLDER);

await initPhysics();
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the caller named, or the list's own
const kept = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, RaceLapsEntry>;
for (const spec of RACE_SPECS) {
  if (ONLY !== "" && !ONLY.split(",").includes(spec.id)) continue;
  const places = PLACES[spec.id] as RacePlacesEntry | undefined;
  if (!places) throw new Error(`${spec.id} has no places: run tools/race-places.ts first`);
  const entry = { tuning: tuningPrint(CARS[spec.car]), places: placesPrint(places) };
  if (spec.shape === "sprint") {
    kept[spec.id] = { ...entry, laps: 1 };
    continue;
  }
  const race = raceFrom(spec, places, 1);
  const { line } = raceRoute(graph, race);
  const world = readWorld(FOLDER, tilesNear(manifest, line));
  const pole = places.lineM - places.runInM;
  const drive = (look?: number) => drivePar(race, line, pole, world, false, places.lapM, look);
  let lap: ReturnType<typeof drive>;
  try {
    lap = drive();
  } catch (error) {
    console.log(`${spec.id}: ${String(error)}; again, aiming no nearer than ${TIGHT_LOOK_M} m`);
    try {
      lap = drive(TIGHT_LOOK_M);
    } catch (again) {
      // The rest of the list is still measured; a race the driver can't get round is reported, and keeps what it had.
      console.log(`FAILED ${spec.number} ${spec.id}: ${String(again)}`);
      continue;
    }
  }
  const lapS = lap.measured.par;
  const laps = Math.max(1, Math.min(Math.round(RACE_S / lapS), Math.floor(LONGEST_RACE_S / lapS)));
  kept[spec.id] = { ...entry, laps };
  console.log(`${spec.number} ${spec.id}: a lap in ${timeText(lapS)}, ${laps} lap${laps === 1 ? "" : "s"}, grip ${gripShareText(lap.eased)}`);
}
// In the list's order, and only what the list still has.
const ordered = Object.fromEntries(RACE_SPECS.flatMap(({ id }) => (id in kept ? [[id, kept[id]]] : [])));
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the caller named, or the list's own
writeFileSync(OUT, `${JSON.stringify(ordered, null, 2)}\n`);
