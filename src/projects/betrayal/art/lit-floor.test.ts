import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { inlineScheduler } from "./bake-schedule";
import { freezeRoom } from "./freeze";
import { stubCanvas } from "./headless";
import { definition, shellRoom } from "./house";
import { createLitFloor } from "./lit-floor";
import { buildRoom } from "./stage";

stubCanvas();

describe("a lit floor", () => {
  it("shows a new room only once both its light and its shaders are ready, so its first frame never waits on a compile", async () => {
    let compiled!: () => void;
    const shaders = new Promise<void>((resolve) => {
      compiled = resolve;
    });
    const asked: THREE.Object3D[] = [];
    const bakes = inlineScheduler();
    const floor = createLitFloor(bakes, "bench", (object) => {
      asked.push(object);
      return shaders;
    });
    const id = "creaky-hallway";
    const placed = floor.place([{ id, room: freezeRoom(id, buildRoom(shellRoom(id), { explorer: null })), matrix: new THREE.Matrix4() }]);
    const room = floor.rooms.get(id);
    if (!room) throw new Error("The room was not placed");
    expect(asked).toEqual([room.root]);

    let shown = false;
    void placed.then(() => {
      shown = true;
    });
    // Its direct light lands, but its shaders are still compiling: it stays off the floor, and the place is not done.
    await new Promise<void>((resolve) => {
      const stop = bakes.subscribe(() => {
        if (!room.light) return;
        stop();
        resolve();
      });
    });
    expect(room.root.parent).toBeNull();
    expect(shown).toBe(false);

    compiled();
    await placed;
    expect(room.root.parent).toBe(floor.root);
    floor.dispose();
  }, 60_000);

  it("draws a room's added light in one pass, so three never marks its material changed while drawing it", () => {
    const floor = createLitFloor(inlineScheduler(), "bench");
    const id = "library";
    void floor.place([{ id, room: freezeRoom(id, buildRoom(definition(id), { explorer: null })), matrix: new THREE.Matrix4() }]);
    const room = floor.rooms.get(id);
    if (!room) throw new Error("The room was not placed");
    const blended = room.root.children.flatMap((child) => (child instanceof THREE.Mesh ? [child.material as THREE.Material] : [])).filter((material) => material.transparent && material.side === THREE.DoubleSide);
    expect(blended.length).toBeGreaterThan(0);
    expect(blended.filter((material) => !material.forceSinglePass)).toEqual([]);
    floor.dispose();
  }, 60_000);
});
