import { describe, expect, it } from "vitest";
import { Box3, Vector3, type BufferGeometry } from "three/webgpu";
import { PARTS } from "../roadside/mesh";
import { buildStreetLamp } from "../roadside/models";
import { TOWN_PARTS } from "../town-kit/paint";
import { buildTownLamp } from "../town-kit/lamps";
import { headOf, type LampKind } from "./lamps";

/* A lamp's glow, and the light it casts, must come from its glass, wherever and however its post is turned. */

const MODELS: Record<LampKind, { geometry: BufferGeometry; glass: number }> = {
  road: { geometry: buildStreetLamp().near, glass: PARTS.indexOf("lens") },
  town: { geometry: buildTownLamp().near, glass: TOWN_PARTS.indexOf("lamp-glass") },
};

/** The glass's bounds once the model is placed, turned as `art/roadside/material.ts` turns a placed model: +z towards (sin yaw, cos yaw). */
function placedGlass(geometry: BufferGeometry, glass: number, foot: Vector3, yaw: number) {
  const position = geometry.getAttribute("position");
  const part = geometry.getAttribute("tint");
  const box = new Box3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (Math.round(part.getX(vertex) * 255) !== glass) continue;
    const [x, y, z] = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
    box.expandByPoint(new Vector3(foot.x + x * Math.cos(yaw) + z * Math.sin(yaw), foot.y + y, foot.z + z * Math.cos(yaw) - x * Math.sin(yaw)));
  }
  return box;
}

describe("a lamp's head", () => {
  it.each(Object.keys(MODELS) as LampKind[])("is in the %s lamp's glass at every turn of its post", (kind) => {
    const { geometry, glass } = MODELS[kind];
    const foot = new Vector3(-2783, 7.31, 5739.3);
    for (let yaw = -Math.PI; yaw < Math.PI; yaw += Math.PI / 7) {
      const box = placedGlass(geometry, glass, foot, yaw);
      const head = headOf({ kind, x: foot.x, y: foot.y, z: foot.z, yaw });
      expect(box.containsPoint(new Vector3(head.x, head.y, head.z)), `yaw ${yaw.toFixed(2)}`).toBe(true);
    }
  });

  it("is out on the road lamp's arm, not on its post", () => {
    const head = headOf({ kind: "road", x: 0, y: 0, z: 0, yaw: Math.PI / 2 });
    expect(head.x).toBeGreaterThan(1.2);
    expect(Math.abs(head.z)).toBeLessThan(0.05);
    expect(head.y).toBeGreaterThan(8.5);
  });
});
