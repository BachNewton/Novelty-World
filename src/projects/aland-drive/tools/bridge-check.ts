// Every span of the built tiles, driven in the simulation alone: over each one from before it to past it, both ways,
// loading only the tiles round it. Prints each span's length, its height above what's under it, and how the crossing
// went. No browser and no network.
//
//   npx tsx src/projects/aland-drive/tools/bridge-check.ts [--folder=<tiles>] [--shortest=<metres>]

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RING_POINTS, decodeHeights, type TileManifest, type WorldManifest } from "../render/tile";
import { decodeSolids } from "../render/solids";
import { gunzipSync } from "node:zlib";
import { Autopilot } from "../sim/autopilot";
import { Drive, emptyLog, initPhysics } from "../sim/drive";
import { RoadLine } from "../sim/road-net";
import { World, tileDetail, type TileDetail } from "../sim/world";

/* eslint-disable security/detect-non-literal-fs-filename -- a tile folder given on the command line */

const option = (name: string, otherwise: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? otherwise;
const FOLDER = option("folder", "src/projects/aland-drive/.data/tiles");
const SHORTEST_M = Number(option("shortest", "0"));
const ONLY_TILE = option("tile", "");
const CRUISE_MS = 25;
const RUN_UP_M = 120;
const CENTRE = 2;

await initPhysics();
const manifest = JSON.parse(readFileSync(join(FOLDER, "world.json"), "utf8")) as WorldManifest;
const world = new World(manifest);
const inflated = (name: string, file: string) => {
  const bytes = gunzipSync(readFileSync(join(FOLDER, name, file)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};
const loaded = new Set<string>();
const load = (name: string) => {
  if (loaded.has(name)) return;
  loaded.add(name);
  const tile = JSON.parse(readFileSync(join(FOLDER, name, "tile.json"), "utf8")) as TileManifest;
  const { west, north } = tile.bounds;
  const grid = decodeHeights(new Int16Array(inflated(name, manifest.heights.file)), manifest.heights, { west, north });
  const { walls } = decodeSolids(inflated(name, tile.solids.file), tile.solids);
  world.addFar(name, decodeHeights(new Int16Array(inflated(name, manifest.far.heightsFile)), { ...manifest.far, unitM: manifest.heights.unitM }, { west, north }));
  world.addDetail(tileDetail(tile, grid, inflated(name, tile.roadSurface.file), new Uint8Array(inflated(name, manifest.water.nodesFile)), manifest.tileM, walls));
};
const unload = (name: string) => {
  world.removeDetail(name);
  world.removeFar(name);
  loaded.delete(name);
};

interface Result {
  tile: string;
  road: string;
  kind: string;
  metres: number;
  aboveM: number;
  ways: { respawns: number; offRoadM: number; jolt: number; finished: boolean }[];
  at: [number, number];
}
const results: Result[] = [];

for (const { name } of manifest.tiles.filter((tile) => ONLY_TILE === "" || tile.name === ONLY_TILE)) {
  const tile = JSON.parse(readFileSync(join(FOLDER, name, "tile.json"), "utf8")) as TileManifest;
  if (!tile.roadSurface.chains.some((chain) => chain.spans && chain.motor)) continue;
  const here = world.named(name);
  const neighbours = [...world.all()].filter((other) => Math.abs(other.column - here.column) <= 1 && Math.abs(other.row - here.row) <= 1);
  for (const { name: near } of neighbours) load(near);
  const { detail } = here;
  if (!detail) throw new Error(`${name} didn't load`);
  checkTile(detail);
  for (const { name: near } of neighbours) unload(near);
}

function checkTile(detail: TileDetail): void {
  const { surface } = detail;
  surface.chains.forEach((chain) => {
    if (!chain.motor) return;
    for (const [first, last] of chain.spans ?? []) {
      const centre = (section: number): [number, number, number] => {
        const at = ((chain.first + section) * RING_POINTS + CENTRE) * 3;
        return [surface.rings[at], surface.rings[at + 1], surface.rings[at + 2]];
      };
      const points: number[] = [];
      for (let section = first; section <= last; section++) points.push(...centre(section));
      const line = new RoadLine(Float32Array.from(points));
      if (line.length < SHORTEST_M) continue;
      let aboveM = Infinity;
      for (let section = first; section <= last; section++) {
        const [x, y, z] = centre(section);
        aboveM = Math.min(aboveM, y - world.height(x, z));
      }
      // Run up along the chain itself, as far as it goes either side.
      const whole: number[] = [];
      for (let section = 0; section < chain.sections; section++) whole.push(...centre(section));
      const road = new RoadLine(Float32Array.from(whole));
      const near = (section: number) => {
        const [x, , z] = centre(section);
        for (let at = 0; at < road.lengths.length; at++) {
          if (road.points[at * 3] === x && road.points[at * 3 + 2] === z) return road.lengths[at];
        }
        throw new Error("a span's section isn't on its chain");
      };
      const [fromM, toM] = [near(first), near(last)];
      const ways = [
        { from: Math.max(0, fromM - RUN_UP_M), to: Math.min(road.length, toM + RUN_UP_M), line: road },
        { from: road.length - Math.min(road.length, toM + RUN_UP_M), to: road.length - Math.max(0, fromM - RUN_UP_M), line: reversed(road) },
      ].map((way) => {
        const part = way.line;
        const drive = new Drive(world, part.at(way.from));
        drive.log = emptyLog();
        const pilot = new Autopilot(part, CRUISE_MS, way.from);
        let steps = 0;
        while (pilot.along < way.to - 20 && !pilot.finished() && steps++ < 120 * 120) drive.step(pilot.input(drive.stateAt(1)));
        const outcome = { respawns: drive.log.respawns, offRoadM: Number(drive.log.furthestOffRoadM.toFixed(1)), jolt: Number(drive.log.worstJoltG.toFixed(2)), finished: pilot.along >= way.to - 25 || pilot.finished(), stoppedAt: drive.stateAt(1).position.map(Math.round), along: Math.round(pilot.along), to: Math.round(way.to), from: Math.round(way.from) };
        drive.dispose();
        return outcome;
      });
      results.push({ tile: detail.name, road: chain.name ?? chain.ref ?? chain.kind, kind: chain.kind, metres: Math.round(line.length), aboveM: Number(aboveM.toFixed(1)), ways, at: [Math.round(points[0]), Math.round(points[2])] });
    }
  });
}

function reversed(line: RoadLine): RoadLine {
  const count = line.points.length / 3;
  const points = new Float32Array(line.points.length);
  for (let at = 0; at < count; at++) points.set(line.points.subarray((count - 1 - at) * 3, (count - at) * 3), at * 3);
  return new RoadLine(points);
}

results.sort((a, b) => b.metres - a.metres);
for (const result of results) console.log(JSON.stringify(result));
const failed = results.filter(({ ways }) => ways.some((way) => way.respawns > 0 || !way.finished));
console.log(JSON.stringify({ spans: results.length, metres: results.reduce((sum, { metres }) => sum + metres, 0), failed: failed.length }));
