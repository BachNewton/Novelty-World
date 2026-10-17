import * as THREE from "three";
import type { CoatLook } from "../../cats/coat-look";
import type { CatPose } from "../../cats/motion";
import { BONE_NAMES, BONES, type BoneName, type CatRig } from "../../cats/rig";
import { BONE_INVERSES } from "./cat-geometry";
import { coatMaterial, type CoatUniforms } from "./coat-material";

/** One cat's drawable: the shared sculpture skinned to a skeleton of its own, in its own coat, posed on demand. */
export class SkinnedCat {
  readonly mesh: THREE.SkinnedMesh;
  private readonly bones = new Map<BoneName, THREE.Bone>();
  private readonly uniforms: CoatUniforms;
  private readonly material: THREE.Material;

  constructor(
    geometry: THREE.BufferGeometry,
    look: CoatLook,
    private readonly rig: CatRig,
  ) {
    const { material, uniforms } = coatMaterial(look);
    this.material = material;
    this.uniforms = uniforms;
    for (const name of BONE_NAMES) {
      const bone = new THREE.Bone();
      bone.name = name;
      this.bones.set(name, bone);
      const parent = BONES.get(name)?.parent;
      if (parent) this.bones.get(parent)?.add(bone);
    }
    this.mesh = new THREE.SkinnedMesh(geometry, material);
    const root = this.bones.get("pelvis");
    if (!root) throw new Error("The cat's rig has no pelvis");
    this.mesh.add(root);
    this.mesh.bind(new THREE.Skeleton(BONE_NAMES.map((name) => this.bones.get(name) as THREE.Bone), [...BONE_INVERSES]), new THREE.Matrix4());
  }

  pose(pose: CatPose) {
    for (const [name, bone] of this.bones) {
      const offset = name === "pelvis" ? pose.pelvis : this.rig.offsets.get(name);
      if (offset) bone.position.set(offset[0], offset[1], offset[2]);
      const turn = pose.rotations.get(name);
      if (turn) bone.rotation.set(turn[0], turn[1], turn[2]);
      bone.scale.setScalar(this.rig.scales.get(name) ?? 1);
    }
    this.uniforms.uBlink.value = pose.blink;
  }

  dispose() {
    this.material.dispose();
    this.mesh.skeleton.dispose();
  }
}
