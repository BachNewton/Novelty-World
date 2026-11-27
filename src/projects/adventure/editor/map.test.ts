import { describe, expect, it } from "vitest";
import { GROUND_SIDE } from "../ground";
import { added, codeMap, parseMap, serializeMap } from "./map";

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

  it("carries a piece's texture through save and load", () => {
    const map = added(codeMap(), { piece: "roof-high", x: 3, z: 4, texture: "variation-a" });
    expect(read(serializeMap(map))).toEqual(map);
  });

  it("reads a map of version 1, from before the ground was the map's, with the code's ground", () => {
    expect(parseMap({ version: 1, places: [] }).ground).toEqual(codeMap().ground);
  });

  it("reads a map of version 2, from before textures, its pieces in the kit's own colours", () => {
    const { rows } = JSON.parse(serializeMap(codeMap())).ground;
    const map = parseMap({ version: 2, places: [{ name: "PLACED", placements: [{ piece: "roof-high", x: 0, z: 0 }] }], ground: { rows, variants: [] } });
    expect(map.places[0].placements).toEqual([{ piece: "roof-high", x: 0, z: 0 }]);
  });

  it.each([
    ["a piece no kit has", withPiece({ piece: "tree-wobbly", x: 0, z: 0 }), "tree-wobbly"],
    ["a misspelt field", withPiece({ piece: "tree", x: 0, z: 0, trun: 1 }), "trun"],
    ["a cell that isn't a number", withPiece({ piece: "tree", x: "1", z: 0 }), "number x"],
    ["half a turn", withPiece({ piece: "tree", x: 0, z: 0, turn: 0.5 }), "turn"],
    ["a mirror that isn't true or false", withPiece({ piece: "tree", x: 0, z: 0, mirror: 1 }), "mirror"],
    ["another format's version", { version: 4, places: [] }, "version"],
    ["a texture the town kit hasn't", withPiece({ piece: "roof", x: 0, z: 0, texture: "variation-z" }), "variation-z"],
    ["a texture on a Nature Kit piece", withPiece({ piece: "grass", x: 0, z: 0, texture: "variation-a" }), "Nature Kit"],
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
