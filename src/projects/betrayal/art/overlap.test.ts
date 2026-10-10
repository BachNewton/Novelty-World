import { Worker } from "node:worker_threads";
import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stubCanvas } from "./headless";
import { ROOMS } from "../data/rooms";
import type { Layout } from "../engine/board";
import { COLOUR_RING, shellRoom } from "./house";
import { HOUSE_FIXTURE } from "./house-layout";
import { checkHouseFloor, checkRoom, OVERFLOW_SPACING, SPOT_SPACING, type OverlapReport } from "./overlap";
import type { CheckReply } from "./overlap-worker";
import { MARK_PLANES, roomSpot, standingSpots, type Contact, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { CHAPEL } from "./rooms/chapel";
import { batch, flat, group } from "./shapes";

/** How long one room's check may take before it fails as an endless loop. */
const TIME_LIMIT_MS = 20_000;

/**
 * Checks rooms in a worker thread, one at a time: a room that never finishes
 * is stopped when its time is up, and fails alone, and a fresh worker takes
 * the rooms after it. The deadline is the feature here, not a wait.
 */
function roomChecker() {
  const start = () => {
    const worker = new Worker(new URL("./overlap-worker.ts", import.meta.url), { execArgv: ["--import", "tsx"] });
    const ready = new Promise<void>((resolve, reject) => {
      worker.once("message", () => resolve());
      worker.once("error", reject);
    });
    return { worker, ready };
  };
  let current = start();
  return {
    check: async (id: string): Promise<OverlapReport> => {
      const { worker, ready } = current;
      await ready;
      return new Promise((resolve, reject) => {
        const done = () => {
          clearTimeout(limit);
          worker.removeAllListeners("message");
          worker.removeAllListeners("error");
        };
        const limit = setTimeout(() => {
          done();
          void worker.terminate();
          current = start();
          reject(new Error(`The overlap check of ${id} didn't finish within ${TIME_LIMIT_MS / 1000} s: does its build loop forever?`));
        }, TIME_LIMIT_MS);
        worker.on("message", (reply: CheckReply) => {
          done();
          if ("error" in reply) reject(new Error(`Building ${id} threw:
${reply.error}`));
          else resolve(reply.report);
        });
        worker.on("error", (error) => {
          done();
          current = start();
          reject(error);
        });
        worker.postMessage(id);
      });
    },
    stop: () => current.worker.terminate(),
  };
}

beforeAll(stubCanvas);

describe("the overlap check", () => {
  it("judges touching solids apart: a box inside a frame of four strips doesn't pass into it", () => {
    const frame = () => {
      const strips = batch();
      strips.block([1, 0.1, 0.1], "wood", [0, 0, 0]);
      strips.block([1, 0.1, 0.1], "wood", [0, 0.9, 0]);
      strips.block([0.1, 0.8, 0.1], "wood", [-0.45, 0.1, 0]);
      strips.block([0.1, 0.8, 0.1], "wood", [0.45, 0.1, 0]);
      return group(strips.mesh());
    };
    const panel = () => {
      const pane = batch();
      pane.block([0.6, 0.6, 0.3], "stone", [0, 0.2, 0]);
      return group(pane.mesh());
    };
    const room: RoomDefinition = { ...CHAPEL, props: [{ build: frame, at: [0, -1] }, { build: panel, at: [0, -1] }], pawn: undefined };
    expect(checkRoom(room).findings).toEqual([]);
    const crowded: RoomDefinition = { ...room, props: [...room.props, { build: panel, name: "crowding", at: [0.05, -1] }] };
    expect(checkRoom(crowded).findings.map((finding) => finding.key)).toEqual([
      "crowding at (0.05, -1.00) passes into panel at (0.00, -1.00)",
      "crowding at (0.05, -1.00) z-fights with panel at (0.00, -1.00)",
    ]);
  });
});

describe("z-fighting", () => {
  /** A mat lying flat on the Chapel's floor, `at` above it. */
  const mat = (at: number, colour: "blood" | "moon") => () => new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2).translate(0, at, 0), flat(colour));
  const fights = (room: RoomDefinition) => checkRoom(room).findings.map((finding) => finding.key).filter((key) => key.includes("z-fights"));
  /** Two mats overlapping, one `apart` above the other. */
  const mats = (apart: number): RoomDefinition => ({
    ...CHAPEL,
    props: [
      { build: mat(0.1, "blood"), name: "mat", at: [0, -1] },
      { build: mat(0.1 + apart, "moon"), name: "rug", at: [0.2, -1] },
    ],
  });

  it("finds two pieces' faces too near one plane for the house's depth buffer to part, and passes them a few millimetres apart", () => {
    expect(fights(mats(0.0005))).toEqual(["mat at (0.00, -1.00) z-fights with rug at (0.20, -1.00)"]);
    expect(fights(mats(0.004))).toEqual([]);
  });

  it("finds a face in the plane of the house's choice glow, which draws no depth: the Chapel's votive stand's foot", () => {
    /** A stand's foot on the floor, its top `top` up. */
    const foot = (top: number) => () => {
      const b = batch();
      b.block([0.3, top, 0.3], "sootLight", [0, 0, 0]);
      return group(b.mesh());
    };
    const room = (top: number): RoomDefinition => ({ ...CHAPEL, props: [{ build: foot(top), name: "foot", at: [1, -1] }] });
    expect(fights(room(MARK_PLANES.fill))).toEqual(["foot at (1.00, -1.00) z-fights with the choice marks"]);
    expect(fights(room(MARK_PLANES.fill - 0.005))).toEqual([]);
  });

  it("accepts a fight declared as a contact, with its reason", () => {
    const declared = mats(0);
    declared.props[1] = { ...declared.props[1], contacts: [{ with: "mat", because: "a test of a declared contact" }] };
    const report = checkRoom(declared);
    expect(report.findings.filter((finding) => finding.key.includes("z-fights"))).toEqual([]);
    expect(report.accepted.map((finding) => finding.key)).toEqual(["mat at (0.00, -1.00) z-fights with rug at (0.20, -1.00)"]);
  });

  it("finds a piece's own boxes fighting, as a merged mesh would", () => {
    const pair = () => {
      const b = batch();
      b.block([0.4, 0.4, 0.3], "soot", [0, 0, 0]);
      b.block([0.05, 0.04, 0.2], "bone", [0, 0.36, 0]);
      return group(b.mesh());
    };
    expect(fights({ ...CHAPEL, props: [{ build: pair, name: "shelf", at: [0, -1] }] })).toEqual(["shelf at (0.00, -1.00) z-fights with itself"]);
  });

  it("the stage's shell meets itself without fighting in every tile, in every way the house cuts its walls, and stands its figures clear of each other and the doorways", () => {
    const found = ROOMS.flatMap((tile) => checkRoom(shellRoom(tile.id)).findings.map((finding) => `${tile.id}: ${finding.text}`));
    expect(found).toEqual([]);
  }, 60_000);

  /** Real rooms laid round a four-way corner on two floors, turned every way, an outdoor tile among them. */
  const MIXED: Layout = {
    tiles: [
      { tile: "catacombs", floor: "basement", x: 0, y: 0, rotation: 0 },
      { tile: "wine-cellar", floor: "basement", x: 1, y: 0, rotation: 1 },
      { tile: "furnace-room", floor: "basement", x: 0, y: 1, rotation: 2 },
      { tile: "chasm", floor: "basement", x: 1, y: 1, rotation: 3 },
      { tile: "graveyard", floor: "ground", x: 0, y: 0, rotation: 0 },
      { tile: "kitchen", floor: "ground", x: 1, y: 0, rotation: 1 },
      { tile: "dusty-hallway", floor: "ground", x: 0, y: 1, rotation: 0 },
      { tile: "statuary-corridor", floor: "ground", x: 1, y: 1, rotation: 2 },
    ],
  };

  it("rooms laid side by side in a house don't fight each other along their shared edges and at their corners", () => {
    const found = [HOUSE_FIXTURE, MIXED].flatMap((layout) =>
      [...new Set(layout.tiles.map((tile) => tile.floor))].flatMap((floor) => checkHouseFloor(layout, floor).map((finding) => finding.text)),
    );
    expect(found).toEqual([]);
  }, 30_000);
});

