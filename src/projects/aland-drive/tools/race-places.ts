// The races' places on the real roads, from the hand-written list (`challenge/race-specs.ts`) and the built tiles: each
// race's route as the GPS sets it, its grid, its start line and one lap's lines, written to `challenge/race-places.json`.
// No browser and no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/race-places.ts [--folder=<tiles>] [--only=<id>]
//
// Run it after changing a race's waypoints or car, or after a rebuild of the roads, then `tools/race-laps.ts`: a test
// fails until both files match the list.
//
// How much of the race is gravel is kept too, which is what sorts it as road, cross country or off-road.
//
// The grid stands where a road of two lanes (a main road, a tertiary or a street, as `ideas/races.md` counts widths)
// takes the race's car two abreast, a lane each, for three rows: six places. A lane takes one car at a time, however wide
// it's laid, so on one, or a road that never takes two within reach of the start, the grid is four places in single
// file on the road's middle. The start line is a little ahead of the pole. A circuit's lap runs from the start line round to it again,
// with a line every 400 m or so, the last the start line itself; a sprint's lines run from the pole to its finish.
//
// Every place and line stands on the road as laid (`racers/laid-road.ts`, read along the route by `racers/route-plan.ts`),
// never on the GPS's own line, which is OpenStreetMap's and parts from the laid road by a road's width and more in places.

import { readFileSync, writeFileSync } from "node:fs";
import { challengeLine } from "../challenge/line";
import type { RacePlacesEntry } from "../challenge/measured";
import { RACE_SPECS, type RaceSpec } from "../challenge/race-specs";
import type { Gate, StartPlace } from "../challenge/types";
import { CARS } from "../sim/cars";
import { readWorld } from "../sim/read-tile";
import { RoadLine } from "../sim/road-net";
import type { World } from "../sim/world";
import { LaidRoad } from "../racers/laid-road";
import { RoutePlan } from "../racers/route-plan";
import { BEND_RADIANS, BEND_STEP_M, bendAt, FURTHEST_NUDGE_M, GATE_EVERY_M, GATE_PAST_SURFACE_M, gateAt, gravelShare, option, readRoads, roadsAlong, round, tilesUnder } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const OUT = "src/projects/aland-drive/challenge/race-places.json";

/** Clear of the junction or road end the route starts on, for the back of the grid. */
const FIRST_PLACE_M = 8;
const STEP_M = 5;
const FURTHEST_POLE_M = 500;
const ABREAST_ROWS = 3;
const SINGLE_FILE = 4;
/** From one row to the next: the longest car and a car's length between. */
const ROW_M = 10;
/** From the pole to the start line. */
const LINE_AHEAD_M = 6;
/** Room between two cars abreast, and from each to the middle of its lane. */
const BETWEEN_CARS_M = 0.6;
/** How far a car's side may stand past the carriageway's edge, on the shoulder. */
const ONTO_SHOULDER_M = 0.3;
const TWO_LANE_KINDS = new Set(["primary", "secondary", "tertiary", "residential"]);

const roads = readRoads(FOLDER);

/** The laid road's middle a distance along the route and the way it runs there, the route's way; the GPS line itself where none is laid. */
function middleAt(plan: RoutePlan, along: number): { x: number; z: number; heading: number } {
  const { x, z, heading, laid } = plan.at(along);
  return laid ? { x: laid.x, z: laid.z, heading: laid.heading } : { x, z, heading };
}

const placeAt = (plan: RoutePlan, along: number, right: number): StartPlace => {
  const { x, z, heading } = middleAt(plan, along);
  return { x: round(x + right * Math.cos(heading), 2), z: round(z - right * Math.sin(heading), 2), heading: round(heading, 4) };
};

/** How far right of the middle two abreast stand, or null where the carriageway doesn't take two of this car. */
function abreastAt(spec: RaceSpec, plan: RoutePlan, along: number): number | null {
  const halfWidth = CARS[spec.car].car.halfSize[0];
  const { laid } = plan.at(along);
  if (!laid || !TWO_LANE_KINDS.has(laid.kind)) return null;
  const carriagewayM = laid.leftM + laid.rightM;
  const offset = Math.max(carriagewayM / 4, halfWidth + BETWEEN_CARS_M / 2);
  return offset + halfWidth > carriagewayM / 2 + ONTO_SHOULDER_M ? null : offset;
}

