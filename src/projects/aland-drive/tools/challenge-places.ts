// The bucket list's places on the real roads, from the hand-written list (`challenge/specs.ts`) and the built tiles: each
// challenge's route as the GPS sets it, its two start places, its gates or its camera, written to
// `challenge/places.json`. No browser and no network: it reads the road map and the tiles from disk.
//
//   npx tsx src/projects/aland-drive/tools/challenge-places.ts [--folder=<tiles>] [--only=<id>]
//
// Run it after changing a challenge's waypoints, length or car, or after a rebuild of the roads, then
// `tools/challenge-par.ts`: a test fails until both files match the list.
//
// Widths are the laid road's, read off the road surface: the start places stand where the carriageway takes two of the
// challenge's car side by side, a lane each, moving along the route until it does, and a gate reaches across the whole
// surface, shoulders and all, and a few metres past.

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { challengeLine } from "../challenge/line";
import { CHALLENGE_SPECS, type ChallengeSpec } from "../challenge/specs";
import type { Gate, StartPlace } from "../challenge/types";
import type { PlacesEntry } from "../challenge/measured";
import { decodeRoadGraph, RoadGraph, type RoadMapFile } from "../map/road-graph";
import { RING_POINTS, type WorldManifest } from "../render/tile";
import { CARS } from "../sim/cars";
import { readWorld } from "../sim/read-tile";
import type { RoadLine } from "../sim/road-net";
import type { World } from "../sim/world";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
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
const GATE_EVERY_M = 400;
// Generous, as a checkpoint should be: the GPS line can lie a few metres off the road as laid, and a car cutting a bend lies further.
const GATE_PAST_SURFACE_M = 12;
/** A gate is moved on from a bend sharper than this over `BEND_READ_M` either side, so it lies square across a straight. */
const BEND_RADIANS = (25 * Math.PI) / 180;
const BEND_READ_M = 15;
const BEND_STEP_M = 10;
const FURTHEST_NUDGE_M = 120;
const RING_WITHIN_M = 12;
const SAMPLE_M = 50;
const CENTRE = 2;

const round = (value: number, places: number) => Number(value.toFixed(places));
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

// eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder the caller named
const mapBytes = gunzipSync(readFileSync(join(FOLDER, "map.json.gz")));
const mapFile = JSON.parse(mapBytes.toString("utf8")) as RoadMapFile;
const graph = new RoadGraph(decodeRoadGraph(mapFile, mapBytes.length));
// eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder the caller named
const manifest = JSON.parse(readFileSync(join(FOLDER, "world.json"), "utf8")) as WorldManifest;

/** Every tile the line passes over. */
function tilesUnder(line: RoadLine): Set<string> {
  const names = new Set<string>();
  for (let along = 0; along <= line.length + SAMPLE_M; along += SAMPLE_M) {
    const { x, z } = line.at(along);
    const tile = manifest.tiles.find(({ west, north }) => x >= west && x < west + manifest.tileM && -z <= north && -z > north - manifest.tileM);
    if (tile) names.add(tile.name);
  }
  return names;
}

/** The laid road's widths at its section nearest a place: the carriageway, and the whole surface with its shoulders. */
function widthsAt(world: World, x: number, z: number): { carriagewayM: number; surfaceM: number; kind: string } {
  let best: { distance: number; carriagewayM: number; surfaceM: number; kind: string } | null = null;
  for (const { detail } of world.all()) {
    if (!detail) continue;
    const { rings, chains } = detail.surface;
    for (const chain of chains) {
      if (!chain.motor) continue;
      for (let section = chain.first; section < chain.first + chain.sections; section++) {
        const point = (ring: number) => (section * RING_POINTS + ring) * 3;
        const distance = Math.hypot(rings[point(CENTRE)] - x, rings[point(CENTRE) + 2] - z);
        if (distance > RING_WITHIN_M || (best && distance >= best.distance)) continue;
        const across = (a: number, b: number) => Math.hypot(rings[point(a)] - rings[point(b)], rings[point(a) + 2] - rings[point(b) + 2]);
        best = { distance, carriagewayM: across(1, 3), surfaceM: across(0, 4), kind: chain.kind };
      }
    }
  }
  if (!best) throw new Error(`no laid road within ${RING_WITHIN_M} m of ${x.toFixed(0)}, ${z.toFixed(0)}`);
  return best;
}

