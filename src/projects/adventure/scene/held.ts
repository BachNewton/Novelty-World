import * as THREE from "three/webgpu";
import type { Hand, Weapon } from "../weapons";

/**
 * Where a weapon's grip sits in its hand, in the frame of the arm's joint at the shoulder:
 * out along the arm for the right one (the left mirrors it). Its arms are rigid, so one
 * place fits every character; each weapon says which of its own points goes there.
 */
const GRIP = new THREE.Vector3(-0.25, 0.02, 0.03);

/** Put a weapon's model in one of a character's hands: a child of that arm's joint, so it follows every clip. */
export function grip(character: THREE.Object3D, model: THREE.Object3D, weapon: Weapon, hand: Hand): void {
  const arm = character.getObjectByName(`arm-${hand}`);
  if (arm === undefined) throw new Error(`adventure: ${character.name} has no arm-${hand}`);
  const [x, y, z] = weapon.grip;
  model.position.copy(GRIP).sub(new THREE.Vector3(x, y, z));
  if (hand === "left") model.position.x = -GRIP.x - x;
  arm.add(model);
}
