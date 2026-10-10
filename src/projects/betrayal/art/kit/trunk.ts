import * as THREE from "three";
import type { PaletteKey } from "../palette";
import { batch, group, type Size } from "../shapes";

export interface TrunkOptions {
  /** Width (x), height of the body (y) and depth (z), in metres. */
  size?: Size;
  /** The body's colour: leather or painted wood. */
  body?: PaletteKey;
  /** How far the lid is lifted on its hinge at the back, in radians; 0 is shut. */
  open?: number;
}

/**
 * A travelling trunk: a body bound with dark straps and brass corners, and a
 * flat lid hinged along its back edge (−z), shut or lifted. Faces +z, base
 * at y = 0.
 */
export function trunk({ size = [0.9, 0.42, 0.5], body = "blood", open = 0 }: TrunkOptions = {}): THREE.Group {
  const [w, h, d] = size;
  const b = batch();
  b.block([w, h, d], body, [0, 0, 0]);
  for (const x of [-w * 0.3, w * 0.3]) b.block([0.05, h + 0.006, d + 0.012], "woodDark", [x, -0.003, 0]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.block([0.07, 0.07, 0.07], "brass", [sx * (w / 2 - 0.03), h - 0.06, sz * (d / 2 - 0.03)]);
  }
  b.block([0.08, 0.08, 0.02], "brass", [0, h - 0.1, d / 2]);
  const lidThick = 0.07;
  const lid = batch();
  lid.block([w + 0.02, lidThick, d + 0.02], body, [0, 0, (d + 0.02) / 2]);
  for (const x of [-w * 0.3, w * 0.3]) lid.block([0.046, lidThick + 0.006, d + 0.032], "woodDark", [x, -0.003, (d + 0.02) / 2]);
  const top = lid.mesh();
  const hinge = group(top);
  hinge.position.set(0, h, -(d + 0.02) / 2);
  hinge.rotation.x = -open;
  return group(b.mesh(), hinge);
}
