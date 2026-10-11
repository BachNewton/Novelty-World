import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ROOMS } from "../data/rooms";
import { roomWind } from "./wind";

const blowing = (id: string, sheltered?: boolean) =>
  roomWind({ id, sheltered })(1.7, new THREE.Vector3()).length() > 0;

describe("a room's air", () => {
  it("blows in every room its tile counts as outside, and nowhere else", () => {
    for (const tile of ROOMS) expect(blowing(tile.id), tile.id).toBe(tile.outside);
  });

  it("is still in an outside room its art shelters", () => {
    const conservatory = ROOMS.find((tile) => tile.id === "conservatory");
    expect(conservatory?.outside).toBe(true);
    expect(blowing("conservatory", true)).toBe(false);
  });

  it("fails loudly for a room with no tile", () => {
    expect(() => roomWind({ id: "no-such-room" })).toThrow();
  });
});
