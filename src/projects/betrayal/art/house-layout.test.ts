import { describe, expect, it } from "vitest";
import { CATALOG } from "../data";
import { EDGES, neighbourCell, openings, opposite, placementsAt, roomAt, startingBoard, turn, type Layout } from "../engine/board";
import { randomFor } from "../engine/random";
import type { Edge, Rotation } from "../types";
import { DIRECTION, doorways, HOUSE_FIXTURE, printedEdge, reviewHouse, tileTurn, wallIsCut } from "./house-layout";

const ROTATIONS: Rotation[] = [0, 1, 2, 3];
/** View 0's camera, looking from the bottom-right corner. */
const FROM_BOTTOM_RIGHT = { x: Math.SQRT1_2, z: Math.SQRT1_2 };

function tile(layout: Layout, id: string) {
  const found = layout.tiles.find((t) => t.tile === id);
  if (!found) throw new Error(`${id} is not in the layout`);
  return found;
}

describe("HOUSE_FIXTURE", () => {
  it("starts from the engine's own starting tiles", () => {
    const start = startingBoard(CATALOG, ["base"], randomFor("board", "setup")).tiles;
    expect(HOUSE_FIXTURE.tiles.slice(0, start.length)).toEqual(start);
  });

  it("places every other room legally, through a doorway it meets, in order", () => {
    const start = startingBoard(CATALOG, ["base"], randomFor("board", "setup")).tiles.length;
    for (let i = start; i < HOUSE_FIXTURE.tiles.length; i++) {
      const before: Layout = { tiles: HOUSE_FIXTURE.tiles.slice(0, i) };
      const placed = HOUSE_FIXTURE.tiles[i];
      expect(CATALOG.rooms[placed.tile].floors).toContain(placed.floor);
      const facing = EDGES.filter((direction) => {
        const cell = neighbourCell(placed, direction);
        const next = roomAt(before, placed.floor, cell.x, cell.y);
        return next !== undefined && openings(CATALOG, next).includes(opposite(direction));
      });
      expect(facing.length).toBeGreaterThan(0);
      const legal = placementsAt(before, CATALOG, placed.tile, { floor: placed.floor, x: placed.x, y: placed.y }, facing);
      expect(legal.find((p) => p.rotation === placed.rotation)?.seals).toBe(false);
    }
  });
});

describe("tile rotation", () => {
  it("printedEdge undoes the engine's turn", () => {
    for (const rotation of ROTATIONS) {
      for (const edge of EDGES) expect(printedEdge(turn(edge, rotation), rotation)).toBe(edge);
    }
  });

  it("tileTurn carries each printed edge's outside onto the board direction it faces", () => {
    for (const rotation of ROTATIONS) {
      const angle = tileTurn(rotation);
      for (const edge of EDGES) {
        const { x, z } = DIRECTION[edge];
        // three's turn about +y: x' = x cos + z sin, z' = −x sin + z cos.
        const turned = { x: x * Math.cos(angle) + z * Math.sin(angle), z: -x * Math.sin(angle) + z * Math.cos(angle) };
        const expected = DIRECTION[turn(edge, rotation)];
        expect(turned.x).toBeCloseTo(expected.x);
        expect(turned.z).toBeCloseTo(expected.z);
      }
    }
  });
});

describe("wallIsCut", () => {
  const cut = (id: string, direction: Edge, focus: string | null = null) => wallIsCut(HOUSE_FIXTURE, tile(HOUSE_FIXTURE, id), direction, FROM_BOTTOM_RIGHT, focus);

  it("cuts every wall that faces the camera", () => {
    expect(cut("grand-staircase", "bottom")).toBe(true);
    expect(cut("dining-room", "right")).toBe(true);
  });

  it("cuts both sides of a wall between two rooms", () => {
    // The Foyer's top wall faces away from the camera, but the Dining Room is beyond it.
    expect(cut("foyer", "top")).toBe(true);
    expect(cut("dining-room", "bottom")).toBe(true);
  });

  it("keeps the outside walls at the back of the house full", () => {
    expect(cut("grand-staircase", "top")).toBe(false);
    expect(cut("grand-staircase", "left")).toBe(false);
    expect(cut("dining-room", "top")).toBe(false);
    expect(cut("dining-room", "left")).toBe(false);
  });

  it("cuts an outside wall at the back when a room lies round its end, where the camera looks", () => {
    // Looking from the bottom right, the Library's left wall hides the near corner of the Grand Staircase.
    expect(cut("library", "left")).toBe(true);
    // From the top left, the Dining Room's right wall hides the near corner of the Entrance Hall.
    const fromTopLeft = { x: -Math.SQRT1_2, z: -Math.SQRT1_2 };
    expect(wallIsCut(HOUSE_FIXTURE, tile(HOUSE_FIXTURE, "dining-room"), "right", fromTopLeft, null)).toBe(true);
    expect(wallIsCut(HOUSE_FIXTURE, tile(HOUSE_FIXTURE, "chapel"), "right", fromTopLeft, null)).toBe(false);
  });

  it("keeps the focused room's back walls full, as the bench does", () => {
    expect(cut("foyer", "top", "foyer")).toBe(false);
    expect(cut("foyer", "bottom", "foyer")).toBe(true);
    expect(cut("dining-room", "bottom", "foyer")).toBe(true);
  });

  it("only looks at rooms on the same floor", () => {
    // The Bedroom is upstairs, beyond the Grand Staircase's left wall but a floor up.
    expect(cut("grand-staircase", "left")).toBe(false);
    expect(cut("upper-landing", "left")).toBe(true);
  });
});

describe("doorways", () => {
  const of = (id: string) => Object.fromEntries(doorways(HOUSE_FIXTURE, CATALOG, tile(HOUSE_FIXTURE, id)).map(({ edge, doorway }) => [edge, doorway]));

  it("tells joined doors, doors onto a wall and unexplored doors apart, by printed edge", () => {
    expect(of("entrance-hall")).toEqual({ top: "unexplored", bottom: "blind" });
    expect(of("foyer")).toEqual({ top: "joined", bottom: "joined" });
    // Turned a quarter, the Dining Room's printed top door faces right, onto an empty cell.
    expect(of("dining-room")).toEqual({ top: "unexplored", right: "joined" });
    expect(of("chapel")).toEqual({ top: "joined" });
  });

  it("leaves out passages and the locked front door", () => {
    expect(of("grand-staircase")).toEqual({});
  });
});

describe("reviewHouse", () => {
  const withArt = new Set(["drawing-room", "chapel", "library", "kitchen", "chasm", "furnace-room", "graveyard", "underground-lake"]);
  for (const room of ["kitchen", "chasm", "furnace-room", "graveyard", "underground-lake", "upper-landing", "foyer"]) {
    it(`${room}: joins a plain room to every doorway, each placed legally`, () => {
      const { layout, starts } = reviewHouse(room, CATALOG, withArt);
      const centre = tile(layout, room);
      expect(starts[0]).toBe(room);
      expect(layout.tiles).toHaveLength(openings(CATALOG, centre).length + 1);
      for (const direction of openings(CATALOG, centre)) {
        const cell = neighbourCell(centre, direction);
        const next = roomAt(layout, centre.floor, cell.x, cell.y);
        if (!next) throw new Error(`Nothing through ${room}'s ${direction} doorway`);
        expect(withArt.has(next.tile) || CATALOG.rooms[next.tile].outside).toBe(false);
        expect(openings(CATALOG, next)).toContain(opposite(direction));
      }
    });
  }
});
