import RAPIER from "@dimforge/rapier3d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { surfaceHeight } from "../render/tile";
import { Autopilot } from "./autopilot";
import { NO_INPUT } from "./car";
import { speedOf, type CarState } from "./car-state";
import { Drive, initPhysics, START_ALONG_M } from "./drive";
import { readTile } from "./read-tile";

const tile = readTile();
const TOP_OF_THE_WORLD = 300;
const GOOD_ROAD_CRUISE_MS = 60;

beforeAll(initPhysics);

const topTriangle = (drive: Drive, x: number, z: number): number | null => {
  const { positions, indices } = drive.ribbon;
  let top: number | null = null;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const [a, b, c] = [indices[triangle] * 3, indices[triangle + 1] * 3, indices[triangle + 2] * 3];
    if (Math.abs(positions[a] - x) > 40 || Math.abs(positions[a + 2] - z) > 40) continue;
    const denominator = (positions[b + 2] - positions[c + 2]) * (positions[a] - positions[c]) + (positions[c] - positions[b]) * (positions[a + 2] - positions[c + 2]);
    const u = ((positions[b + 2] - positions[c + 2]) * (x - positions[c]) + (positions[c] - positions[b]) * (z - positions[c + 2])) / denominator;
    const v = ((positions[c + 2] - positions[a + 2]) * (x - positions[c]) + (positions[a] - positions[c]) * (z - positions[c + 2])) / denominator;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    const height = u * positions[a + 1] + v * positions[b + 1] + w * positions[c + 1];
    top = top === null ? height : Math.max(top, height);
  }
  return top;
};

describe("the two copies of the ground", () => {
  it("collides where it's drawn: on the road, off it and across the blocks' borders", () => {
    const drive = new Drive(tile);
    const road = Array.from({ length: 80 }, (_, index) => {
      const point = drive.net.at(0, 30 + index * 75);
      return [point.x + (index % 7) - 3, point.z + (index % 5) - 2];
    });
    // 120 m apart in steps that land on block borders, in fields and over the side roads.
    const across = Array.from({ length: 80 }, (_, index) => [-11900 + index * 60, -300 - index * 67]);
    for (const [x, z] of [...road, ...across]) {
      drive.ground.around(x, z);
      drive.world.step();
      const hit = drive.world.castRay(new RAPIER.Ray({ x, y: TOP_OF_THE_WORLD, z }, { x: 0, y: -1, z: 0 }), 2 * TOP_OF_THE_WORLD, true);
      const drawn = Math.max(surfaceHeight(tile.grid, x, -z), topTriangle(drive, x, z) ?? -Infinity);
      if (!hit) throw new Error(`nothing to collide with at ${x}, ${z}`);
      expect(TOP_OF_THE_WORLD - hit.timeOfImpact).toBeCloseTo(drawn, 2);
    }
    drive.dispose();
  });
});

function route(cruise: number, from: number): Drive {
  const drive = new Drive(tile);
  drive.placeAt(drive.net.at(0, from));
  const pilot = new Autopilot(drive.net, 0, cruise, from);
  for (let step = 0; step < 120 * 200 && !pilot.finished(); step++) drive.step(pilot.input(drive.stateAt(1)));
  return drive;
}