describe("standing spots", () => {
  /** A low wall right across the Chapel, between its one door (top) and the bottom half of the floor. */
  const wall = () => {
    const stones = batch();
    stones.block([5.4, 0.6, 0.3], "stone", [0, 0, 0]);
    return group(stones.mesh());
  };
  const keys = (room: RoomDefinition) => checkRoom(room).findings.map((finding) => finding.key);
  const spots: [number, number][] = [[-2, -2], [2, -2], [-2, -0.7], [2, -0.7], [0, -0.8]];

  it("finds a spot cut off from the doors", () => {
    expect(keys({ ...CHAPEL, props: [{ build: wall, at: [0, 0] }], pawn: [0, 1.5], spots })).toEqual([
      "standing spot 1 at (0.00, 1.50) can't be reached from the doors",
      "the walk from standing spot 1 to the doorway top is blocked",
    ]);
  });

  it("finds a spot in a doorway's lane, and two spots crowding each other", () => {
    expect(keys({ ...CHAPEL, props: [], pawn: [0, -2.4], spots: [...spots.slice(0, 4), [-2.2, -2.3]] })).toEqual([
      "standing spot 1 at (0.00, -2.40) stands in the doorway top's lane",
      "standing spot 2 at (-2.00, -2.00) crowds standing spot 6 at (-2.20, -2.30)",
    ]);
  });

  it("keeps standing spots a ring's width apart, ring from ring, and overflow places only base from base", () => {
    expect(SPOT_SPACING).toBeCloseTo(2 * COLOUR_RING.outer + (COLOUR_RING.outer - COLOUR_RING.inner));
    const apart = (gap: number): RoomDefinition => ({ ...CHAPEL, props: [], pawn: [-2, 1.5], spots: [[-2 + gap, 1.5], ...spots.slice(1)] });
    expect(keys(apart(SPOT_SPACING - 0.02))).toEqual(["standing spot 1 at (-2.00, 1.50) crowds standing spot 2 at (-0.77, 1.50)"]);
    expect(keys(apart(SPOT_SPACING + 0.02))).toEqual([]);
    const squeezed = (gap: number): RoomDefinition => ({ ...CHAPEL, props: [], pawn: [-2, 1.5], spots, overflow: [[-2 + gap, 1.5]] });
    expect(keys(squeezed(OVERFLOW_SPACING - 0.02))).toEqual(["standing spot 1 at (-2.00, 1.50) crowds overflow place 1 at (-1.26, 1.50)"]);
    expect(keys(squeezed(OVERFLOW_SPACING + 0.02))).toEqual([]);
  });

  it("stands a figure past the six on the room's overflow, clear of every other figure, and says when the room is full", () => {
    const room: RoomDefinition = { ...CHAPEL, props: [], pawn: [-2, 1.5], spots, overflow: [[-1, -1.5], [1, -1.5]] };
    const stood = [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => roomSpot(room, slot));
    expect(stood.slice(6)).toEqual(room.overflow);
    stood.forEach(([x, z], i) => stood.slice(i + 1).forEach(([ox, oz]) => expect(Math.hypot(ox - x, oz - z)).toBeGreaterThanOrEqual(OVERFLOW_SPACING)));
    expect(() => roomSpot(room, 8)).toThrow("chapel has places for 8 figures, not 9");
  });
});

