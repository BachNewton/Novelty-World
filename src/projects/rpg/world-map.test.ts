import { describe, expect, it } from "vitest";
import {
  MAP_COLS,
  MAP_ROWS,
  createEmptyGrid,
  createMapStore,
  parseCellEdits,
  parseGrid,
  parseTile,
  type MapGrid,
} from "./world-map";

const GRASS = "/rpg/tiles/Grass/Grass_Tiles_1.png";
const BEACH = "/rpg/tiles/Beach/Beach_Tiles.png"; // animated, frameW 5

describe("parseTile", () => {
  it("accepts manifest tiles", () => {
    expect(parseTile({ src: GRASS, sx: 1, sy: 2 })).toEqual({ src: GRASS, sx: 1, sy: 2 });
  });

  it("migrates legacy /tiles/ paths and folds animated sheets to frame 0", () => {
    expect(parseTile({ src: "/tiles/Grass/Grass_Tiles_1.png", sx: 0, sy: 0 })).toEqual({
      src: GRASS,
      sx: 0,
      sy: 0,
    });
    expect(parseTile({ src: BEACH, sx: 7, sy: 1 })).toEqual({ src: BEACH, sx: 2, sy: 1 });
  });

  it("rejects unknown srcs and malformed coordinates", () => {
    expect(parseTile({ src: "/evil.png", sx: 0, sy: 0 })).toBeNull();
    expect(parseTile({ src: GRASS, sx: -1, sy: 0 })).toBeNull();
    expect(parseTile({ src: GRASS, sx: 1.5, sy: 0 })).toBeNull();
    expect(parseTile("nope")).toBeNull();
  });
});

describe("parseGrid", () => {
  it("round-trips a valid grid", () => {
    const grid = createEmptyGrid();
    grid[3][4] = { src: GRASS, sx: 1, sy: 1 };
    expect(parseGrid(JSON.parse(JSON.stringify(grid)))).toEqual(grid);
  });

  it("rejects wrong dimensions", () => {
    expect(parseGrid([])).toBeNull();
    expect(parseGrid(createEmptyGrid().map((row) => row.slice(1)))).toBeNull();
  });
});

describe("parseCellEdits", () => {
  it("keeps valid paints and erases, drops everything else", () => {
    expect(
      parseCellEdits([
        { c: 0, r: 0, tile: { src: GRASS, sx: 1, sy: 2 } },
        { c: MAP_COLS - 1, r: MAP_ROWS - 1, tile: null },
        { c: MAP_COLS, r: 0, tile: null },
        { c: 0, r: MAP_ROWS, tile: null },
        { c: 0, r: 0, tile: { src: "/evil.png", sx: 0, sy: 0 } },
        "nope",
      ]),
    ).toEqual([
      { c: 0, r: 0, tile: { src: GRASS, sx: 1, sy: 2 } },
      { c: MAP_COLS - 1, r: MAP_ROWS - 1, tile: null },
    ]);
    expect(parseCellEdits(undefined)).toEqual([]);
  });
});

describe("createMapStore", () => {
  const tile = { src: GRASS, sx: 1, sy: 1 };

  function store() {
    const saved: MapGrid[] = [];
    let notified = 0;
    const map = createMapStore(createEmptyGrid(), (grid) => saved.push(grid));
    map.subscribe(() => (notified += 1));
    return { map, saved, notifications: () => notified };
  }

  it("applies edits into a new grid, persisting and notifying once", () => {
    const { map, saved, notifications } = store();
    const before = map.grid();
    const changed = map.apply([
      { c: 1, r: 1, tile },
      { c: 2, r: 2, tile },
    ]);
    expect(changed).toHaveLength(2);
    expect(map.grid()).not.toBe(before);
    expect(before[1][1]).toBeNull();
    expect(map.grid()[1][1]).toEqual(tile);
    expect(saved).toEqual([map.grid()]);
    expect(notifications()).toBe(1);
  });

  it("returns only edits that change a cell, and skips no-op commits", () => {
    const { map, saved } = store();
    map.apply([{ c: 1, r: 1, tile }]);
    expect(map.apply([{ c: 1, r: 1, tile: { ...tile } }, { c: 0, r: 0, tile: null }])).toEqual([]);
    expect(saved).toHaveLength(1);
  });

  it("clears, and a clear of an empty map is a no-op", () => {
    const { map, saved } = store();
    map.clear();
    expect(saved).toHaveLength(0);
    map.apply([{ c: 1, r: 1, tile }]);
    map.clear();
    expect(map.grid()).toEqual(createEmptyGrid());
    expect(saved).toHaveLength(2);
  });

  it("replaces the whole grid", () => {
    const { map } = store();
    const next = createEmptyGrid();
    next[5][5] = tile;
    map.replace(next);
    expect(map.grid()).toBe(next);
  });
});
