import * as THREE from "three";
import type { LightSpec } from "./room";

export type AnchoredLight = Omit<LightSpec, "at">;

/** A marker inside a prop where the stage puts a real light, so a candle can
 *  be moved, turned or set on a table and its light goes with it. */
export function lightAnchor(light: AnchoredLight, at: [number, number, number]): THREE.Object3D {
  const anchor = new THREE.Object3D();
  anchor.position.set(...at);
  anchor.userData.light = light;
  return anchor;
}

export function anchoredLight(object: THREE.Object3D): AnchoredLight | undefined {
  return (object.userData as { light?: AnchoredLight }).light;
}
