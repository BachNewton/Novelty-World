// The bucket list's places on the real roads, from the hand-written list (`challenge/specs.ts`) and the built tiles: each
// challenge's route as the GPS sets it, its start places (two side by side, and a row of two more for co-op's third and
// fourth players), its gates or its camera, written to
// `challenge/places.json`. No browser and no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/challenge-places.ts [--folder=<tiles>] [--only=<id>]
//
// Run it after changing a challenge's waypoints, length or car, or after a rebuild of the roads, then
// `tools/challenge-par.ts`: a test fails until both files match the list.
//
// Widths are the laid road's, read off the road surface: the start places stand where the carriageway takes two of the
// challenge's car side by side, a lane each, moving along the route until it does, and the second row a row behind
// them where the road takes two there too (ahead of them where it doesn't), and a gate stands on the laid road's
// own middle and reaches across the whole surface, shoulders and all, and a few metres past.

import { readFileSync, writeFileSync } from "node:fs";
import { challengeLine } from "../challenge/line";
import { CHALLENGE_SPECS, type ChallengeSpec } from "../challenge/specs";
import type { StartPlace } from "../challenge/types";
import type { PlacesEntry } from "../challenge/measured";
import { CARS } from "../sim/cars";
import { readWorld } from "../sim/read-tile";
import type { RoadLine } from "../sim/road-net";
import type { World } from "../sim/world";
import { gateAt, gates, option, readRoads, roadsAlong, round, tilesUnder, widthsAt } from "./road-places";

const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const ONLY = option("only", "");
const OUT = "src/projects/aland-drive/challenge/places.json";

/** Clear of the junction or road end the route starts on. */
const FIRST_START_M = 8;
const START_STEP_M = 5;
const FURTHEST_START_M = 400;
/** Room between the two cars, and from each to the middle of its lane. */
const BETWEEN_CARS_M = 0.6;
/** How far a car's side may stand past the carriageway's edge, on the shoulder. */
const ONTO_SHOULDER_M = 0.3;
/** From the first row of two to the second: the longest car and a car's length between. */
const ROW_M = 10;

const roads = readRoads(FOLDER);

/** Two of the challenge's car side by side here, a lane each, the first on the right as traffic keeps; null where the carriageway doesn't take them. */
function abreast(spec: ChallengeSpec, line: RoadLine, world: World, along: number): { places: [StartPlace, StartPlace]; carriagewayM: number } | null {
  const halfWidth = CARS[spec.car].car.halfSize[0];
  const { x, z, heading } = line.at(along);
  const { carriagewayM } = widthsAt(world, x, z);
  const offset = Math.max(carriagewayM / 4, halfWidth + BETWEEN_CARS_M / 2);
  if (offset + halfWidth > carriagewayM / 2 + ONTO_SHOULDER_M) return null;
  const [rightX, rightZ] = [Math.cos(heading), -Math.sin(heading)];
  const place = (side: number): StartPlace => ({ x: round(x + side * offset * rightX, 2), z: round(z + side * offset * rightZ, 2), heading: round(heading, 4) });
  return { places: [place(1), place(-1)], carriagewayM };
}

function startPlaces(spec: ChallengeSpec, line: RoadLine, world: World): { along: number; starts: [StartPlace, StartPlace]; carriagewayM: number } {
  for (let along = FIRST_START_M; along <= FURTHEST_START_M; along += START_STEP_M) {
    const first = abreast(spec, line, world, along);
    if (first) return { along, starts: first.places, carriagewayM: first.carriagewayM };
  }
  throw new Error(`${spec.id}: the road never takes two ${spec.car}s side by side within ${FURTHEST_START_M} m of the start`);
}

/** Co-op's third and fourth places: a row behind the first two, clear of the route's start, or a row ahead where the road behind doesn't take two. */
function secondRow(spec: ChallengeSpec, line: RoadLine, world: World, along: number): { row: [StartPlace, StartPlace]; behind: boolean } {
  const behind = along - ROW_M >= FIRST_START_M ? abreast(spec, line, world, along - ROW_M) : null;
  if (behind) return { row: behind.places, behind: true };
  for (let ahead = along + ROW_M; ahead <= along + 3 * ROW_M; ahead += START_STEP_M) {
    const row = abreast(spec, line, world, ahead);
    if (row) return { row: row.places, behind: false };
  }
  throw new Error(`${spec.id}: no second row of two ${spec.car}s within ${3 * ROW_M} m of the first`);
}

const places = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, PlacesEntry>;
for (const spec of CHALLENGE_SPECS) {
  if (ONLY !== "" && spec.id !== ONLY) continue;
  const line = challengeLine(roads.graph, spec.waypoints);
  const world = readWorld(FOLDER, tilesUnder(roads.manifest, line));
  const { along, starts, carriagewayM } = startPlaces(spec, line, world);
  const { row, behind } = secondRow(spec, line, world, along);
  const end = spec.lengthM === undefined ? line.length : along + spec.lengthM;
  if (end > line.length) throw new Error(`${spec.id}: ${spec.lengthM} m from the start is past the route's end`);
  const entry: PlacesEntry = {
    madeFrom: { car: spec.car, waypoints: spec.waypoints, lengthM: spec.lengthM ?? null },
    lengthM: round(end - along, 1),
    starts,
    moreStarts: row,
    ...(spec.kind === "route" ? { gates: gates(line, world, along, end) } : { camera: gateAt(line, world, end) }),
  };
  places[spec.id] = entry;
  console.log(`${spec.id}: ${(entry.lengthM / 1000).toFixed(2)} km, starting ${along} m along on ${carriagewayM.toFixed(1)} m of carriageway, the second row ${behind ? "behind" : "ahead"}, ${entry.gates ? `${entry.gates.length} gates` : "a camera"}; ${roadsAlong(roads, line, along, end)}`);
}
// In the list's order, and only what the list still has.
const kept = Object.fromEntries(CHALLENGE_SPECS.flatMap(({ id }) => (id in places ? [[id, places[id]]] : [])));
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
