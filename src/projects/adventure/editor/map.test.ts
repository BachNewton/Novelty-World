import { describe, expect, it } from "vitest";
import { GROUND_SIDE } from "../ground";
import { codeMap, parseMap, serializeMap } from "./map";

const read = (text: string) => parseMap(JSON.parse(text));
const withPiece = (piece: Record<string, unknown>) => ({ version: 1, places: [{ name: "TREES", placements: [piece] }] });
const GRASS_ROWS = Array.from({ length: GROUND_SIDE }, () => ".".repeat(GROUND_SIDE));
const withGround = (ground: Record<string, unknown>) => ({ version: 2, places: [], ground });

describe("a map's file", () => {
  it("carries the code's town and ground through save and load unchanged", () => {
    const map = codeMap();
    const again = read(serializeMap(map));
    expect(again).toEqual(map);
    expect(serializeMap(again)).toBe(serializeMap(map));
  });

  it("reads a map of version 1, from before the ground was the map's, with the code's ground", () => {
    expect(parseMap({ version: 1, places: [] }).ground).toEqual(codeMap().ground);
  });

  it.each([
    ["a piece no kit has", withPiece({ piece: "tree-wobbly", x: 0, z: 0 }), "tree-wobbly"],
    ["a misspelt field", withPiece({ piece: "tree", x: 0, z: 0, trun: 1 }), "trun"],
    ["a cell that isn't a number", withPiece({ piece: "tree", x: "1", z: 0 }), "number x"],
    ["half a turn", withPiece({ piece: "tree", x: 0, z: 0, turn: 0.5 }), "turn"],
    ["a mirror that isn't true or false", withPiece({ piece: "tree", x: 0, z: 0, mirror: 1 }), "mirror"],
    ["another format's version", { version: 3, places: [] }, "version"],
    ["a place named twice", { version: 1, places: [{ name: "INN", placements: [] }, { name: "INN", placements: [] }] }, "named twice"],
    ["a version 2 map without its ground", { version: 2, places: [] }, "ground"],
    ["a mark that is no kind of ground", withGround({ rows: [...GRASS_ROWS.slice(1), `${".".repeat(GROUND_SIDE - 1)}x`], variants: [] }), "no kind"],
    ["a tile chosen for grass", withGround({ rows: GRASS_ROWS, variants: [{ x: 0, z: 0, tile: "Rocks" }] }), "grass"],  ])("refuses %s, saying what", (_, file, says) => {
    expect(() => parseMap(file)).toThrow(says);
  });

  it("names every problem in a file, never only the first", () => {
    const file = { version: 1, places: [{ name: "A", placements: [{ piece: "nope", x: 0, z: 0 }, { piece: "tree", x: 0 }] }] };
    expect(() => parseMap(file)).toThrow(/placements\[0\].*placements\[1\]/);
  });
});
