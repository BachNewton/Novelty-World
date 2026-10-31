import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { nextToLoad, isPastUnload } from "../render/stream";
import { paintAlong, DASH_LENGTH_M } from "../render/roads";
import type { HeightGrid, TileManifest, WorldManifest } from "../render/tile";
import { NO_INPUT } from "./car";
import { Drive, initPhysics } from "./drive";
import { RoadLine } from "./road-net";
import { BLOCK_M, SEA_HEIGHT_M, World, tileDetail } from "./world";

/*
 * Two tiles side by side, small in nodes but laid out as real ones, sharing their
 * edge row. A straight road crosses from one into the other. What matters here is
 * what happens at the seam, which needs no real land.
 */

const TILE_M = 6000;
const NODES = 1501;
const STEP_M = 4;
const FAR_NODES = 376;

const landHeight = (x: number, z: number) => 12 + 2 * Math.sin(x / 300) + Math.cos(z / 200);

const gridAt = (column: number, row: number, nodes: number, stepM: number): HeightGrid => {
  const west = column * TILE_M;
  const top = row * TILE_M;
  const heights = new Float32Array(nodes * nodes);
  for (let r = 0; r < nodes; r++) {
    for (let c = 0; c < nodes; c++) heights[r * nodes + c] = Math.fround(landHeight(west + c * stepM, top + r * stepM));
  }
  return { nodes, stepM, west, north: -top, heights };
};

const manifest = {
  version: "test",
  tileM: TILE_M,
  worldOrigin: { east: 0, north: 0 },
  tiles: [
    { name: "WEST", west: -TILE_M, north: TILE_M },
    { name: "EAST", west: 0, north: TILE_M },
  ],
  start: { tile: "WEST", chain: 0 },
  heights: { file: "", nodes: NODES, stepM: STEP_M, unitM: 0.01 },
  far: { heightsFile: "", nodes: FAR_NODES, stepM: 16, shadeFile: "", shadePixels: 750 },
  shade: { file: "", pixels: 3000, gamma: 2.2 },
  mask: { file: "", pixels: 1500 },
  ground: { file: "", pixels: 3000, farFile: "", farPixels: 750 },
  canopy: { file: "", pixels: 1500, unitM: 0.25 },
  water: { nodesFile: "" },
  overview: { west: -TILE_M, north: TILE_M, columns: 2, rows: 2, stepM: 80, unitM: 0.01, heightsFile: "", imageFile: "", imageWidth: 1, imageHeight: 1 },
  map: { file: "" },
  sun: { azimuthDeg: 215, elevationDeg: 30 },
  attribution: [],
} satisfies WorldManifest;

const ROAD_Z = -3000;
const ROAD_HEIGHT_ABOVE_M = 0.2;

/** A straight road along z = ROAD_Z from one tile's edge to the other's, with a section every 10 m. */
function roadBytes(fromX: number, toX: number): { bytes: ArrayBuffer; sections: number } {
  const sections = Math.round(Math.abs(toX - fromX) / 10) + 1;
  const floats = new Float32Array(sections * 15);
  for (let section = 0; section < sections; section++) {
    const x = fromX + (section * (toX - fromX)) / (sections - 1);
    [4.5, 3, 0, -3, -4.5].forEach((across, point) => {
      floats.set([x, -ROAD_Z - across * Math.sign(toX - fromX), landHeight(x, ROAD_Z) + ROAD_HEIGHT_ABOVE_M], (section * 5 + point) * 3);
    });
  }
  const bytes = new Uint8Array(floats.byteLength + sections);
  bytes.set(new Uint8Array(floats.buffer));
  return { bytes: bytes.buffer, sections };
}

function tileManifest(name: string, west: number, sections: number): TileManifest {
  return { tile: name, bounds: { west, east: west + TILE_M, south: 0, north: TILE_M }, roadSurface: { file: "", chains: [{ sections, kind: "primary", motor: true }] }, solids: { file: "", unitM: 0.02, cells: [], walls: 0 } };
}

function twoTiles(withEastDetail = true, walls?: Float32Array): World {
  const world = new World(manifest);
  world.addFar("WEST", gridAt(-1, -1, FAR_NODES, 16));
  world.addFar("EAST", gridAt(0, -1, FAR_NODES, 16));
  const nodesWet = new Uint8Array(NODES * NODES);
  const west = roadBytes(-TILE_M, 0);
  world.addDetail(tileDetail(tileManifest("WEST", -TILE_M, west.sections), gridAt(-1, -1, NODES, STEP_M), west.bytes, nodesWet, TILE_M, walls));
  if (withEastDetail) {
    // Its chain runs the other way, towards the seam, as a neighbour's may.
    const east = roadBytes(TILE_M, 0);
    world.addDetail(tileDetail(tileManifest("EAST", 0, east.sections), gridAt(0, -1, NODES, STEP_M), east.bytes, nodesWet, TILE_M));
  }
  return world;
}

beforeAll(initPhysics);

const downOn = (drive: Drive, x: number, z: number) => {
  drive.ground.around(x, z);
  drive.rapier.step();
  const hit = drive.rapier.castRay(new RAPIER.Ray({ x, y: 300, z }, { x: 0, y: -1, z: 0 }), 600, true);
  if (!hit) throw new Error(`nothing to collide with at ${x}, ${z}`);
  return 300 - hit.timeOfImpact;
};

