import { describe, expect, it } from "vitest";
import { codeMap, parseMap, serializeMap } from "./map";

const read = (text: string) => parseMap(JSON.parse(text));
const withPiece = (piece: Record<string, unknown>) => ({ version: 1, places: [{ name: "TREES", placements: [piece] }] });

describe("a map's file", () => {
  it("carries the code's town through save and load unchanged", () => {
    const map = codeMap();
    const again = read(serializeMap(map));
    expect(again).toEqual(map);
    expect(serializeMap(again)).toBe(serializeMap(map));
  });

  it.each([
    ["a piece no kit has", withPiece({ piece: "tree-wobbly", x: 0, z: 0 }), "tree-wobbly"],
    ["a misspelt field", withPiece({ piece: "tree", x: 0, z: 0, trun: 1 }), "trun"],
    ["a cell that isn't a number", withPiece({ piece: "tree", x: "1", z: 0 }), "number x"],
    ["half a turn", withPiece({ piece: "tree", x: 0, z: 0, turn: 0.5 }), "turn"],
    ["a mirror that isn't true or false", withPiece({ piece: "tree", x: 0, z: 0, mirror: 1 }), "mirror"],
    ["another format's version", { version: 2, places: [] }, "version"],
    ["a place named twice", { version: 1, places: [{ name: "INN", placements: [] }, { name: "INN", placements: [] }] }, "named twice"],
  ])("refuses %s, saying what", (_, file, says) => {
    expect(() => parseMap(file)).toThrow(says);
  });

  it("names every problem in a file, never only the first", () => {
    const file = { version: 1, places: [{ name: "A", placements: [{ piece: "nope", x: 0, z: 0 }, { piece: "tree", x: 0 }] }] };
    expect(() => parseMap(file)).toThrow(/placements\[0\].*placements\[1\]/);
  });
});
