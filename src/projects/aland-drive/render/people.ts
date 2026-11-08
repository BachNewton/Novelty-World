import type { Mesh, MeshBasicNodeMaterial, Node, Scene } from "three/webgpu";
import { attribute, float, select } from "three/tsl";
import { sharedUniform } from "../art/shared-uniform";
import { crowdMeshes, crowdOf, peopleMaterials, type CrowdArrays } from "../art/people/index";
import type { RoadsideInputs } from "../art/roadside/index";
import { changeOf, seasonNodes, type SeasonLook } from "../art/season";
import { SEASON_KINDS, tileCrowd } from "./tile-people";

/*
 * The people the pipeline placed (`pipeline/people.py`), each tile's baked in its worker
 * as one crowd (`render/tile-people.ts`): three draws a tile with anyone on it, landing
 * and leaving with the tile's detail. Every figure's detail is its own, by its distance
 * in the kit's shader, so a tile's crowd is never swapped whole. Someone there only in
 * a season (a café's sitters, a sunbather, someone at a boat) folds to their place in
 * the vertex shader out of it, by the season each vertex carries (`tile-people.ts`).
 */

/** A copy of one of the kit's materials whose people fold away out of their season. */
function seasonal(material: MeshBasicNodeMaterial, season: SeasonLook): MeshBasicNodeMaterial {
  const placed = material.positionNode;
  if (placed === null) throw new Error("the people's material has no positionNode to fold");
  const place = attribute<"vec4">("place", "vec4");
  const kept = attribute<"vec2">("season", "vec2");
  const dials = seasonNodes(season);
  const kind = kept.x.round();
  const share = SEASON_KINDS.reduce<Node<"float">>((chosen, { dial }, at) => select(kind.equal(at + 1), dials[dial], chosen), float(1));
  const copy = material.clone();
  copy.positionNode = select(kind.equal(0).or(changeOf(share, kept.y).greaterThan(0.5)), placed, place.xyz);
  return copy;
}

export function createPeople(scene: Scene, inputs: RoadsideInputs, season?: SeasonLook) {
  const time = sharedUniform(0);
  const kit = peopleMaterials({ ...inputs, time });
  const materials = season === undefined ? kit : { near: seasonal(kit.near, season), far: seasonal(kit.far, season), shadow: seasonal(kit.shadow, season) };
  const crowds = new Map<string, { meshes: Mesh[]; figures: number; triangles: number }>();
  let shown = true;
  // One figure out of sight, so the materials' pipelines are built with the rest before the drive.
  const standInArrays = tileCrowd([{ figures: [[0, -1e4, 0, 0, "stand", 0]] }]);
  if (standInArrays === null) throw new Error("the stand-in crowd has no one in it");
  const standIn = crowdMeshes(crowdOf(standInArrays), materials);
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
