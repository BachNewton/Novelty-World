import type * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { stubCanvas } from "../headless";
import { BENCH_ROOMS } from "../rooms";
import { roomTile } from "../stage";
import { PICTURE_NAMES, picture, pictureRows } from "./pictures";

/** The names of the pictures a room hangs, read off its built props. */
function picturesIn(props: readonly { build: () => THREE.Object3D }[]): string[] {
  const names: string[] = [];
  for (const prop of props) {
    prop.build().traverse((object) => {
      const name: unknown = object.userData.picture;
      if (typeof name === "string") names.push(name);
    });
  }
  return names;
}

describe("the picture library", () => {
  beforeAll(stubCanvas);

  it("draws every picture as a full rectangle of rows its legend covers", () => {
    for (const name of PICTURE_NAMES) {
      const { rows, legend } = picture(name);
      for (const row of rows) expect(row.length, name).toBe(rows[0].length);
      for (const cell of rows.join("")) expect(legend, `${name}: "${cell}"`).toHaveProperty(cell);
    }
  });

  it("leaves an oval picture's corners clear", () => {
    const rows = pictureRows(picture("empty oval"));
    expect(rows[0][0]).toBe(".");
    expect(rows[rows.length >> 1][rows[0].length >> 1]).toBe("o");
  });

  it("never hangs one picture twice on a floor", () => {
    const byFloor = new Map<string, { room: string; name: string }[]>();
    for (const room of BENCH_ROOMS) {
      for (const name of picturesIn(room.props)) {
        for (const floor of roomTile(room.id).floors) {
          const hung = byFloor.get(floor) ?? [];
          hung.push({ room: room.id, name });
          byFloor.set(floor, hung);
        }
      }
    }
    expect(byFloor.size).toBeGreaterThan(0);
    for (const [floor, hung] of byFloor) {
      const repeats = hung.filter((one, i) => hung.findIndex((other) => other.name === one.name) !== i);
      expect(repeats, `repeated on the ${floor} floor`).toEqual([]);
    }
  });
});