describe("walks", () => {
  /** A block in the middle of the Chapel, between its one door (top) and a spot below it. */
  const block = () => {
    const stone = batch();
    stone.block([1.6, 0.8, 1.0], "stone", [0, 0, 0]);
    return group(stone.mesh());
  };
  const walkKeys = (room: RoomDefinition) => checkRoom(room).findings.map((finding) => finding.key).filter((key) => key.startsWith("the walk"));
  const below: RoomDefinition = { ...CHAPEL, props: [{ build: block, at: [0, 0] }], pawn: [0, 1.6], spots: [] };

  it("finds a walk that goes straight through a piece in its way", () => {
    expect(walkKeys(below)).toEqual(["the walk from standing spot 1 to the doorway top is blocked"]);
  });

  it("clears it by lanes round the piece", () => {
    expect(walkKeys({ ...below, lanes: [[[0, -2.2], [-1.6, -1.2], [-1.6, 1.2], [0, 1.6]]] })).toEqual([]);
  });

  it("walks a barrier room's halves together along its crossing, over the gap between them", () => {
    const split: RoomDefinition = { ...CHAPEL, props: [], pawn: [0, 1.6], spots: [], floorOpenings: [{ x: [-3, 3], z: [-0.4, 0.4] }] };
    expect(walkKeys(split)).toEqual(["the walk from standing spot 1 to the doorway top is blocked"]);
    expect(walkKeys({ ...split, crossing: [[0, 0, -0.9], [0, 0, 0.9]] })).toEqual([]);
  });
});

