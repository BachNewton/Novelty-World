// The scripted driver through every junction of a tile, in the simulation alone, on one core: every motor road in to
// every road out, round a roundabout too, honouring one-way roads (`junction-moves.ts` says how). No browser and no
// network: it reads the tiles from disk, a tile and its neighbours. The movements come from the map's network, so a
// surface of any age can be driven and two can be compared with --out.
//
//   npx tsx src/projects/aland-drive/tools/junction-check.ts --tile=<name> [--folder=<tiles>] [--out=<jsonl>] [--near=<x,z,metres>] [--cruise=<m/s>]
//
// Each movement starts up to 120 m back and is judged over the junction and 40 m either side. A movement fails if the
// car doesn't get through, is put back on a road, or has its middle off the road surface (the ribbons, aprons and their
// shoulders) for more than a few metres there. Its worst jolt and wheel drops there are reported too, with where.

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import RAPIER from "@dimforge/rapier3d-compat";
import { decodeRoadGraph, type RoadMapFile } from "../map/road-graph";
import { Autopilot } from "../sim/autopilot";
import { speedOf } from "../sim/car-state";
import { Drive, emptyLog, initPhysics } from "../sim/drive";
import { readWorld, tilesAround } from "../sim/read-tile";
import { RoadLine } from "../sim/road-net";
import type { RibbonMesh } from "../render/roads";
import type { World } from "../sim/world";
import { JunctionFinder, type Movement } from "./junction-moves";

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const TILE = option("tile", "");
const OUT = option("out", "");
const NEAR = option("near", "").split(",").filter(Boolean).map(Number);
const ONE_CRUISE_MS = Number(option("cruise", "0"));
if (TILE === "") throw new Error("--tile=<name> says which tile");

/** A speed to carry straight through, lower than `road-check.ts`'s: nobody takes a junction at the road's top speed. */
const THROUGH_BY_KIND: Record<string, number> = { motorway: 30, trunk: 30, primary: 30, primary_link: 16, secondary: 27, secondary_link: 16, tertiary: 22, tertiary_link: 14, unclassified: 16, residential: 14, living_street: 8, service: 8, track: 8 };
const QUIET_ROAD_MS = 8;
const STRAIGHT_RADIANS = (30 * Math.PI) / 180;
const BEND_RADIANS = (60 * Math.PI) / 180;
const BEND_MS = 12;
const TURN_MS = 8;
const HAIRPIN_FROM_RADIANS = (100 * Math.PI) / 180;
const HAIRPIN_MS = 5;
const SHORTEST_LOOK_M = 5;
const JUDGED_BEYOND_M = 40;
/** The car settling on to its springs after being put down. */
const LANDING_M = 15;
const END_WITHIN_M = 3;
const LOST_M = 25;
/** Under the car's real pull away, so a run-up always gets there. */
const PULLS_AWAY_MS2 = 4;
const STOPPED_MS = 0.3;
const GIVE_UP_STOPPED_STEPS = 120 * 5;
const SPARE_STEPS = 120 * 30;
const SLOWEST_MS = 3;
const TOP_OF_THE_WORLD = 300;
const ROUGH_JOLT_G = 0.6;
const OFF_SURFACE_LIMIT_M = 3;
const COVER_CELL_M = 8;

/** Which road triangles lie under a place: the same triangles the car rolls on. */
class RoadCover {
  private readonly meshes: RibbonMesh[] = [];
  /** Pairs of (mesh, offset into its indices), by cell. */
  private readonly cells = new Map<number, number[]>();

  constructor(world: World) {
    for (const { detail } of world.all()) {
      if (!detail) continue;
      const mesh = this.meshes.push(detail.ribbon) - 1;
      const { positions, indices } = detail.ribbon;
      for (let triangle = 0; triangle < indices.length; triangle += 3) {
        const [a, b, c] = [indices[triangle] * 3, indices[triangle + 1] * 3, indices[triangle + 2] * 3];
        const west = Math.floor(Math.min(positions[a], positions[b], positions[c]) / COVER_CELL_M);
        const east = Math.floor(Math.max(positions[a], positions[b], positions[c]) / COVER_CELL_M);
        const top = Math.floor(Math.min(positions[a + 2], positions[b + 2], positions[c + 2]) / COVER_CELL_M);
        const bottom = Math.floor(Math.max(positions[a + 2], positions[b + 2], positions[c + 2]) / COVER_CELL_M);
        for (let row = top; row <= bottom; row++) {
          for (let column = west; column <= east; column++) {
            const key = column * 16384 + row;
            const cell = this.cells.get(key);
            if (cell) cell.push(mesh, triangle);
            else this.cells.set(key, [mesh, triangle]);
          }
        }
      }
    }
  }