/** The grid, pole first, and where the pole stands along the line. Two abreast, the pole on the right, as traffic keeps. */
function grid(spec: RaceSpec, plan: RoutePlan): { pole: number; places: StartPlace[] } {
  for (let pole = FIRST_PLACE_M + (ABREAST_ROWS - 1) * ROW_M; pole <= FURTHEST_POLE_M; pole += STEP_M) {
    const offsets = Array.from({ length: ABREAST_ROWS }, (_, row) => abreastAt(spec, plan, pole - row * ROW_M));
    if (offsets.some((offset) => offset === null)) continue;
    return { pole, places: offsets.flatMap((offset, row) => [placeAt(plan, pole - row * ROW_M, offset ?? 0), placeAt(plan, pole - row * ROW_M, -(offset ?? 0))]) };
  }
  const pole = FIRST_PLACE_M + (SINGLE_FILE - 1) * ROW_M;
  return { pole, places: Array.from({ length: SINGLE_FILE }, (_, place) => placeAt(plan, pole - place * ROW_M, 0)) };
}

/** A line across the laid road a distance along the route: on its middle, reaching across the whole surface and a gate's margin past it. */
function laidGateAt(plan: RoutePlan, world: World, along: number): Gate {
  const { laid } = plan.at(along);
  if (!laid) return gateAt(plan.line, world, along);
  // Square to the laid road, not to the GPS line, which can run at an angle to it where it strays.
  return { x: round(laid.x, 2), z: round(laid.z, 2), heading: round(laid.heading, 4), halfWidthM: round((laid.outerLeftM + laid.outerRightM) / 2 + GATE_PAST_SURFACE_M, 1) };
}

/** Gates every 400 m or so from one place along the route to another, each moved on to a straight, and the last at `to`. */
function laidGates(plan: RoutePlan, world: World, from: number, to: number): Gate[] {
  const laid: Gate[] = [];
  for (let along = from + GATE_EVERY_M; along < to - GATE_EVERY_M / 2; along += GATE_EVERY_M) {
    let at = along;
    while (bendAt(plan.line, at) > BEND_RADIANS && at < along + FURTHEST_NUDGE_M) at += BEND_STEP_M;
    laid.push(laidGateAt(plan, world, at));
  }
  laid.push(laidGateAt(plan, world, to));
  return laid;
}

/** A circuit's lap twice over, so a lap from the start line can be read past the loop's end. */
const twice = (lap: RoadLine) => new RoadLine(Float32Array.from([...lap.points, ...lap.points.slice(3)]));

const places = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, RacePlacesEntry>;
for (const spec of RACE_SPECS) {
  if (ONLY !== "" && spec.id !== ONLY) continue;
  const line = challengeLine(roads.graph, spec.waypoints);
  const world = readWorld(FOLDER, tilesUnder(roads.manifest, line));
  const circuit = spec.shape === "circuit";
  // A circuit's lap twice over, so a lap from the start line can be read past the loop's end.
  const plan = new RoutePlan(circuit ? twice(line) : line, new LaidRoad(world));
  const { pole, places: laid } = grid(spec, plan);
  const lineM = circuit ? pole + LINE_AHEAD_M : pole;
  const lapM = circuit ? line.length : line.length - pole;
  const entry: RacePlacesEntry = {
    madeFrom: { car: spec.car, waypoints: spec.waypoints },
    lineM: round(lineM, 1),
    lapM: round(lapM, 1),
    runInM: circuit ? LINE_AHEAD_M : 0,
    gravel: round(gravelShare(line, world, circuit ? 0 : pole), 2),
    grid: laid,
    gates: circuit ? laidGates(plan, world, lineM, lineM + lapM) : laidGates(plan, world, pole, line.length),
  };
  places[spec.id] = entry;
  console.log(`${spec.number} ${spec.id}: ${(lapM / 1000).toFixed(2)} km a ${circuit ? "lap" : "sprint"}, ${laid.length} on the grid, pole ${pole} m along, ${entry.gates.length} lines, ${(entry.gravel * 100).toFixed(0)}% gravel; ${roadsAlong(roads, line, pole, line.length)}`);
}
// In the list's order, and only what the list still has.
const kept = Object.fromEntries(RACE_SPECS.flatMap(({ id }) => (id in places ? [[id, places[id]]] : [])));
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
