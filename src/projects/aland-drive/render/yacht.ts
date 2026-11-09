import type { Node, Scene } from "three/webgpu";
import { sharedUniform } from "../art/shared-uniform";
import { DEALER_SITES } from "../art/dealers/index";
import { buildYacht } from "../art/dealers/yacht/hull";
import { yachtMaterials } from "../art/dealers/yacht/material";
import { placeModel, type RoadsideInputs } from "../art/roadside/index";

/*
 * The visiting superyacht at its berth in Västerhamn (its site in `DEALER_SITES`), one model in one place, so two draws
 * however near. It's in the water all year for now, as `ideas/cars.md` decides, and lies still: a hull this size
 * doesn't rock alongside a quay, so its clock is held at nothing. No collision, as a berthed ferry has none.
 */

/** The drawn water's height in the harbour, where the marina's boats float. */
const HARBOUR_Y = -0.05;

export function createYacht(scene: Scene, inputs: RoadsideInputs, lampsOn: Node<"float">) {
  const site = DEALER_SITES.find(({ id }) => id === "yacht");
  if (site === undefined) throw new Error("the yacht has no site");
  const model = buildYacht();
  const materials = yachtMaterials({ ...inputs, time: sharedUniform(0) }, lampsOn);
  const meshes = placeModel(model, [{ x: site.x, y: HARBOUR_Y, z: site.z, yaw: site.yaw }], materials);
  scene.add(...meshes);
  return {
    dispose() {
      scene.remove(...meshes);
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const material of [materials.near, materials.far]) material.dispose();
    },
  };
}
