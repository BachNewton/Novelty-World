import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADJACENCY, CONTINENTS, TERRITORIES } from "../map";
import { BOARD_HEIGHT, BOARD_WIDTH, CONTINENT_OUTLINES, EDGE_LINE, SEA_LINES, TERRITORY_SHAPES } from "./board-data";

describe("the drawn board", () => {
  it("has a shape for each of map.ts's 42 territories, and nothing else", () => {
    expect(Object.keys(TERRITORY_SHAPES).sort()).toEqual(TERRITORIES.map((t) => t.id).sort());
    for (const { path } of Object.values(TERRITORY_SHAPES)) expect(path).toMatch(/^M[\d.-]+ [\d.-]+l.*z$/);
  });

  it("puts every army marker on the board", () => {
    for (const { label } of Object.values(TERRITORY_SHAPES)) {
      expect(label[0]).toBeGreaterThan(0);
      expect(label[0]).toBeLessThan(BOARD_WIDTH);
      expect(label[1]).toBeGreaterThan(0);
      expect(label[1]).toBeLessThan(BOARD_HEIGHT);
    }
  });

  it("outlines every continent", () => {
    expect(Object.keys(CONTINENT_OUTLINES).sort()).toEqual(CONTINENTS.map((c) => c.id).sort());
  });

  it("draws sea lines only between neighbours, and Alaska to Kamchatka across the edge", () => {
    for (const { between: [a, b] } of SEA_LINES) expect(ADJACENCY[a]).toContain(b);
    expect(SEA_LINES.some(({ between }) => between.includes("alaska") && between.includes("kamchatka"))).toBe(false);
    expect(EDGE_LINE.alaska[0]).toBeLessThan(BOARD_WIDTH / 4);
    expect(EDGE_LINE.kamchatka[0]).toBeGreaterThan((BOARD_WIDTH * 3) / 4);
  });

  it("stays small enough to ship to a phone", () => {
    expect(readFileSync("src/projects/risk/board/board-data.ts").length).toBeLessThan(60_000);
  });
});