function startPlaces(spec: ChallengeSpec, line: RoadLine, world: World): { along: number; starts: [StartPlace, StartPlace]; carriagewayM: number } {
  const halfWidth = CARS[spec.car].car.halfSize[0];
  for (let along = FIRST_START_M; along <= FURTHEST_START_M; along += START_STEP_M) {
    const { x, z, heading } = line.at(along);
    const { carriagewayM } = widthsAt(world, x, z);
    const offset = Math.max(carriagewayM / 4, halfWidth + BETWEEN_CARS_M / 2);
    if (offset + halfWidth > carriagewayM / 2 + ONTO_SHOULDER_M) continue;
    const [rightX, rightZ] = [Math.cos(heading), -Math.sin(heading)];
    const place = (side: number): StartPlace => ({ x: round(x + side * offset * rightX, 2), z: round(z + side * offset * rightZ, 2), heading: round(heading, 4) });
    return { along, starts: [place(1), place(-1)], carriagewayM };
  }
  throw new Error(`${spec.id}: the road never takes two ${spec.car}s side by side within ${FURTHEST_START_M} m of the start`);
}

function gateAt(line: RoadLine, world: World, along: number): Gate {
  const { x, z, heading } = line.at(along);
  const { surfaceM } = widthsAt(world, x, z);
  return { x: round(x, 2), z: round(z, 2), heading: round(heading, 4), halfWidthM: round(surfaceM / 2 + GATE_PAST_SURFACE_M, 1) };
}

const bendAt = (line: RoadLine, along: number) => Math.abs(wrap(line.at(along + BEND_READ_M).heading - line.at(along - BEND_READ_M).heading));

function gates(line: RoadLine, world: World, from: number, to: number): Gate[] {
  const laid: Gate[] = [];
  for (let along = from + GATE_EVERY_M; along < to - GATE_EVERY_M / 2; along += GATE_EVERY_M) {
    let at = along;
    while (bendAt(line, at) > BEND_RADIANS && at < along + FURTHEST_NUDGE_M) at += BEND_STEP_M;
    laid.push(gateAt(line, world, at));
  }
  laid.push(gateAt(line, world, to));
  return laid;
}

function roadsAlong(line: RoadLine, from: number, to: number): string {
  const names: string[] = [];
  for (let along = from; along <= to; along += 20) {
    const { x, z } = line.at(along);
    const spot = graph.nearest(x, z, 30);
    const name = spot ? `${graph.roadName(spot.edge) || "unnamed"} (${mapFile.kinds[graph.data.kind[spot.edge]]})` : "off the map";
    if (names[names.length - 1] !== name) names.push(name);
  }
  return names.join(", ");
}

const places = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, PlacesEntry>;
for (const spec of CHALLENGE_SPECS) {
  if (ONLY !== "" && spec.id !== ONLY) continue;
  const line = challengeLine(graph, spec.waypoints);
  const world = readWorld(FOLDER, tilesUnder(line));
  const { along, starts, carriagewayM } = startPlaces(spec, line, world);
  const end = spec.lengthM === undefined ? line.length : along + spec.lengthM;
  if (end > line.length) throw new Error(`${spec.id}: ${spec.lengthM} m from the start is past the route's end`);
  const entry: PlacesEntry = {
    madeFrom: { car: spec.car, waypoints: spec.waypoints, lengthM: spec.lengthM ?? null },
    lengthM: round(end - along, 1),
    starts,
    ...(spec.kind === "route" ? { gates: gates(line, world, along, end) } : { camera: gateAt(line, world, end) }),
  };
  places[spec.id] = entry;
  console.log(`${spec.id}: ${(entry.lengthM / 1000).toFixed(2)} km, starting ${along} m along on ${carriagewayM.toFixed(1)} m of carriageway, ${entry.gates ? `${entry.gates.length} gates` : "a camera"}; ${roadsAlong(line, along, end)}`);
}
// In the list's order, and only what the list still has.
const kept = Object.fromEntries(CHALLENGE_SPECS.flatMap(({ id }) => (id in places ? [[id, places[id]]] : [])));
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
