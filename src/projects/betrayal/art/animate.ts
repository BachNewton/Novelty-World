import type * as THREE from "three";

/** Poses a piece for a moment in time. It must depend on `seconds` alone, so
 *  a frozen clock always shows the same pose. */
export type Animation = (seconds: number) => void;

/** Marks a piece the stage animates every frame, wherever in the room it
 *  ends up, as `lightAnchor` marks where a light goes. */
export function animated<T extends THREE.Object3D>(object: T, animation: Animation): T {
  object.userData.animation = animation;
  return object;
}

export function animationOf(object: THREE.Object3D): Animation | undefined {
  return (object.userData as { animation?: Animation }).animation;
}
