import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Layout } from "../engine/board";
import { createBakeScheduler, type BakeScheduler } from "./bake-schedule";
import { frameSlicer, inlineSlicer, type Slicer } from "./build-slices";
import { stubCanvas } from "./headless";
import { buildHouse } from "./house";
import { inHouse } from "./house-walk";
import type { FigureMesher } from "./figure-mesh";

stubCanvas();

const LAYOUT: Layout = {
  tiles: [
    { tile: "upper-landing", floor: "upper", x: 0, y: 0, rotation: 0 },
    { tile: "foyer", floor: "ground", x: 1, y: 0, rotation: 0 },
    { tile: "entrance-hall", floor: "ground", x: 2, y: 0, rotation: 0 },
  ],
};

/** A bake that records which rooms are sent to it, and in what order, and never finishes. */
function recordingBake(): { bakes: BakeScheduler; sent: string[] } {
  const real = createBakeScheduler(() => [{ run: () => new Promise(() => undefined), finish: () => new Promise(() => undefined), dispose: () => undefined }]);
  const sent: string[] = [];
  return {
    sent,
    bakes: {
      ...real,
      submit: (job) => {
        sent.push(job.room);
        return real.submit(job);
      },
    },
  };
}

/** A clock on which every step of building a room takes longer than a frame's budget, so each frame takes one step. */
function slowClock() {
  let at = 0;
  return () => (at += 100);
}

/** Runs frames until `done`, and how many it took; a build that never gets there fails. */
function framesUntil(slices: Slicer, done: () => boolean): number {
  let frames = 0;
  while (!done()) {
    if (frames++ > 10_000) throw new Error("The house never got there");
    slices.frame();
  }
  return frames;
}

describe("building the house", () => {
  it("builds a room over several frames, the floor showing first, and bakes each floor once all of its rooms are built", () => {
    const { bakes, sent } = recordingBake();
    const slices = frameSlicer(8, slowClock());
    const house = buildHouse(LAYOUT, bakes, { slices });
    const built = () => house.rooms.map((room) => room.id);

    // Nothing is built on the way in, but the camera can already frame the floor showing.
    expect(built()).toEqual([]);
    expect(house.corners()).toHaveLength(16);
    expect(house.built()).toBe(false);

    // A room is frozen a step a frame, never in one long frame.
    expect(framesUntil(slices, () => built().length > 0)).toBeGreaterThan(2);
    expect(built()).toEqual(["foyer"]);
    expect(sent).toEqual([]);
    framesUntil(slices, () => built().length > 1);
    expect(built().sort()).toEqual(["entrance-hall", "foyer"]);
    // The ground floor is in: its rooms go to the bake together, before the floor above is built.
    expect(sent.sort()).toEqual(["entrance-hall", "foyer"]);
    framesUntil(slices, () => built().length > 2);
    expect(sent.at(-1)).toBe("upper-landing");
    expect(slices.pending()).toBe(0);
    expect(sent).toHaveLength(3);
    // Built, but not ready: no light has landed.
    expect(house.built()).toBe(false);
  });

  it("builds a room changed while the house is still being built once, with its floor", () => {
    const { bakes, sent } = recordingBake();
    const slices = frameSlicer(8, slowClock());
    const house = buildHouse(LAYOUT, bakes, { slices });
    house.setLayout({ tiles: [...LAYOUT.tiles.filter((tile) => tile.tile !== "entrance-hall"), { tile: "dining-room", floor: "ground", x: 1, y: -1, rotation: 1 }] });
    framesUntil(slices, () => slices.pending() === 0);
    expect(house.rooms.map((room) => room.id).sort()).toEqual(["dining-room", "foyer", "upper-landing"]);
    expect(sent.filter((room) => room === "foyer")).toHaveLength(1);
    expect(sent).not.toContain("entrance-hall");
  });

  it("drops a room taken out part way through its freeze", () => {
    const { bakes, sent } = recordingBake();
    const slices = frameSlicer(8, slowClock());
    const house = buildHouse(LAYOUT, bakes, { slices });
    slices.frame();
    slices.frame();
    expect(house.rooms).toEqual([]);
    house.setLayout({ tiles: LAYOUT.tiles.filter((tile) => tile.tile !== "foyer") });
    framesUntil(slices, () => slices.pending() === 0);
    expect(house.rooms.map((room) => room.id).sort()).toEqual(["entrance-hall", "upper-landing"]);
    expect(sent).not.toContain("foyer");
    expect(house.built()).toBe(false);
  });

  it("inline, builds every room and sends every floor to the bake at once", () => {
    const { bakes, sent } = recordingBake();
    const house = buildHouse(LAYOUT, bakes, { slices: inlineSlicer() });
    expect(house.rooms).toHaveLength(3);
    expect(sent.sort()).toEqual(["entrance-hall", "foyer", "upper-landing"]);
  });
});

describe("a figure meshed off the page's thread", () => {
  it("stands as its pawn until its parts are meshed, then as itself", async () => {
    let meshed!: () => void;
    const coming = new Promise<void>((resolve) => {
      meshed = resolve;
    });
    const figures: FigureMesher = { isMeshed: () => false, meshed: () => coming };
    const house = buildHouse(LAYOUT, recordingBake().bakes, { slices: inlineSlicer(), figures });
    const build = () => {
      const figure = new THREE.Group();
      figure.name = "the figure";
      return figure;
    };
    house.addFigure({ id: "zoe", build, colour: "gold" }, inHouse(LAYOUT, "foyer", [0.8, 0, 0.8]), 0);
    expect(house.root.getObjectByName("the figure")).toBeUndefined();
    expect(house.figuresIn()).toBe(false);

    meshed();
    await coming;
    expect(house.root.getObjectByName("the figure")).toBeDefined();
    expect(house.figuresIn()).toBe(true);
  });
});
