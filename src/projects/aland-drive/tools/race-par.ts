// Each race driven solo from the pole, in its own car, by the scripted driver that sets the challenges' par
// (`tools/par-driver.ts`), through the race's own rules (`challenge/run.ts`), dry: its laps and its pace, written to
// `challenge/race-pace.json`. One core, no browser, no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/race-par.ts [--folder=<tiles>] [--only=<id>,<id>] [--out=<file>]
//
// A circuit is driven for one lap first, which sets how many laps make a race of about seven minutes and never more
// than ten (`ideas/races.md`, "Length"), and then for all of them; a sprint is the one run. The pace is the time at
// every line of every lap, which the rivals are timed by (`challenge/standings.ts`). This is a stand-in for the race
// vetting tool, which drives every car of the field in every condition from every place on the grid.

import { readFileSync, writeFileSync } from "node:fs";
import { raceRoute } from "../challenge/line";
import { placesPrint, raceFrom, type RacePaceEntry, type RacePlacesEntry } from "../challenge/measured";
import { RACE_SPECS } from "../challenge/race-specs";
import { rivalTimes } from "../challenge/standings";
import { timeText } from "../challenge/format";
import { tuningPrint } from "../sim/car-limits";
import { CARS } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import { drivePar, gravelShare, gripShareText, tilesNear } from "./par-driver";
import { option, readRoads, round } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const OUT = option("out", "src/projects/aland-drive/challenge/race-pace.json");
const PLACES = JSON.parse(readFileSync("src/projects/aland-drive/challenge/race-places.json", "utf8")) as Record<string, RacePlacesEntry>;

/**
 * The nearest the driver aims on a track whose corner it can't make with its usual look, which cuts a tight corner: a
 * town's hairpin round a one-way block, with a lamp post on its kerb. Driven again with it only where the usual fails.
 */
const TIGHT_LOOK_M = 2.5;
/** A race of about this long at par, and never longer than the most, unless one lap is. */
const RACE_S = 420;
const LONGEST_RACE_S = 600;

const { graph, manifest } = readRoads(FOLDER);

await initPhysics();
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the caller named, or the list's own
const paces = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, RacePaceEntry>;
const rows: string[][] = [];
for (const spec of RACE_SPECS) {
  if (ONLY !== "" && !ONLY.split(",").includes(spec.id)) continue;
  const places = PLACES[spec.id] as RacePlacesEntry | undefined;
  if (!places) throw new Error(`${spec.id} has no places: run tools/race-places.ts first`);
  const at = (laps: number) => raceFrom(spec, places, { laps, splits: new Array<number>(places.gates.length * laps).fill(0) });
  const pole = places.lineM - places.runInM;
  let look: number | undefined;
  const drive = (laps: number) => {
    const race = at(laps);
    const { line } = raceRoute(graph, race);
    const world = readWorld(FOLDER, tilesNear(manifest, line));
    const lapM = spec.shape === "circuit" ? places.lapM : undefined;
    if (look === undefined) {
      try {
        return { ...drivePar(race, line, pole, world, false, lapM), line, world };
      } catch (error) {
        console.log(`${spec.id}: ${String(error)}; again, aiming no nearer than ${TIGHT_LOOK_M} m`);
        look = TIGHT_LOOK_M;
      }
    }
    return { ...drivePar(race, line, pole, world, false, lapM, look), line, world };
  };
  let driven: ReturnType<typeof drive>;
  let laps = 1;
  try {
    const once = drive(1);
    laps = spec.shape === "circuit" ? Math.max(1, Math.min(Math.round(RACE_S / once.measured.par), Math.floor(LONGEST_RACE_S / once.measured.par))) : 1;
    driven = laps === 1 ? once : drive(laps);
  } catch (error) {
    // The rest of the list is still measured; a race the driver can't finish is reported, and keeps what it had.
    console.log(`FAILED ${spec.number} ${spec.id}: ${String(error)}`);
    continue;
  }
  const { measured, eased, line, world } = driven;
  const splits = measured.splits.map((split) => round(split, 2));
  paces[spec.id] = { tuning: tuningPrint(CARS[spec.car]), places: placesPrint(places), laps, splits };
  const race = raceFrom(spec, places, { laps, splits });
  const rivals = rivalTimes(race);
  rows.push([spec.number, spec.id, spec.car, `${(race.lengthM / 1000).toFixed(1)} km`, String(laps), `${(gravelShare(line, world) * 100).toFixed(0)}%`, gripShareText(eased), timeText(measured.par), `${timeText(rivals[0])} / ${timeText(rivals[1])} / ${timeText(rivals[2])}`]);
  console.log(`measured ${spec.number} ${spec.id}: ${laps} lap${laps === 1 ? "" : "s"}, par ${timeText(measured.par)}, grip ${gripShareText(eased)}`);
}
// In the list's order, and only what the list still has.
const kept = Object.fromEntries(RACE_SPECS.flatMap(({ id }) => (id in paces ? [[id, paces[id]]] : [])));
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the caller named, or the list's own
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
const head = ["#", "race", "car", "length", "laps", "gravel", "grip", "par", "gold / silver / bronze"];
const widths = head.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
for (const row of [head, ...rows]) console.log(row.map((cell, column) => cell.padEnd(widths[column])).join("  "));
