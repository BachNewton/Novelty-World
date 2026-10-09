import { Worker } from "node:worker_threads";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stubCanvas } from "./headless";
import { checkRoom, type OverlapReport } from "./overlap";
import type { CheckReply } from "./overlap-worker";
import type { Contact, RoomDefinition } from "./room";
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

/**
 * Overlaps the rooms had when the check arrived, which it reports but doesn't
 * fail on, so only new ones fail. The review pass empties it: each entry is
 * fixed, or declared as a contact on its piece with the reason. The entries
 * on the second explorer's spot arrived with that spot's check, and the
 * Library's bookcases fighting the walls when touching solids were first
 * split apart (their merged hull had hidden those faces).
 */
const BASELINE: Record<string, string[]> = {
  "drawing-room": [
    "prop at (0.50, 0.80) passes into the second explorer's spot",
    "fireplace at (-2.80, -1.60) passes into the left wall",
    "prop at (0.00, 0.00) z-fights with itself",
  ],
  "chapel": [
    "chancel at (0.00, 2.12) passes into lectern at (-1.75, 2.00)",
    "crackedFont at (-2.20, -2.20) passes into prop at (-1.55, -2.00)",
    "stainedWindow at (0.00, 2.80) up 1.00 z-fights with the bottom wall",
    "altar at (0.00, 2.25) up 0.15 z-fights with itself",
    "lectern at (-1.75, 2.00) z-fights with itself",
    "pricket at (-2.55, -0.65) z-fights with itself",
    "pricket at (2.55, 0.25) z-fights with itself",
  ],
  "library": [
    "prop at (0.00, -2.80) up 0.45 passes into the right wall",
    "prop at (0.00, -2.80) up 0.45 passes into the left wall",
    "prop at (0.00, -2.80) up 0.45 passes into prop at (2.80, 0.00) up 0.45",
    "prop at (-2.80, -1.54) up 0.45 passes into prop at (0.00, -2.80) up 0.45",
    "prop at (1.75, 2.80) up 0.45 passes into prop at (2.80, 0.00) up 0.45",
    "prop at (2.80, -1.30) up 0.45 passes into prop at (2.80, 0.00) up 0.45",
    "fallenBookcase at (-1.50, 1.75) passes into prop at (-1.75, 2.80)",
    "prop at (-1.75, 2.80) up 0.45 passes into the left wall",
    "prop at (-1.75, 2.80) up 0.45 passes into prop at (-2.80, 1.54) up 0.45",
    "prop at (1.75, 2.80) up 0.45 passes into the right wall",
    "fallenBookcase at (-1.50, 1.75) passes into prop at (-2.80, 1.54)",
    "prop at (-0.12, -0.80) up 0.77 passes into prop at (0.25, -0.95) up 0.77",
    "fallenBookcase at (-1.50, 1.75) passes into the doorway left",
    "prop at (-0.75, 1.55) passes into the floor",
    "globe at (1.85, 1.00) z-fights with itself",
    "prop at (0.00, -2.80) up 0.45 z-fights with the right wall",
    "prop at (1.75, 2.80) up 0.45 z-fights with the right wall",
    "prop at (0.00, -2.80) up 0.45 z-fights with the left wall",
  ],
  "grand-staircase": [
    "newel at (1.24, -1.50) passes into prop at (0.00, 0.00)",
    "prop at (0.00, 0.00) passes into prop at (0.00, 0.00) up 1.57",
    "cupboardDoor at (-1.00, -1.43) passes into prop at (0.00, 0.00)",
    "newel at (1.24, -1.50) passes into prop at (0.00, 0.00) up 1.57",
    "prop at (0.00, 0.00) up 1.57 passes into the left wall",
    "prop at (0.00, 0.00) z-fights with prop at (0.00, 0.00) up 1.57",
  ],
  "foyer": [
    "deadPalm at (-2.25, 2.20) passes into the bottom wall",
    "shroudedMirror at (-1.65, -2.80) up 1.25 z-fights with itself",
  ],
  "entrance-hall": [
    "umbrellaStand at (2.35, 2.15) z-fights with itself",
  ],
  "chasm": [
    "bridge at (0.00, 0.00) passes into the second explorer's spot",
    "handLines at (0.00, 0.00) passes into the second explorer's spot",
  ],
  "graveyard": [
    "gravelPath at (0.00, 1.55) passes into the second explorer's spot",
  ],
  "underground-lake": [
    "shore at (0.00, 0.00) passes into the second explorer's spot",
  ],
  "upper-landing": [
    "stairHead at (0.00, 0.00) passes into the floor",
    "balustrade at (0.00, 0.00) passes into newel at (-0.79, -1.41)",
    "rockingChair at (1.30, 1.30) passes into the floor",
  ],
};

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
    const font = CHAPEL.props.find((prop) => prop.build.name === "crackedFont");
    if (!font) throw new Error("The Chapel has no font");
    const declared = (contacts: Contact[]) => checkRoom({ ...CHAPEL, props: CHAPEL.props.map((prop) => (prop === font ? { ...prop, contacts } : prop)) });
    const touching = declared([{ with: "prop", because: "the font has been shoved against the pew" }]);
    expect(touching.accepted.map((finding) => finding.key)).toEqual(["crackedFont at (-2.20, -2.20) passes into prop at (-1.55, -2.00)"]);
    expect(touching.unusedContacts).toEqual([]);
    expect(declared([{ with: "right", because: "nothing" }]).unusedContacts).toEqual(["crackedFont at (-2.20, -2.20) with right"]);
  });

  for (const room of BENCH_ROOMS) {
    it(`${room.id}: no piece passes into another, and no faces fight`, async () => {
      const { findings, unusedContacts } = await checker.check(room.id);
      const known = new Set(BASELINE[room.id] ?? []);
      const baselined = findings.filter((finding) => known.has(finding.key));
      if (baselined.length) console.warn(`${room.id}, known overlaps for the review pass:\n  ${baselined.map((finding) => finding.text).join("\n  ")}`);
      expect(findings.filter((finding) => !known.has(finding.key)).map((finding) => finding.text), "new overlaps: fix them, or declare the contact on the piece").toEqual([]);
      expect([...known].filter((key) => !findings.some((finding) => finding.key === key)), "fixed: remove them from the baseline").toEqual([]);
      expect(unusedContacts, "declared contacts that no longer happen, or name nothing").toEqual([]);
    }, TIME_LIMIT_MS + 30_000);
  }
});
