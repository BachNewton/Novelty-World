import { describe, expect, it } from "vitest";
import { DESKTOP } from "../quality";
import { chunkDetail, tileWidth, wantedChunks, wantedTiles } from "./streaming";

describe("the land's tiles", () => {
  const eye = { x: 37, y: 30, z: -210 };
  const tiles = wantedTiles(eye, DESKTOP);

  it("covers the view without overlap, finest under the camera", () => {
    let area = 0;
    for (const t of tiles) area += tileWidth(t.level) ** 2;
    const covered = new Set(tiles.map((t) => `${t.level}:${t.i}:${t.j}`));
    expect(covered.size).toBe(tiles.length);
    const under = tiles.find((t) => {
      const size = tileWidth(t.level);
      return eye.x >= t.i * size && eye.x < (t.i + 1) * size && eye.z >= t.j * size && eye.z < (t.j + 1) * size;
    });
    expect(under?.level).toBe(0);
    // Every point within the view distance lies under exactly one tile.
    for (const [x, z] of [[eye.x + 1500, eye.z], [eye.x - 4000, eye.z + 2500], [eye.x, eye.z + 90]]) {
      const over = tiles.filter((t) => {
        const size = tileWidth(t.level);
        return x >= t.i * size && x < (t.i + 1) * size && z >= t.j * size && z < (t.j + 1) * size;
      });
      expect(over).toHaveLength(1);
    }
    expect(area).toBeGreaterThan(Math.PI * DESKTOP.viewDistance ** 2);
  });

  it("is coarser further away", () => {
    const at = (x: number, z: number) =>
      tiles.find((t) => {
        const size = tileWidth(t.level);
        return x >= t.i * size && x < (t.i + 1) * size && z >= t.j * size && z < (t.j + 1) * size;
      })?.level ?? -1;
    expect(at(eye.x + 3000, eye.z)).toBeGreaterThan(at(eye.x + 400, eye.z));
    expect(at(eye.x + 400, eye.z)).toBeGreaterThan(at(eye.x + 20, eye.z));
  });
});

describe("plant detail by distance", () => {
  it("draws trees in full near by and in their far shape further out, and none past their reach", () => {
    expect(chunkDetail(DESKTOP.trees, 10)).toEqual({ detail: "near", keep: 1 });
    expect(chunkDetail(DESKTOP.trees, DESKTOP.trees.near + 50)?.detail).toBe("far");
    expect(chunkDetail(DESKTOP.trees, DESKTOP.trees.far + 1)).toBeNull();
  });

  it("thins a reach only past where it says", () => {
    const reach = { near: 50, far: 500, thinFrom: 200, keep: 0.5 };
    expect(chunkDetail(reach, 150)?.keep).toBe(1);
    expect(chunkDetail(reach, 300)?.keep).toBe(0.5);
  });

  it("lists the chunks round a point nearest first", () => {
    const chunks = wantedChunks(10, 10, 200);
    expect(chunks[0]).toEqual({ chunkX: 0, chunkZ: 0 });
    expect(chunks.length).toBeGreaterThan(20);
  });
});