describe("the drive along Route 1", () => {
  it("stays on the road at full speed with every wheel down", () => {
    const drive = route(GOOD_ROAD_CRUISE_MS, 150);
    expect(drive.log.metres).toBeGreaterThan(5800);
    expect(drive.log.topSpeedMS * 3.6).toBeGreaterThan(195);
    expect(drive.log.contactLosses).toBe(0);
    expect(drive.log.worstJoltG).toBeLessThan(0.4);
    expect(drive.log.furthestOffRoadM).toBeLessThan(3);
    expect(drive.log.respawns).toBe(0);
    drive.dispose();
  });

  it("plays out the same every time, and its state survives the wire", () => {
    const play = () => {
      const drive = new Drive(tile);
      const pilot = new Autopilot(drive.net, 0, 30, START_ALONG_M);
      for (let step = 0; step < 900; step++) drive.step(pilot.input(drive.stateAt(1)));
      const state = drive.stateAt(1);
      drive.dispose();
      return state;
    };
    const first = play();
    expect(play()).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});

function drove(drive: Drive, steps: number, input: Partial<typeof NO_INPUT>): CarState {
  for (let step = 0; step < steps; step++) drive.step({ ...NO_INPUT, ...input });
  return drive.stateAt(1);
}

describe("the car", () => {
  it("backs up once stopped, and goes forward again on the throttle", () => {
    const drive = new Drive(tile);
    drove(drive, 120, {});
    const noseFirst = drove(drive, 240, { throttle: 1 });
    expect(speedOf(noseFirst)).toBeGreaterThan(8);
    drove(drive, 240, { brake: 1 });
    const backing = drove(drive, 240, { brake: 1 });
    const start = drive.net.at(0, START_ALONG_M);
    const along = (backing.position[0] - start.x) * -Math.sin(start.heading) + (backing.position[2] - start.z) * -Math.cos(start.heading);
    const before = (noseFirst.position[0] - start.x) * -Math.sin(start.heading) + (noseFirst.position[2] - start.z) * -Math.cos(start.heading);
    expect(along).toBeLessThan(before);
    expect(speedOf(backing)).toBeGreaterThan(3);
    drive.dispose();
  });

  it("dips its nose under braking and swings its tail on the handbrake", () => {
    const steady = new Drive(tile);
    drove(steady, 480, { throttle: 1 });
    const braking = drove(steady, 30, { brake: 1 });
    expect(braking.suspension[0]).toBeGreaterThan(braking.suspension[2]);
    steady.dispose();

    const yawAfter = (handbrake: boolean) => {
      const drive = new Drive(tile);
      drove(drive, 480, { throttle: 1 });
      const { spin } = drove(drive, 60, { steer: 1, handbrake });
      drive.dispose();
      return Math.abs(spin[1]);
    };
    expect(yawAfter(true)).toBeGreaterThan(yawAfter(false));
  });

  it("can't leave the tile, whichever way it's driven", () => {
    const drive = new Drive(tile);
    const { bounds } = tile.manifest;
    const nearEdge = drive.net.at(0, 30);
    drive.placeAt({ ...nearEdge, heading: Math.PI });
    const state = drove(drive, 120 * 8, { throttle: 1 });
    expect(-state.position[2]).toBeGreaterThanOrEqual(bounds.south);
    drive.dispose();
  });

  it("is put back on a road soon after driving into water", () => {
    const drive = new Drive(tile);
    const { grid, waterNodes } = tile;
    const node = waterNodes.findIndex((wet, index) => wet === 1 && index % grid.nodes > 400 && index % grid.nodes < 1100 && index > 400 * grid.nodes);
    const x = grid.west + (node % grid.nodes) * grid.stepM;
    const north = grid.north - Math.floor(node / grid.nodes) * grid.stepM;
    expect(drive.net.nearest(x, -north).distance).toBeGreaterThan(6);
    drive.placeAt({ ...drive.net.at(0, 500), x, z: -north, y: surfaceHeight(grid, x, north) });
    const state = drove(drive, 200, {});
    expect(drive.log.respawns).toBe(1);
    expect(drive.net.nearest(state.position[0], state.position[2]).distance).toBeLessThan(2);
    drive.dispose();
  });
});

describe("the road surface", () => {
  it("is never under the ground, along any point of Route 1's carriageway", () => {
    const drive = new Drive(tile);
    const { surface, grid } = tile;
    const chain = surface.chains[0];
    for (let section = 0; section < chain.sections; section++) {
      for (let point = 1; point <= 3; point++) {
        const at = ((chain.first + section) * 5 + point) * 3;
        const [x, y, z] = surface.rings.subarray(at, at + 3);
        const fromEdge = Math.min(x - grid.west, grid.west + 6000 - x, grid.north + z, -z - (grid.north - 6000));
        if (fromEdge > 4) expect(surfaceHeight(grid, x, -z)).toBeLessThan(y);
      }
    }
    drive.dispose();
  });
});