  /** 2 on a carriageway, 1 on a shoulder, 0 off the road. */
  at(x: number, z: number): number {
    const cell = this.cells.get(Math.floor(x / COVER_CELL_M) * 16384 + Math.floor(z / COVER_CELL_M));
    if (!cell) return 0;
    let best = 0;
    for (let at = 0; at < cell.length; at += 2) {
      const { positions, indices, across } = this.meshes[cell[at]];
      const triangle = cell[at + 1];
      const [ia, ib, ic] = [indices[triangle], indices[triangle + 1], indices[triangle + 2]];
      const [ax, az, bx, bz, cx, cz] = [positions[ia * 3], positions[ia * 3 + 2], positions[ib * 3], positions[ib * 3 + 2], positions[ic * 3], positions[ic * 3 + 2]];
      const sides = [(bx - ax) * (z - az) - (bz - az) * (x - ax), (cx - bx) * (z - bz) - (cz - bz) * (x - bx), (ax - cx) * (z - cz) - (az - cz) * (x - cx)];
      if (!(sides.every((side) => side >= 0) || sides.every((side) => side <= 0))) continue;
      if (Math.max(Math.abs(across[ia]), Math.abs(across[ib]), Math.abs(across[ic])) <= 1) return 2;
      best = 1;
    }
    return best;
  }
}

await initPhysics();
// eslint-disable-next-line security/detect-non-literal-fs-filename -- a tile folder the caller named
const manifestBytes = gunzipSync(readFileSync(join(FOLDER, "map.json.gz")));
const file = JSON.parse(manifestBytes.toString("utf8")) as RoadMapFile;
const world = readWorld(FOLDER, tilesAround(FOLDER, TILE));
const tile = world.named(TILE);
const bounds = tile.detail?.manifest.bounds;
if (!bounds) throw new Error(`${TILE} has no detail`);
const finder = new JunctionFinder(decodeRoadGraph(file, manifestBytes.length), file.kinds);
const { moves, junctions, hairpins } = finder.movements((x, z) => -z <= bounds.north && -z > bounds.south && x >= bounds.west && x < bounds.east && (NEAR.length === 0 || Math.hypot(x - NEAR[0], z - NEAR[1]) <= NEAR[2]));
console.log(`${TILE}: ${junctions} junctions, ${moves.length} movements, ${moves.filter((move) => move.roundabout).length} of them round a roundabout, ${hairpins} hairpins left out, in ${FOLDER}`);
if (moves.length === 0) process.exit(0);
const cover = new RoadCover(world);

const speedFor = (move: Movement) => {
  if (ONE_CRUISE_MS > 0) return ONE_CRUISE_MS;
  if (move.roundabout) return TURN_MS;
  const through = Math.min(THROUGH_BY_KIND[move.from] ?? QUIET_ROAD_MS, THROUGH_BY_KIND[move.to] ?? QUIET_ROAD_MS);
  const turn = Math.abs(move.turn);
  if (turn >= HAIRPIN_FROM_RADIANS) return Math.min(through, HAIRPIN_MS);
  return turn <= STRAIGHT_RADIANS ? through : turn <= BEND_RADIANS ? Math.min(through, BEND_MS) : Math.min(through, TURN_MS);
};

/** The line from far enough back to reach a speed, and how far along that leaves the junction. */
const lineOf = (move: Movement, cruise: number) => {
  const dropped = Math.max(0, Math.floor(move.entersAt - LANDING_M - cruise ** 2 / (2 * PULLS_AWAY_MS2) - JUDGED_BEYOND_M));
  const count = move.line.length / 2 - dropped;
  const points = new Float32Array(count * 3);
  for (let at = 0; at < count; at++) {
    points[at * 3] = move.line[(at + dropped) * 2];
    points[at * 3 + 2] = move.line[(at + dropped) * 2 + 1];
  }
  return { line: new RoadLine(points), dropped };
};

interface Result {
  at: [number, number];
  from: string;
  to: string;
  roundabout: boolean;
  turnDegrees: number;
  cruiseMS: number;
  finished: boolean;
  respawns: number;
  /** Metres with the car's middle off any road surface, and off the carriageway, inside the judged stretch. */
  offSurfaceM: number;
  offCarriagewayM: number;
  drops: number;
  worstJoltG: number;
  joltAt: [number, number];
  endedAt: [number, number];
  verdict: string;
}

const round = (value: number, places = 2) => Number(value.toFixed(places));
const drive = new Drive(world, { ...lineOf(moves[0], TURN_MS).line.at(0), y: 0 });
const results: Result[] = [];

function placeOnSurface(line: RoadLine): void {
  const point = line.at(0);
  drive.ground.around(point.x, point.z);
  drive.rapier.step();
  const hit = drive.rapier.castRay(new RAPIER.Ray({ x: point.x, y: TOP_OF_THE_WORLD, z: point.z }, { x: 0, y: -1, z: 0 }), 2 * TOP_OF_THE_WORLD, true);
  if (!hit) throw new Error(`no ground at ${point.x}, ${point.z}`);
  drive.placeAt({ ...point, y: TOP_OF_THE_WORLD - hit.timeOfImpact });
}