describe("a building", () => {
  it("stops the car at top speed: the wall is thinner than a step, and the car mustn't come out the far side", () => {
    const wallX = -300;
    const world = twoTiles(true, Float32Array.of(wallX, ROAD_Z - 30, wallX, ROAD_Z + 30));
    const onRoad = (x: number) => landHeight(x, ROAD_Z) + ROAD_HEIGHT_ABOVE_M;
    const drive = new Drive(world, new RoadLine(Float32Array.of(-2400, onRoad(-2400), ROAD_Z, -2300, onRoad(-2300), ROAD_Z)).at(0));
    let fastest = 0;
    let furthest = -Infinity;
    for (let step = 0; step < 120 * 45; step++) {
      drive.step({ ...NO_INPUT, throttle: 1 });
      const { position, velocity } = drive.stateAt(1);
      fastest = Math.max(fastest, velocity[0]);
      furthest = Math.max(furthest, position[0]);
    }
    expect(fastest).toBeGreaterThan(50);
    expect(furthest).toBeLessThan(wallX);
    drive.dispose();
  });
});

describe("a tile's edge", () => {
  it("is nothing to the height lattice: the node on it is one height from either side", () => {
    const world = twoTiles();
    const west = world.named("WEST").detail?.grid;
    const east = world.named("EAST").detail?.grid;
    if (!west || !east) throw new Error("no detail");
    for (const row of [0, 700, 1500]) {
      expect(west.heights[row * NODES + NODES - 1]).toBe(east.heights[row * NODES]);
      expect(world.node(0, -1500 + row)).toBe(east.heights[row * NODES]);
    }
  });

  it("is nothing to the car: ground and road collide without a gap, right across it", () => {
    const world = twoTiles();
    const drive = new Drive(world, new RoadLine(Float32Array.of(-200, 0, ROAD_Z, -100, 0, ROAD_Z)).at(0));
    let before = downOn(drive, -6, ROAD_Z);
    for (let x = -5.5; x <= 6; x += 0.5) {
      const height = downOn(drive, x, ROAD_Z + 1);
      expect(Math.abs(height - before)).toBeLessThan(0.1);
      expect(height).toBeCloseTo(landHeight(x, ROAD_Z) + ROAD_HEIGHT_ABOVE_M, 1);
      before = height;
    }
    drive.dispose();
  });

  it("finds the nearest road across it, and joins the two tiles' road nets", () => {
    const world = twoTiles();
    expect(world.roads.nearest(-20, ROAD_Z + 7)?.distance).toBeCloseTo(7, 1);
    expect(world.roads.nearest(20, ROAD_Z + 7)?.distance).toBeCloseTo(7, 1);
    expect(world.roads.nearest(3, ROAD_Z + 4000)?.distance).toBeCloseTo(4000, -1);
  });

  it("carries the dashes across it: each chain counts them from the seam, whichever way it runs", () => {
    const length = 5995;
    const towards = paintAlong(length, false, true);
    const away = paintAlong(length, true, false);
    expect(length * towards.scale + towards.offset).toBeCloseTo(0);
    expect(away.offset).toBe(0);
    const both = paintAlong(length, true, true);
    expect(((length * both.scale) / DASH_LENGTH_M) % 1).toBeCloseTo(0);
    expect(Math.abs(both.scale - 1)).toBeLessThan(DASH_LENGTH_M / length);
  });
});

describe("ground with no detail yet", () => {
  it("is the far surface: never a hole, and the car stands on it", () => {
    const world = twoTiles(false);
    const drive = new Drive(world, new RoadLine(Float32Array.of(-200, 0, ROAD_Z, -100, 0, ROAD_Z)).at(0));
    const height = downOn(drive, BLOCK_M * 3 + 7, -1200);
    expect(height).toBeCloseTo(landHeight(BLOCK_M * 3 + 7, -1200), 0);
    drive.dispose();
  });

  it("gives way to detail when the tile lands, and back again when it goes", () => {
    const world = twoTiles(false);
    const farOnly = world.node(101, -700);
    const revision = world.revision;
    const east = roadBytes(TILE_M, 0);
    world.addDetail(tileDetail(tileManifest("EAST", 0, east.sections), gridAt(0, -1, NODES, STEP_M), east.bytes, new Uint8Array(NODES * NODES), TILE_M));
    expect(world.revision).toBeGreaterThan(revision);
    expect(Math.abs(world.node(101, -700) - farOnly)).toBeLessThan(0.1);
    world.removeDetail("EAST");
    expect(world.node(101, -700)).toBe(farOnly);
    expect(world.roads.nearest(3000, -3000)?.x).toBeLessThanOrEqual(0);
  });

  it("reads the sea past the end of the world, and the land's last row at its edge", () => {
    const world = twoTiles();
    expect(world.node(1501, -700)).toBe(SEA_HEIGHT_M);
    expect(world.node(1500, -700)).toBeCloseTo(landHeight(6000, -2800), 2);
  });
});

describe("which tiles to load", () => {
  const world = twoTiles(false);
  const west = world.named("WEST");
  const east = world.named("EAST");

  it("wants a tile before the car could see it, and lets it go only well after leaving", () => {
    expect(nextToLoad([east], -2100, -3000, TILE_M, new Set())).toBe(east);
    expect(nextToLoad([east], -2300, -3000, TILE_M, new Set())).toBeNull();
    expect(isPastUnload(west, 2500, -3000, TILE_M)).toBe(false);
    expect(isPastUnload(west, 3000, -3000, TILE_M)).toBe(true);
  });

  it("doesn't ask twice for a tile on its way", () => {
    expect(nextToLoad([east], -100, -3000, TILE_M, new Set(["EAST"]))).toBeNull();
  });
});
