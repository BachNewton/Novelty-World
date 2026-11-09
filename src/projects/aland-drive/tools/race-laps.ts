// Each circuit driven for one lap from the pole, in its own car, by the racer itself (`racers/racer.ts`) on the racing
// line, dry, at the highest difficulty that gets round cleanly (`racers/difficulty.ts`), through the race's own rules
// (`challenge/run.ts`): the lap sets how many make a race of about seven minutes and never more than ten
// (`ideas/races.md`, "Length"), written to `challenge/race-laps.json`. A sprint is one lap and isn't driven. One core,
// no browser, no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/race-laps.ts [--folder=<tiles>] [--only=<id>,<id>] [--out=<file>]
//
// A race no level gets round cleanly takes the cleanest finish there is (the fewest resets, then the fewest hits) and
// says so; one no level finishes keeps what it had. The vetting tool (`tools/race-vet.ts`) says why.

import { readFileSync, writeFileSync } from "node:fs";
import { timeText } from "../challenge/format";
import { placesPrint, raceFrom, type RaceLapsEntry, type RacePlacesEntry } from "../challenge/measured";
import { RACE_SPECS } from "../challenge/race-specs";
import { DIFFICULTIES, SKILLS } from "../racers/difficulty";
import { tyresFor } from "../racers/field";
import { loadRaceOf, vetRun } from "../racers/vet";
import { tuningPrint } from "../sim/car-limits";
import { CARS } from "../sim/cars";
import { initPhysics } from "../sim/drive";
import { option, readRoads } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const OUT = option("out", "src/projects/aland-drive/challenge/race-laps.json");
const PLACES = JSON.parse(readFileSync("src/projects/aland-drive/challenge/race-places.json", "utf8")) as Record<string, RacePlacesEntry>;

/** A race of about this long, and never longer than the most, unless one lap is. */
const RACE_S = 420;
const LONGEST_RACE_S = 600;

const roads = readRoads(FOLDER);

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
  const loaded = loadRaceOf(FOLDER, raceFrom(spec, places, 1), roads);
  let lap: { skill: string; raceS: number; hits: number; resets: number } | null = null;
  for (const skill of [...DIFFICULTIES].reverse()) {
    const { cornerShare, brakeShare, throttleShare } = SKILLS[skill];
    const run = vetRun({ index: 0, race: spec.id, car: spec.car, condition: "dry", tyres: tyresFor("dry"), slot: 0, gripShare: cornerShare, brakeShare, throttleShare, skill, line: "racing", folder: FOLDER }, loaded);
    if (!run.finished || run.raceS === null) {
      console.log(`${spec.id} at ${skill}: ${run.failed ?? "failed"}`);
      continue;
    }
    const { hits, resets } = run;
    if (hits === 0 && resets === 0) {
      lap = { skill, raceS: run.raceS, hits, resets };
      break;
    }
    console.log(`${spec.id} at ${skill}: finished with ${hits} hit${hits === 1 ? "" : "s"} and ${resets} reset${resets === 1 ? "" : "s"}`);
    if (!lap || resets < lap.resets || (resets === lap.resets && hits < lap.hits)) lap = { skill, raceS: run.raceS, hits, resets };
  }
  if (!lap) {
    // The rest of the list is still measured; a race no racer gets round is reported, and keeps what it had.
    console.log(`FAILED ${spec.number} ${spec.id}: no level finishes`);
    continue;
  }
  const laps = Math.max(1, Math.min(Math.round(RACE_S / lap.raceS), Math.floor(LONGEST_RACE_S / lap.raceS)));
  kept[spec.id] = { ...entry, laps };
  const clean = lap.hits === 0 && lap.resets === 0 ? "" : `, the cleanest there is (${lap.hits} hit${lap.hits === 1 ? "" : "s"}, ${lap.resets} reset${lap.resets === 1 ? "" : "s"})`;
  console.log(`${spec.number} ${spec.id}: a lap in ${timeText(lap.raceS)} at ${lap.skill}${clean}, ${laps} lap${laps === 1 ? "" : "s"}`);
}
// In the list's order, and only what the list still has.
const ordered = Object.fromEntries(RACE_SPECS.flatMap(({ id }) => (id in kept ? [[id, kept[id]]] : [])));
// eslint-disable-next-line security/detect-non-literal-fs-filename -- the file the caller named, or the list's own
writeFileSync(OUT, `${JSON.stringify(ordered, null, 2)}\n`);