for (const move of moves) {
  const cruise = speedFor(move);
  const { line, dropped } = lineOf(move, cruise);
  placeOnSurface(line);
  drive.log = emptyLog();
  const pilot = new Autopilot(line, cruise, 0, END_WITHIN_M, SHORTEST_LOOK_M);
  const limit = (line.length / Math.min(cruise, SLOWEST_MS)) * 120 + SPARE_STEPS;
  const judgedFrom = Math.max(LANDING_M, move.entersAt - dropped - JUDGED_BEYOND_M);
  const judgedTo = move.leavesAt - dropped + JUDGED_BEYOND_M;
  let judging = false;
  let dropsBefore = 0;
  let drops = 0;
  let worst = 0;
  let joltAt: [number, number] = [0, 0];
  let offSurfaceM = 0;
  let offCarriagewayM = 0;
  let stopped = 0;
  let last = drive.stateAt(1).position;
  let lost = false;
  for (let step = 0; step < limit && !pilot.finished() && stopped < GIVE_UP_STOPPED_STEPS && !lost; step++) {
    const state = drive.stateAt(1);
    drive.step(pilot.input(state));
    const now = drive.stateAt(1);
    const onLine = line.at(pilot.along);
    lost = Math.hypot(onLine.x - now.position[0], onLine.z - now.position[2]) > LOST_M;
    stopped = speedOf(now) < STOPPED_MS ? stopped + 1 : 0;
    if (!judging && pilot.along >= judgedFrom) {
      judging = true;
      dropsBefore = drive.log.contactLosses;
      drive.log.worstJoltG = 0;
    }
    if (judging && pilot.along <= judgedTo) {
      drops = drive.log.contactLosses - dropsBefore;
      if (drive.log.worstJoltG > worst) {
        worst = drive.log.worstJoltG;
        joltAt = [now.position[0], now.position[2]];
      }
      const moved = Math.hypot(now.position[0] - last[0], now.position[2] - last[2]);
      const under = cover.at(now.position[0], now.position[2]);
      if (under === 0) offSurfaceM += moved;
      if (under < 2) offCarriagewayM += moved;
    }
    last = now.position;
  }
  const finished = pilot.finished();
  const failed = lost ? "lost" : !finished ? "stuck" : drive.log.respawns > 0 ? "respawned" : offSurfaceM > OFF_SURFACE_LIMIT_M ? "off the road" : "";
  results.push({
    at: [round(move.x, 0), round(move.z, 0)],
    from: move.from,
    to: move.to,
    roundabout: move.roundabout,
    turnDegrees: round((move.turn * 180) / Math.PI, 0),
    cruiseMS: cruise,
    finished,
    respawns: drive.log.respawns,
    offSurfaceM: round(offSurfaceM, 1),
    offCarriagewayM: round(offCarriagewayM, 1),
    drops,
    worstJoltG: round(worst),
    joltAt: [round(joltAt[0], 1), round(joltAt[1], 1)],
    endedAt: [round(last[0], 0), round(last[2], 0)],
    verdict: failed,
  });
  if (results.length % 500 === 0) console.log(`${results.length} of ${moves.length}`);
}
drive.dispose();

const failures = results.filter((result) => result.verdict !== "");
const hasTrack = (result: Result) => result.from === "track" || result.to === "track";
const count = (verdict: string) => failures.filter((result) => result.verdict === verdict).length;
const rough = results.filter((result) => result.worstJoltG > ROUGH_JOLT_G);
const dropped = results.filter((result) => result.drops > 0);
console.log(
  JSON.stringify({
    tile: TILE,
    movements: results.length,
    finished: results.filter((result) => result.finished).length,
    failed: failures.length,
    stuck: count("stuck"),
    lost: count("lost"),
    respawned: count("respawned"),
    offTheRoad: count("off the road"),
    onShoulderOrWorse: results.filter((result) => result.offCarriagewayM > OFF_SURFACE_LIMIT_M).length,
    [`over ${ROUGH_JOLT_G} g`]: rough.length,
    withDrops: dropped.length,
    wheelDrops: dropped.reduce((sum, result) => sum + result.drops, 0),
    worstJoltG: Math.max(...results.map((result) => result.worstJoltG)),
    failedWithATrack: failures.filter(hasTrack).length,
    roundabouts: results.filter((result) => result.roundabout).length,
    roundaboutsFailed: failures.filter((result) => result.roundabout).length,
  }),
);
const brief = (result: Result) => JSON.stringify({ ...result, roundabout: result.roundabout || undefined, verdict: undefined, finished: undefined });
for (const result of failures.slice(0, 40)) console.log(`${result.verdict}: ${brief(result)}`);
for (const result of [...rough].sort((a, b) => b.worstJoltG - a.worstJoltG).slice(0, 15)) console.log(`rough: ${brief(result)}`);
if (OUT !== "") {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a report file the caller named
  writeFileSync(OUT, results.map((result) => JSON.stringify(result)).join("\n") + "\n");
}
