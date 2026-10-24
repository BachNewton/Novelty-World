import * as THREE from "three/webgpu";
import type { Pose } from "../../animals/motion";
import { BONE_NAMES, boneAt, type BoneName, type Rig } from "../../animals/rig";
import type { CoatMaterial } from "./coat-material";

/** How small a tongue that is in shrinks: to nothing, inside the mouth. */
const TONGUE_IN = 0.001;

/** One animal's drawable: its species' sculpture skinned to a skeleton of its own, in its own coat, posed on demand. */
export class SkinnedAnimal {
  readonly mesh: THREE.SkinnedMesh;
  private readonly bones = new Map<BoneName, THREE.Bone>();

  constructor(
    geometry: THREE.BufferGeometry,
    private readonly material: CoatMaterial,
    private readonly rig: Rig,
  ) {
    const { skeleton } = rig;
    for (const name of BONE_NAMES) {
      const bone = new THREE.Bone();
      bone.name = name;
      this.bones.set(name, bone);
      const parent = skeleton.bones.get(name)?.parent;
      if (parent) this.bones.get(parent)?.add(bone);
    }
    this.mesh = new THREE.SkinnedMesh(geometry, material);
    const root = this.bones.get("pelvis");
    if (!root) throw new Error("The rig has no pelvis");
    this.mesh.add(root);
    // The bind pose has no turns, so each inverse is the pivot's own translation undone.
    const inverses = BONE_NAMES.map((name) => {
      const at = boneAt(skeleton, name);
      return new THREE.Matrix4().makeTranslation(-at[0], -at[1], -at[2]);
    });
    this.mesh.bind(new THREE.Skeleton(BONE_NAMES.map((name) => this.bones.get(name) as THREE.Bone), inverses), new THREE.Matrix4());
  }

  /** One of its bones, for something it holds (a dog's stick in its jaws) to hang from. */
  bone(name: BoneName): THREE.Bone {
    const bone = this.bones.get(name);
    if (!bone) throw new Error(`The animal has no ${name} bone`);
    return bone;
  }

  pose(pose: Pose) {
    for (const [name, bone] of this.bones) {
      const offset = name === "pelvis" ? pose.pelvis : this.rig.offsets.get(name);
      if (offset) bone.position.set(offset[0], offset[1], offset[2]);
      const turn = pose.rotations.get(name);
      if (turn) bone.rotation.set(turn[0], turn[1], turn[2]);
      const scale = this.rig.scales.get(name);
      if (scale) bone.scale.set(scale[0], scale[1], scale[2]);
      else bone.scale.setScalar(1);
    }
    this.bones.get("tongue")?.scale.setScalar(Math.max(TONGUE_IN, pose.tongue));
    this.material.coat.blink = pose.blink;
  }

  dispose() {
    this.material.dispose();
    this.mesh.skeleton.dispose();
  }
}