describe("a polygonal floor opening", () => {
  /** A ragged hole: a diamond, its corners on the axes, 1.2 m from the middle. */
  const hole: RoomDefinition = { ...CHAPEL, props: [], pawn: undefined, floorOpenings: [{ polygon: [[0, -1.2], [1.2, 0], [0, 1.2], [-1.2, 0]] }] };
  const sunk = () => {
    const block = batch();
    block.block([0.3, 0.3, 0.3], "stone", [0, -0.35, 0]);
    return group(block.mesh());
  };

  it("leaves the hole open, so a piece sunk in it meets no floor", () => {
    expect(checkRoom({ ...hole, props: [{ build: sunk, name: "sunk", at: [0, 0] }] }).findings).toEqual([]);
  });

  it("floors the corner between the polygon and its bounds", () => {
    const findings = checkRoom({ ...hole, props: [{ build: sunk, name: "sunk", at: [1.05, 1.05] }] }).findings.map((finding) => finding.key);
    expect(findings).toEqual(["sunk at (1.05, 1.05) passes into the floor"]);
  });
});

describe("room overlaps", () => {
  const checker = roomChecker();
  afterAll(() => checker.stop());

  it("accepts a declared contact, and reports one that no longer happens", () => {
    const block = () => {
      const stone = batch();
      stone.block([0.6, 0.6, 0.6], "stone", [0, 0, 0]);
      return group(stone.mesh());
    };
    const declared = (contacts: Contact[]) =>
      checkRoom({ ...CHAPEL, pawn: undefined, spots: undefined, props: [{ build: block, at: [0, -1] }, { build: block, name: "shoved", at: [0.3, -1], contacts }] });
    const touching = declared([{ with: "block", because: "it has been shoved into the other" }]);
    expect(touching.accepted.map((finding) => finding.key)).toEqual([
      "block at (0.00, -1.00) passes into shoved at (0.30, -1.00)",
      "block at (0.00, -1.00) z-fights with shoved at (0.30, -1.00)",
    ]);
    expect(touching.unusedContacts).toEqual([]);
    expect(declared([{ with: "right", because: "nothing" }]).unusedContacts).toEqual(["shoved at (0.30, -1.00) with right"]);
  });

  for (const room of BENCH_ROOMS) {
    it(`${room.id}: six standing spots, clear and in reach; no piece passes into another, and no faces fight, however the walls are cut`, async () => {
      expect(standingSpots(room), "a room defines six standing spots: `pawn` and five `spots`").toHaveLength(6);
      console.info(`${room.id}: room for ${standingSpots(room).length + (room.overflow ?? []).length} figures`);
      const { findings, unusedContacts, openFloor } = await checker.check(room.id);
      console.info(`${room.id}: the largest open floor circle has a radius of ${openFloor.radius.toFixed(2)} m, at (${openFloor.at[0].toFixed(2)}, ${openFloor.at[1].toFixed(2)})`);
      expect(findings.map((finding) => finding.text), "fix them, or declare the contact on the piece").toEqual([]);
      expect(unusedContacts, "declared contacts that no longer happen, or name nothing").toEqual([]);
    }, TIME_LIMIT_MS + 30_000);
  }
});
