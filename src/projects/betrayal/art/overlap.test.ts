import { Worker } from "node:worker_threads";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stubCanvas } from "./headless";
import { checkRoom, type OverlapReport } from "./overlap";
import type { CheckReply } from "./overlap-worker";
import { standingSpots, type Contact, type RoomDefinition } from "./room";
import { BENCH_ROOMS } from "./rooms";
import { CHAPEL } from "./rooms/chapel";
import { batch, group } from "./shapes";

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
    expect(checkRoom(crowded).findings.map((finding) => finding.key)).toEqual(["crowding at (0.05, -1.00) passes into panel at (0.00, -1.00)"]);
  });
});

describe("standing spots", () => {
  /** A low wall right across the Chapel, between its one door (top) and the bottom half of the floor. */
  const wall = () => {
    const stones = batch();
    stones.block([5.4, 0.6, 0.3], "stone", [0, 0, 0]);
    return group(stones.mesh());
  };
  const keys = (room: RoomDefinition) => checkRoom(room).findings.map((finding) => finding.key);
  const spots: [number, number][] = [[-1.5, -1.5], [1.5, -1.5], [-1.5, -0.6], [1.5, -0.6], [2, -2.2]];

  it("finds a spot cut off from the doors", () => {
    expect(keys({ ...CHAPEL, props: [{ build: wall, at: [0, 0] }], pawn: [0, 1.5], spots })).toEqual(["standing spot 1 at (0.00, 1.50) can't be reached from the doors"]);
  });

  it("finds a spot in a doorway's lane, and two spots crowding each other", () => {
    expect(keys({ ...CHAPEL, props: [], pawn: [0, -2.4], spots: [...spots.slice(0, 4), [-1.2, -1.3]] })).toEqual([
      "standing spot 1 at (0.00, -2.40) stands in the doorway top's lane",
      "standing spot 2 at (-1.50, -1.50) crowds standing spot 6 at (-1.20, -1.30)",
    ]);
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
    expect(touching.accepted.map((finding) => finding.key)).toEqual(["block at (0.00, -1.00) passes into shoved at (0.30, -1.00)"]);
    expect(touching.unusedContacts).toEqual([]);
    expect(declared([{ with: "right", because: "nothing" }]).unusedContacts).toEqual(["shoved at (0.30, -1.00) with right"]);
  });

  for (const room of BENCH_ROOMS) {
    it(`${room.id}: six standing spots, clear and in reach; no piece passes into another, and no faces fight`, async () => {
      expect(standingSpots(room), "a room defines six standing spots: `pawn` and five `spots`").toHaveLength(6);
      const { findings, unusedContacts, openFloor } = await checker.check(room.id);
      console.info(`${room.id}: the largest open floor circle has a radius of ${openFloor.radius.toFixed(2)} m, at (${openFloor.at[0].toFixed(2)}, ${openFloor.at[1].toFixed(2)})`);
      expect(findings.map((finding) => finding.text), "fix them, or declare the contact on the piece").toEqual([]);
      expect(unusedContacts, "declared contacts that no longer happen, or name nothing").toEqual([]);
    }, TIME_LIMIT_MS + 30_000);
  }
});
