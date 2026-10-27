import * as THREE from "three/webgpu";
import { lookToken } from "../caretaker";
import type { Look } from "../types";
import { animatedInstance, grounded, repaint, type Models } from "./assets";
import { Poses } from "./poses";

/** A caretaker stands well over the grown-up cats. */
export const CARETAKER_HEIGHT = 1.5;

/** The model's material slots, by its own names, and the token each takes. */
function lookPaints(look: Look): Partial<Record<string, string>> {
  return {
    Shirt: lookToken("shirt", look.shirt),
    Hair: lookToken("hair", look.hair),
    Skin: lookToken("skin", look.skin),
    UnderShirt: "--color-wh-caretaker-sleeves",
    Pants: "--color-wh-caretaker-trousers",
    Detail: "--color-wh-caretaker-straps",
    Boots: "--color-wh-caretaker-boots",
    "Material.006": "--color-wh-caretaker-belt",
  };
}

type Pose = "idle" | "walk" | "pick-up";

const POSE_CLIPS: Record<Pose, string> = { idle: "Idle", walk: "Walk", "pick-up": "PickUp" };

/**
 * Where each arm points while it cradles a baby, in the caretaker's own frame
 * (facing +z, its left at +x): the upper arm hangs a little forward, the
 * forearm comes round in front of the belly.
 */
const CRADLE = {
  L: { upper: new THREE.Vector3(0.35, -1, 0.25).normalize(), lower: new THREE.Vector3(-1, 0.35, 0.55).normalize() },
  R: { upper: new THREE.Vector3(-0.35, -1, 0.25).normalize(), lower: new THREE.Vector3(1, 0.35, 0.55).normalize() },
};

interface Arm {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  fist: THREE.Object3D;
  cradle: (typeof CRADLE)["L"];
}

const from = new THREE.Vector3();
const to = new THREE.Vector3();
const turn = new THREE.Quaternion();
const facing = new THREE.Quaternion();
const parentTurn = new THREE.Quaternion();
const aimed = new THREE.Quaternion();
const boneAt = new THREE.Vector3();
const fistL = new THREE.Vector3();

/** A player in the garden: a human caretaker in their chosen colours, who carries a baby in their arms. */
export class Caretaker {
  readonly object = new THREE.Group();
  private readonly poses: Poses<Pose>;
  private readonly arms: Arm[];
  /** How far the arms are into the cradle, 0 to 1, and that eased. */
  private cradling = 0;
  private cradle = 0;
  /** Whether this caretaker is carrying a baby. */
  holding = false;

  constructor(models: Models, readonly look: Look) {
    const { root, clips } = animatedInstance(models, "caretaker");
    repaint(root, lookPaints(look));
    this.object.add(grounded(root, CARETAKER_HEIGHT));
    this.poses = new Poses(root, clips, POSE_CLIPS, ["idle", "walk"], "caretaker");
    // The loader drops the dots from node names: Blender's "UpperArm.L" is "UpperArmL".
    const bone = (name: string) => {
      const found = root.getObjectByName(name);
      if (found === undefined) throw new Error(`whisker hollow: the caretaker has no ${name} bone`);
      return found;
    };
    this.arms = (["L", "R"] as const).map((side) => ({
      upper: bone(`UpperArm${side}`),
      lower: bone(`LowerArm${side}`),
      fist: bone(`Fist${side}`),
      cradle: CRADLE[side],
    }));
  }

  /** Whether a pick-up is playing: the caretaker stands still for it. */
  get busy(): boolean {
    return this.poses.busy;
  }

  setMoving(moving: boolean): void {
    this.poses.loop(moving ? "walk" : "idle");
  }

  /** Bend down to pick a baby up, or to put one down. */
  pickUp(): void {
    this.poses.once("pick-up", 1.3);
  }

  /** Animate, then bring the arms round into a cradle while holding (and not bending down). */
  update(dt: number): void {
    this.poses.update(dt);
    const want = this.holding && !this.poses.busy ? 1 : 0;
    this.cradling += Math.sign(want - this.cradling) * Math.min(Math.abs(want - this.cradling), dt * 4);
    this.cradle = this.cradling * this.cradling * (3 - 2 * this.cradling);
    this.object.updateMatrixWorld(true);
    if (this.cradle === 0) return;
    this.object.getWorldQuaternion(facing);
    for (const arm of this.arms) {
      aim(arm.upper, arm.lower, to.copy(arm.cradle.upper).applyQuaternion(facing), this.cradle);
      aim(arm.lower, arm.fist, to.copy(arm.cradle.lower).applyQuaternion(facing), this.cradle);
    }
  }

  /**
   * Put a carried baby in this caretaker's hands: in the right hand, facing
   * ahead, while they bend to pick it up, then lying across both arms once
   * they cradle it. `sink` lowers it into the arms rather than on top of them.
   */
  hold(baby: THREE.Object3D, sink: number): void {
    const [left, right] = this.arms;
    right.fist.getWorldPosition(baby.position);
    left.fist.getWorldPosition(fistL);
    fistL.add(baby.position).multiplyScalar(0.5);
    baby.position.lerp(fistL, this.cradle);
    baby.position.y -= sink;
    baby.rotation.y = this.object.rotation.y + (this.cradle * Math.PI) / 2;
  }

  dispose(): void {
    this.poses.stop();
    this.object.removeFromParent();
  }
}

/** Turn a bone, by `weight`, so it points from itself to its child along `direction` (world space). */
function aim(bone: THREE.Object3D, child: THREE.Object3D, direction: THREE.Vector3, weight: number): void {
  const parent = bone.parent;
  if (parent === null) throw new Error("whisker hollow: an arm bone has no parent");
  child.getWorldPosition(from).sub(bone.getWorldPosition(boneAt)).normalize();
  turn.setFromUnitVectors(from, direction);
  bone.getWorldQuaternion(aimed).premultiply(turn);
  parent.getWorldQuaternion(parentTurn).invert();
  aimed.premultiply(parentTurn);
  bone.quaternion.slerp(aimed, weight);
  bone.updateMatrixWorld(true);
}
