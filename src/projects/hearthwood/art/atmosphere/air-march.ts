import { Vector3, type Matrix4 } from "three";
import { isFar, viewPosition } from "../depth";

/*
 * Where a pixel's ray runs through the air, for the passes that march
 * along it (the crepuscular rays, the god rays): its direction in view
 * space, and how far it goes before it meets what is drawn there, read from
 * the world's reversed depth (1 near, 0 far) through `depth.ts`; a pixel
 * with nothing drawn (the sky) is marched out to the pass's own reach. The
 * GLSL and the TypeScript are the same function, and the tests hold the
 * TypeScript to three's reversed projection. Needs `DEPTH_GLSL` before it.
 */

export const AIR_MARCH_GLSL = /* glsl */ `
// The view-space direction of a pixel's ray, and (in w) how far it runs before it meets what is drawn, up to reach.
vec4 hwAirRay(vec2 uv, float depth, mat4 projectionInverse, float reach) {
  bool far = hwIsFar(depth);
  // Nothing drawn: any depth between the planes gives the direction.
  vec3 view = hwViewPosition(uv, far ? 0.5 : depth, projectionInverse);
  return vec4(normalize(view), far ? reach : min(length(view), reach));
}
`;

export function airRay(u: number, v: number, depth: number, projectionInverse: Matrix4, reach: number): { direction: Vector3; distance: number } {
  const far = isFar(depth);
  const view = viewPosition(u, v, far ? 0.5 : depth, projectionInverse);
  return { direction: new Vector3().copy(view).normalize(), distance: far ? reach : Math.min(view.length(), reach) };
}
