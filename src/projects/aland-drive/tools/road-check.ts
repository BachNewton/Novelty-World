// The scripted driver down every motor road of the built tiles, in the simulation alone, on one core, reporting which
// roads shake the car. No browser and no network: it reads the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/road-check.ts [--folder=<tiles>] [--tile=<name>] [--cruise=<m/s>]
//
// By default each road is driven at a speed its class can carry, because a car thrown wide off a 2.5 m track at 150 km/h
// measures the driver, not the road. --cruise holds one speed on all of them.
//
// A wheel drop in the first LANDING_M only says the car was put down at the start of a road: the check counts those
// apart from drops on the way.

import RAPIER from "@dimforge/rapier3d-compat";
import { Autopilot } from "../sim/autopilot";
import { Drive, emptyLog, initPhysics } from "../sim/drive";
import { readWorld } from "../sim/read-tile";
import { throughLines } from "./road-lines";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY_TILE = option("tile", "");
const ONE_CRUISE_MS = Number(option("cruise", "0"));
const CRUISE_BY_KIND: Record<string, number> = { primary: 60, primary_link: 30, secondary: 50, secondary_link: 30, tertiary: 40, tertiary_link: 25, unclassified: 25, residential: 22, living_street: 12, service: 14, track: 12 };
const QUIET_ROAD_MS = 12;
const SHORTEST_LINE_M = 120;
const FROM_ALONG_M = 20;
const LANDING_M = 60;
const STEPS_PER_METRE_LIMIT = 8;
const LONGEST_SECONDS = 600;
const ROUGH_JOLT_G = 0.6;

await initPhysics();
void RAPIER;
const world = readWorld(FOLDER);
const lines = throughLines(world).filter(({ line, chains }) => line.length >= SHORTEST_LINE_M && (ONLY_TILE === "" || chains.some((chain) => chain.startsWith(`${ONLY_TILE}:`))));
const totalM = lines.reduce((sum, { line }) => sum + line.length, 0);
console.log(`${lines.length} lines, ${(totalM / 1000).toFixed(0)} km`);

const drive = new Drive(world, lines[0].line.at(FROM_ALONG_M));
interface Result {
  name: string;
  kind: string;
  km: number;
  chains: number;
  landing: number;
  dropsOnTheWay: number;
  worstJoltG: number;
  joltAtM: number;
  joltAt: [number, number];
  topKmh: number;
  respawns: number;
  offRoadM: number;
  finished: boolean;
}
const results: Result[] = [];
const started = process.hrtime.bigint();
let steps = 0;

for (const { name, kind, chains, line } of lines) {
  drive.placeAt(line.at(FROM_ALONG_M));
  drive.log = emptyLog();
  const pilot = new Autopilot(line, ONE_CRUISE_MS || (CRUISE_BY_KIND[kind] ?? QUIET_ROAD_MS), FROM_ALONG_M);
  const stepLimit = Math.min(120 * LONGEST_SECONDS, line.length * STEPS_PER_METRE_LIMIT + 120 * 40);
  let landing = 0;
  let afterLanding = false;
  let worst = 0;
  let joltAtM = 0;
  let joltAt: [number, number] = [0, 0];
  let step = 0;
  for (; step < stepLimit && !pilot.finished(); step++) {
    const state = drive.stateAt(1);
    drive.step(pilot.input(state));
    if (!afterLanding && drive.log.metres >= LANDING_M) {
      afterLanding = true;
      landing = drive.log.contactLosses;
      drive.log.worstJoltG = 0;
    }
    if (afterLanding && drive.log.worstJoltG > worst) {
      worst = drive.log.worstJoltG;
      joltAtM = pilot.along;
      const place = drive.stateAt(1).position;
      joltAt = [place[0], place[2]];
    }
  }
  steps += step;
  results.push({
    name,
    kind,
    km: line.length / 1000,
    chains: chains.length,
    landing,
    dropsOnTheWay: drive.log.contactLosses - landing,
    worstJoltG: worst,
    joltAtM,
    joltAt,
    topKmh: drive.log.topSpeedMS * 3.6,
    respawns: drive.log.respawns,
    offRoadM: drive.log.furthestOffRoadM,
    finished: pilot.finished(),
  });
}

const seconds = Number(process.hrtime.bigint() - started) / 1e9;
const round = (value: number, places = 2) => Number(value.toFixed(places));
const dropped = results.filter((result) => result.dropsOnTheWay > 0);
const landed = results.filter((result) => result.landing > 0);
const rough = results.filter((result) => result.worstJoltG > ROUGH_JOLT_G);
const lost = results.filter((result) => !result.finished || result.respawns > 0);
console.log(
  JSON.stringify({
    lines: results.length,
    km: round(totalM / 1000, 1),
    linesAcrossASeam: results.filter((result) => result.chains > 1).length,
    wheelDropsAtTheLanding: landed.reduce((sum, result) => sum + result.landing, 0),
    linesWithALandingDrop: landed.length,
    wheelDropsOnTheWay: dropped.reduce((sum, result) => sum + result.dropsOnTheWay, 0),
    linesWithDropsOnTheWay: dropped.length,
    linesOver: { [`${ROUGH_JOLT_G} g`]: rough.length },
    worstJoltG: round(Math.max(...results.map((result) => result.worstJoltG))),
    notFinished: lost.length,
    steps,
    wallSeconds: round(seconds, 1),
  }),
);
const worstFirst = [...results].sort((a, b) => b.worstJoltG - a.worstJoltG).slice(0, 12);
for (const result of worstFirst) console.log("rough:", JSON.stringify({ ...result, km: round(result.km), worstJoltG: round(result.worstJoltG), joltAtM: round(result.joltAtM, 0), joltAt: result.joltAt.map((value) => round(value, 0)), topKmh: round(result.topKmh, 0), offRoadM: round(result.offRoadM, 1) }));
for (const result of dropped.sort((a, b) => b.dropsOnTheWay - a.dropsOnTheWay).slice(0, 12)) console.log("drops:", JSON.stringify({ name: result.name, kind: result.kind, km: round(result.km), drops: result.dropsOnTheWay, joltAt: result.joltAt.map((value) => round(value, 0)) }));
for (const result of lost.slice(0, 12)) console.log("lost:", JSON.stringify({ name: result.name, kind: result.kind, km: round(result.km), respawns: result.respawns, finished: result.finished, offRoadM: round(result.offRoadM, 1) }));
drive.dispose();
