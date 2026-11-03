import type { Mesh, Scene } from "three/webgpu";
import { uniform } from "three/tsl";
import { bakeCrowd, crowdMeshes, crowdOf, peopleMaterials, type CrowdArrays } from "../art/people/index";
import type { RoadsideInputs } from "../art/roadside/index";

/*
 * The people the pipeline placed (`pipeline/people.py`), each tile's baked in its worker
 * as one crowd (`render/tile-people.ts`): three draws a tile with anyone on it, landing
 * and leaving with the tile's detail. Every figure's detail is its own, by its distance
 * in the kit's shader, so a tile's crowd is never swapped whole.
 */

export function createPeople(scene: Scene, inputs: RoadsideInputs) {
  const time = uniform(0);
  const materials = peopleMaterials({ ...inputs, time });
  const crowds = new Map<string, { meshes: Mesh[]; figures: number; triangles: number }>();
  let shown = true;
  // One figure out of sight, so the materials' pipelines are built with the rest before the drive.
  const standIn = crowdMeshes(bakeCrowd([{ x: 0, y: -1e4, z: 0, seed: 0, pose: "stand" }]), materials);
  for (const mesh of standIn) {
    mesh.visible = false;
    scene.add(mesh);
  }

  return {
    add(tile: string, crowd: CrowdArrays | null) {
      if (crowds.has(tile)) throw new Error(`${tile}'s people are already here`);
      if (crowd === null) return;
      const meshes = crowdMeshes(crowdOf(crowd), materials);
      for (const mesh of meshes) {
        mesh.visible = shown;
        scene.add(mesh);
      }
      const figures = crowd.shadow.index.length / 6;
      crowds.set(tile, { meshes, figures, triangles: (crowd.near.index.length + crowd.far.index.length + crowd.shadow.index.length) / 3 });
    },
    remove(tile: string) {
      const crowd = crowds.get(tile);
      if (!crowd) return;
      for (const mesh of crowd.meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      crowds.delete(tile);
    },
    /** Moves everyone's motions on: a paused game passes no time. */
    update(seconds: number) {
      time.value += seconds;
    },
    /** How many people the loaded tiles hold, and the triangles they run, every version, wherever they are. */
    counts() {
      return [...crowds.values()].reduce((sum, crowd) => ({ figures: sum.figures + crowd.figures, triangles: sum.triangles + crowd.triangles }), { figures: 0, triangles: 0 });
    },
    /** Every crowd shown or hidden, to measure what people cost. */
    show(on: boolean) {
      shown = on;
      for (const { meshes } of crowds.values()) for (const mesh of meshes) mesh.visible = on;
    },
    /** The stand-in shown, for compiling before the drive. */
    showAll(all: boolean) {
      for (const mesh of standIn) mesh.visible = all;
    },
    dispose() {
      for (const tile of [...crowds.keys()]) this.remove(tile);
      for (const mesh of standIn) mesh.geometry.dispose();
    },
  };
}
