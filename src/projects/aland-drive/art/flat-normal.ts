import { cameraWorldMatrix, cross, dFdx, dFdy, normalize, positionView, select, transformDirection } from "three/tsl";
import type { Node } from "three/webgpu";

/*
 * A flat-shaded face's normal in the world, turned towards the camera, from how the
 * position changes across the pixel. It is read in view space, not the world's:
 * the island runs 25 km from the world's origin, where a 32-bit float's steps are
 * millimetres, about what a near pixel spans, so the world position's own rounding
 * tilts the normal from pixel to pixel. View space is measured from the camera, so
 * near the camera its numbers are small and their steps far finer.
 */
export function flatNormal(): Node<"vec3"> {
  const facing = normalize(cross(dFdx(positionView), dFdy(positionView)));
  // The camera is view space's origin, so a face turned to it has a normal against its position.
  const towardsCamera = select(facing.dot(positionView).greaterThan(0), facing.negate(), facing);
  return transformDirection(towardsCamera, cameraWorldMatrix);
}
