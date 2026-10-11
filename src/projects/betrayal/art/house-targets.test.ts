import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { FloorId } from "../types";
import { definition, type FloorChoice } from "./house";
import { HOUSE_FIXTURE } from "./house-layout";
import { choiceLayout, FINGER, fingerSized, followFloor, targetPlace, type PlaceContext, type Target } from "./house-targets";
import type { HousePoint, Stairway } from "./house-walk";
import { TILE } from "./room";

const stairway: Stairway = (room, toward) => definition(room).stairs?.[toward];
const LEVEL: Record<FloorId, number> = { basement: -7, ground: 0, upper: 7, roof: 14 };
/** Longfellow by the Library's pawn spot, the pawn in the Foyer. */
const FIGURES: Record<string, HousePoint> = {
  longfellow: { floor: "ground", x: 6.5, y: 0, z: 6.5 },
  pawn: { floor: "ground", x: 6, y: 0, z: 0 },
};

const context = (showing: FloorChoice): PlaceContext => ({
  layout: HOUSE_FIXTURE,
  showing,
  stairway,
  scenePoint: (point) => new THREE.Vector3(point.x, point.y + LEVEL[point.floor], point.z),
  figureAt: (figure) => FIGURES[figure],
});

const UPSTAIRS: Target = {
  id: "walk:upper-landing",
  kind: "room",
  room: "upper-landing",
  route: { figure: "longfellow", rooms: ["library", "foyer", "grand-staircase", "upper-landing"], end: () => [0, 0] },
};

/** The cell below the Library, explored through its bottom doorway. */
const EXPLORE: Target = { id: "e", kind: "explore", floor: "ground", x: 1, y: 2, room: "library", direction: "bottom" };

