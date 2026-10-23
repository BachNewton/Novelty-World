import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { solidOf } from "../forms";
import { FLOOR_RINGS } from "../room";
import { ITEM_MODELS } from ".";
import { PLATE_TOP } from "./item";

/*
 * Every item model, meshed: it holds as a prop and lies within its plate.
 * Meshing every model takes the better part of a second each, so this is a
 * slow test.
 */

const MESHING = { timeout: 60_000 };

const meshesIn = (object: THREE.Object3D) => {
  const meshes: THREE.Mesh[] = [];
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
};

describe.each(Object.entries(ITEM_MODELS))("the %s's model", (_, model) => {
  it("holds by a handle, every part a solid the clipping check can ask", MESHING, () => {
    const prop = model.held();
    expect(prop.handle).toBeGreaterThan(0);
    // A flame is light, not a part: it passes through nothing.
    const parts = meshesIn(prop.object).filter((mesh) => mesh.name !== "flame");
    expect(parts.length).toBeGreaterThan(0);
    for (const mesh of parts) expect(solidOf(mesh.geometry as THREE.BufferGeometry), mesh.name).toBeDefined();
  });

  it("lies within its plate's rim, resting on the plate", MESHING, () => {
    const floor = model.floor();
    floor.updateMatrixWorld(true);
    const lying = new THREE.Box3().setFromObject(floor, true);
    expect(lying.min.y).toBeCloseTo(PLATE_TOP, 4);
    const point = new THREE.Vector3();
    for (const mesh of meshesIn(floor)) {
      const position = (mesh.geometry as THREE.BufferGeometry).getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(FLOOR_RINGS.plate.rim + 1e-6);
      }
    }
  });
});
