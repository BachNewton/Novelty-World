// What the challenge and race place tools share: the road map and tiles read from disk, the laid road's widths at a
// place, and lines laid across it. No browser and no network.
//
// Widths are the laid road's, read off the road surface: a gate stands on the laid road's own middle and reaches across
// the whole surface, shoulders and all, and a few metres past.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import type { Gate } from "../challenge/types";
import { decodeRoadGraph, RoadGraph, type RoadMapFile } from "../map/road-graph";
import { RING_POINTS, type WorldManifest } from "../render/tile";
import type { RoadLine } from "../sim/road-net";
import type { World } from "../sim/world";

export const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;

const GATE_EVERY_M = 400;
// Narrow enough that a gate reads as the road's and a short cut across the fields misses it, forgiving enough for a fast
// line through a bend: the late-braking driver that sets par cuts the inside of one of Nötviken's gravel bends 4.7 m
// past the road's edge, the most of any gate on the list. It was 12 m when gates stood on the GPS line rather than the
// laid road's middle.
const GATE_PAST_SURFACE_M = 6;
/** A gate is moved on from a bend sharper than this over `BEND_READ_M` either side, so it lies square across a straight. */
const BEND_RADIANS = (25 * Math.PI) / 180;
const BEND_READ_M = 15;
const BEND_STEP_M = 10;
const FURTHEST_NUDGE_M = 120;
const RING_WITHIN_M = 12;
const SAMPLE_M = 50;
const CENTRE = 2;
/** How finely the ground along a route is read for its surface. */
const GROUND_STEP_M = 8;
/** A section that runs further than this off the route's way is another road's: a side road at a junction, a parallel drive. */
const SAME_WAY_COSINE = Math.cos((30 * Math.PI) / 180);

export const round = (value: number, places: number) => Number(value.toFixed(places));
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export interface Roads {
  graph: RoadGraph;
  mapFile: RoadMapFile;
  manifest: WorldManifest;
}

export function readRoads(folder: string): Roads {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder the caller named
  const mapBytes = gunzipSync(readFileSync(join(folder, "map.json.gz")));
  const mapFile = JSON.parse(mapBytes.toString("utf8")) as RoadMapFile;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder the caller named
  const manifest = JSON.parse(readFileSync(join(folder, "world.json"), "utf8")) as WorldManifest;
  return { graph: new RoadGraph(decodeRoadGraph(mapFile, mapBytes.length)), mapFile, manifest };
}

/** Every tile the line passes over. */
export function tilesUnder(manifest: WorldManifest, line: RoadLine): Set<string> {
  const names = new Set<string>();
  for (let along = 0; along <= line.length + SAMPLE_M; along += SAMPLE_M) {
    const { x, z } = line.at(along);
    const tile = manifest.tiles.find(({ west, north }) => x >= west && x < west + manifest.tileM && -z <= north && -z > north - manifest.tileM);
    if (tile) names.add(tile.name);
  }
  return names;
}

/**
 * The laid road's section nearest a place: its middle, its carriageway's width, and the whole surface's with its
 * shoulders. Given the way the route runs there, only a section running that way, or back along it, counts.
 */
export function widthsAt(world: World, x: number, z: number, heading?: number): { x: number; z: number; carriagewayM: number; surfaceM: number; kind: string } {
  let best: { distance: number; x: number; z: number; carriagewayM: number; surfaceM: number; kind: string } | null = null;
  for (const { detail } of world.all()) {
    if (!detail) continue;
    const { rings, chains } = detail.surface;
    for (const chain of chains) {
      if (!chain.motor) continue;
      for (let section = chain.first; section < chain.first + chain.sections; section++) {
        const point = (ring: number) => (section * RING_POINTS + ring) * 3;
        const distance = Math.hypot(rings[point(CENTRE)] - x, rings[point(CENTRE) + 2] - z);
        if (distance > RING_WITHIN_M || (best && distance >= best.distance)) continue;
        if (heading !== undefined) {
          const other = section + 1 < chain.first + chain.sections ? section + 1 : section - 1;
          const runX = rings[(other * RING_POINTS + CENTRE) * 3] - rings[point(CENTRE)];
          const runZ = rings[(other * RING_POINTS + CENTRE) * 3 + 2] - rings[point(CENTRE) + 2];
          const run = Math.hypot(runX, runZ);
          // A road line's heading points along (-sin, -cos).
          if (run === 0 || Math.abs((-runX * Math.sin(heading) - runZ * Math.cos(heading)) / run) < SAME_WAY_COSINE) continue;
        }
        const across = (a: number, b: number) => Math.hypot(rings[point(a)] - rings[point(b)], rings[point(a) + 2] - rings[point(b) + 2]);
        best = { distance, x: rings[point(CENTRE)], z: rings[point(CENTRE) + 2], carriagewayM: across(1, 3), surfaceM: across(0, 4), kind: chain.kind };
      }
    }
  }
  if (!best) throw new Error(`no laid road within ${RING_WITHIN_M} m of ${x.toFixed(0)}, ${z.toFixed(0)}`);
  return best;
}

export function gateAt(line: RoadLine, world: World, along: number): Gate {
  const { heading, ...onLine } = line.at(along);
  const { x, z, surfaceM } = widthsAt(world, onLine.x, onLine.z, heading);
  return { x: round(x, 2), z: round(z, 2), heading: round(heading, 4), halfWidthM: round(surfaceM / 2 + GATE_PAST_SURFACE_M, 1) };
}

const bendAt = (line: RoadLine, along: number) => Math.abs(wrap(line.at(along + BEND_READ_M).heading - line.at(along - BEND_READ_M).heading));

/** Gates every 400 m or so from one place along the line to another, each moved on to a straight, and the last at `to`. */
export function gates(line: RoadLine, world: World, from: number, to: number): Gate[] {
  const laid: Gate[] = [];
  for (let along = from + GATE_EVERY_M; along < to - GATE_EVERY_M / 2; along += GATE_EVERY_M) {
    let at = along;
    while (bendAt(line, at) > BEND_RADIANS && at < along + FURTHEST_NUDGE_M) at += BEND_STEP_M;
    laid.push(gateAt(line, world, at));
  }
  laid.push(gateAt(line, world, to));
  return laid;
}

/** How much of a stretch of the line is laid in gravel, the rest asphalt: what sorts a race's ground and a challenge's car. */
export function gravelShare(line: RoadLine, world: World, from = 0, to = line.length): number {
  let gravel = 0;
  let all = 0;
  for (let along = from; along <= to; along += GROUND_STEP_M, all++) {
    const { x, z } = line.at(along);
    if (world.roads.nearest(x, z)?.paved === false) gravel++;
  }
  return gravel / all;
}

/** The roads a stretch of the line runs on, by name and kind, for the log. */
export function roadsAlong({ graph, mapFile }: Roads, line: RoadLine, from: number, to: number): string {
  const names: string[] = [];
  for (let along = from; along <= to; along += 20) {
    const { x, z } = line.at(along);
    const spot = graph.nearest(x, z, 30);
    const name = spot ? `${graph.roadName(spot.edge) || "unnamed"} (${mapFile.kinds[graph.data.kind[spot.edge]]})` : "off the map";
    if (names[names.length - 1] !== name) names.push(name);
  }
  return names.join(", ");
}