describe("targetPlace", () => {
  it("marks a room on the floor showing, as a pointer target over its whole tile", () => {
    const place = targetPlace({ id: "a", kind: "room", room: "dining-room" }, context("ground"));
    expect(place.mark).toEqual({ id: "a", kind: "room", room: "dining-room" });
    expect(place.outline).toHaveLength(4);
    expect(place.cell).toEqual({ floor: "ground", x: 1, y: -1 });
  });

  it("shows a room on another floor as the stair its route takes there from this one", () => {
    const place = targetPlace(UPSTAIRS, context("ground"));
    expect(place.mark).toEqual({ id: UPSTAIRS.id, kind: "stair", room: "grand-staircase", toward: "upper-landing" });
    expect(place.cell).toEqual({ floor: "ground", x: 0, y: 0 });
    expect(place.floor).toBe("upper");
    expect(targetPlace(UPSTAIRS, context("upper")).mark?.kind).toBe("room");
  });

  it("leaves a room on another floor with no stair to it unmarked and out of the pointer's reach", () => {
    const place = targetPlace({ id: "b", kind: "room", room: "bedroom" }, context("ground"));
    expect(place.mark).toBeNull();
    expect(place.outline).toBeNull();
    expect(place.floor).toBe("upper");
  });

  it("puts a cell to explore over its whole cell, marked with the doorway it is explored through, a cell or a ghost on its own floor, and a cell on another floor at its place on this one", () => {
    const explore = targetPlace(EXPLORE, context("ground"));
    expect(explore.mark).toEqual({ id: "e", kind: "explore", floor: "ground", x: 1, y: 2, room: "library", direction: "bottom" });
    expect(explore.anchor.z).toBeCloseTo(2 * TILE);
    const zs = (explore.outline ?? []).map((corner) => corner.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(TILE);
    expect(explore.cell).toEqual({ floor: "ground", x: 1, y: 2 });
    expect(targetPlace(EXPLORE, context("upper")).outline).toBeNull();
    const cell: Target = { id: "c", kind: "cell", floor: "basement", x: 1, y: 0 };
    const away = targetPlace(cell, context("ground"));
    expect(away.mark).toEqual({ id: "c", kind: "away", floor: "ground", x: 1, y: 0 });
    expect(away.anchor.y).toBeCloseTo(targetPlace({ ...cell, floor: "ground" }, context("ground")).anchor.y);
    // Choosing it shows the ghost on its own floor: it still lies on the basement.
    expect([away.floor, away.cell.floor]).toEqual(["basement", "basement"]);
    expect(targetPlace(cell, context("all")).mark).toEqual({ id: "c", kind: "cell", floor: "basement", x: 1, y: 0 });
    expect(targetPlace(cell, context("basement")).mark).toEqual({ id: "c", kind: "cell", floor: "basement", x: 1, y: 0 });
    const doors = [
      { direction: "top", doorway: "joined" },
      { direction: "left", doorway: "unexplored" },
    ] as const;
    const ghost = targetPlace({ id: "g", kind: "ghost", floor: "ground", x: 0, y: 1, tile: "kitchen", rotation: 1, doors }, context("all"));
    expect(ghost.mark).toEqual({ id: "g", kind: "ghost", floor: "ground", x: 0, y: 1, doors });
  });

  it("rings a figure, itself or another, as a box the pointer can hit", () => {
    for (const kind of ["self", "figure"] as const) {
      const place = targetPlace({ id: kind, kind, figure: "pawn" }, context("ground"));
      expect(place.mark).toEqual({ id: kind, kind: "figure", figure: "pawn" });
      expect(place.box).toBe(true);
      expect(place.outline).toHaveLength(8);
      expect(place.cell).toEqual({ floor: "ground", x: 1, y: 0 });
    }
    expect(targetPlace({ id: "s", kind: "self", figure: "pawn" }, context("upper")).outline).toBeNull();
  });
});

describe("choiceLayout", () => {
  /** Looking straight down, ten pixels to the metre; nothing behind the camera beyond z = 20. */
  const project = (point: THREE.Vector3) => (point.z > 20 ? null : { x: point.x * 10 + 500, y: point.z * 10 + 500 });
  const places = (targets: Target[], showing: FloorChoice) => targets.map((target) => ({ id: target.id, place: targetPlace(target, context(showing)) }));

  it("lists every target in front of the camera for the focus, and only those showing for the pointer", () => {
    const layout = choiceLayout(places([{ id: "a", kind: "room", room: "dining-room" }, { id: "b", kind: "room", room: "bedroom" }, UPSTAIRS], "ground"), "a", project);
    expect(layout.focused).toBe("a");
    expect(layout.points.map((point) => point.id)).toEqual(["a", "b", UPSTAIRS.id]);
    expect(layout.targets.map((target) => target.id)).toEqual(["a", UPSTAIRS.id]);
  });

  it("leaves out a target behind the camera", () => {
    const layout = choiceLayout(places([{ id: "far", kind: "cell", floor: "ground", x: 0, y: 5 }], "ground"), null, project);
    expect(layout.points).toEqual([]);
    expect(layout.targets).toEqual([]);
  });

  it("makes every pointer target at least a fingertip each way", () => {
    const layout = choiceLayout(places([EXPLORE, { id: "s", kind: "self", figure: "pawn" }], "ground"), null, project);
    for (const target of layout.targets) {
      const xs = target.outline.map((point) => point.x);
      const ys = target.outline.map((point) => point.y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(FINGER);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(FINGER);
    }
  });
});

describe("fingerSized", () => {
  it("keeps an outline a finger can already hit, and grows a smaller one round its middle", () => {
    const big = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ];
    expect(fingerSized(big)).toEqual(big);
    expect(
      fingerSized([
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 70 },
      ]),
    ).toEqual([
      { x: 15 - FINGER / 2, y: 10 },
      { x: 15 + FINGER / 2, y: 10 },
      { x: 15 + FINGER / 2, y: 70 },
      { x: 15 - FINGER / 2, y: 70 },
    ]);
  });
});

describe("followFloor", () => {
  it("follows the active explorer to their new floor when the view was on the one they left", () => {
    expect(followFloor("ground", "ground", "upper")).toBe("upper");
  });

  it("never overrides a floor the player chose to look at instead", () => {
    expect(followFloor("basement", "ground", "upper")).toBe("basement");
    expect(followFloor("upper", "ground", "upper")).toBe("upper");
  });

  it("leaves every floor showing", () => {
    expect(followFloor("all", "ground", "upper")).toBe("all");
  });
});
