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

import { readFileSync, writeFileSync } from "node:fs";
import { challengeLine } from "../challenge/line";
import type { RacePlacesEntry } from "../challenge/measured";
import { RACE_SPECS, type RaceSpec } from "../challenge/race-specs";
import type { StartPlace } from "../challenge/types";
import { CARS } from "../sim/cars";
import { readWorld } from "../sim/read-tile";
import { RoadLine } from "../sim/road-net";
import type { World } from "../sim/world";
import { gates, gravelShare, option, readRoads, roadsAlong, round, tilesUnder, widthsAt } from "./road-places";

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

const placeAt = (line: RoadLine, along: number, right: number): StartPlace => {
  const { x, z, heading } = line.at(along);
  return { x: round(x + right * Math.cos(heading), 2), z: round(z - right * Math.sin(heading), 2), heading: round(heading, 4) };
};

/** How far right of the line two abreast stand, or null where the carriageway doesn't take two of this car. */
function abreastAt(spec: RaceSpec, line: RoadLine, world: World, along: number): number | null {
  const halfWidth = CARS[spec.car].car.halfSize[0];
  const { x, z } = line.at(along);
  const { carriagewayM, kind } = widthsAt(world, x, z);
  if (!TWO_LANE_KINDS.has(kind)) return null;
  const offset = Math.max(carriagewayM / 4, halfWidth + BETWEEN_CARS_M / 2);
  return offset + halfWidth > carriagewayM / 2 + ONTO_SHOULDER_M ? null : offset;
}

/** The grid, pole first, and where the pole stands along the line. Two abreast, the pole on the right, as traffic keeps. */
function grid(spec: RaceSpec, line: RoadLine, world: World): { pole: number; places: StartPlace[] } {
  for (let pole = FIRST_PLACE_M + (ABREAST_ROWS - 1) * ROW_M; pole <= FURTHEST_POLE_M; pole += STEP_M) {
    const offsets = Array.from({ length: ABREAST_ROWS }, (_, row) => abreastAt(spec, line, world, pole - row * ROW_M));
    if (offsets.some((offset) => offset === null)) continue;
    return { pole, places: offsets.flatMap((offset, row) => [placeAt(line, pole - row * ROW_M, offset ?? 0), placeAt(line, pole - row * ROW_M, -(offset ?? 0))]) };
  }
  const pole = FIRST_PLACE_M + (SINGLE_FILE - 1) * ROW_M;
  return { pole, places: Array.from({ length: SINGLE_FILE }, (_, place) => placeAt(line, pole - place * ROW_M, 0)) };
}

/** A circuit's lap twice over, so a lap from the start line can be read past the loop's end. */
const twice = (lap: RoadLine) => new RoadLine(Float32Array.from([...lap.points, ...lap.points.slice(3)]));

const places = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, RacePlacesEntry>;
for (const spec of RACE_SPECS) {
  if (ONLY !== "" && spec.id !== ONLY) continue;
  const line = challengeLine(roads.graph, spec.waypoints);
  const world = readWorld(FOLDER, tilesUnder(roads.manifest, line));
  const { pole, places: laid } = grid(spec, line, world);
  const circuit = spec.shape === "circuit";
  const lineM = circuit ? pole + LINE_AHEAD_M : pole;
  const lapM = circuit ? line.length : line.length - pole;
  const entry: RacePlacesEntry = {
    madeFrom: { car: spec.car, waypoints: spec.waypoints },
    lineM: round(lineM, 1),
    lapM: round(lapM, 1),
    runInM: circuit ? LINE_AHEAD_M : 0,
    gravel: round(gravelShare(line, world, circuit ? 0 : pole), 2),
    grid: laid,
    gates: circuit ? gates(twice(line), world, lineM, lineM + lapM) : gates(line, world, pole, line.length),
  };
  places[spec.id] = entry;
  console.log(`${spec.number} ${spec.id}: ${(lapM / 1000).toFixed(2)} km a ${circuit ? "lap" : "sprint"}, ${laid.length} on the grid, pole ${pole} m along, ${entry.gates.length} lines, ${(entry.gravel * 100).toFixed(0)}% gravel; ${roadsAlong(roads, line, pole, line.length)}`);
}
// In the list's order, and only what the list still has.
const kept = Object.fromEntries(RACE_SPECS.flatMap(({ id }) => (id in places ? [[id, places[id]]] : [])));
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
