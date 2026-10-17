import { DoubleSide, type Material, MeshDepthMaterial, type Object3D, type Scene } from "three";
import { shadowDepthOf } from "../shading";
import { patchCaster } from "./caster-depth";

/*
 * What casts a shadow, and what it is drawn into the shadow maps with: a
 * mesh's own shadow depth where it was given one (`customDepthMaterial`,
 * from `shadowDepth`), else the shadow depth of its shared material (which
 * carries the material's own vertex GLSL, as the land's does), else a plain
 * depth for anything outside the shared materials. Each moves its vertices
 * as the drawn mesh does, so a swaying tree's shadow sways.
 */

let plain: MeshDepthMaterial | null = null;

/** The depth for a material outside the shared ones, which moves no vertices of its own: three's, ready for the maps. */
function plainDepth(): MeshDepthMaterial {
  if (!plain) {
    plain = new MeshDepthMaterial({ side: DoubleSide });
    plain.onBeforeCompile = patchCaster;
    plain.customProgramCacheKey = () => "hearthwood:depth:plain";
  }
  return plain;
}

type Caster = Object3D & { castShadow: boolean; material: Material | Material[]; customDepthMaterial?: Material };

function isMesh(object: Object3D): object is Caster {
  return "isMesh" in object && object.isMesh === true;
}

function depthOf(object: Caster, material: Material): Material {
  return object.customDepthMaterial ?? shadowDepthOf(material) ?? plainDepth();
}

/** The scene made ready to draw its casters only, each with its shadow depth; the returned function puts it back as it was. */
export function castersOnly(scene: Scene): () => void {
  const swapped: [Caster, Material | Material[]][] = [];
  const hidden: Object3D[] = [];
  scene.traverseVisible((object) => {
    if (isMesh(object) && object.castShadow) {
      swapped.push([object, object.material]);
      object.material = Array.isArray(object.material) ? object.material.map((m) => depthOf(object, m)) : depthOf(object, object.material);
    } else if ("material" in object) hidden.push(object);
  });
  for (const object of hidden) object.visible = false;
  return () => {
    for (const [object, material] of swapped) object.material = material;
    for (const object of hidden) object.visible = true;
  };
}
