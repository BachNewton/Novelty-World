import { Matrix4, Vector3, Vector4 } from "three";

/*
 * Reading the world's depth. The world draws with a reversed depth buffer
 * (precise from a hand's breadth to the horizon), so a depth of 1 is the
 * near plane and 0 the far one, which is also what the sky and anything
 * cleared hold. Every feature that reads depth goes through these, never its
 * own arithmetic, so none gets it backwards. The GLSL and the TypeScript
 * below are the same functions; the tests hold the TypeScript to three's own
 * reversed projection.
 */

export const DEPTH_GLSL = /* glsl */ `
// The distance along the camera's view (positive, in metres) of a reversed depth.
float hwLinearDepth(float depth, float near, float far) {
  return near * far / (depth * (far - near) + near);
}

// Whether a reversed depth is nothing drawn: the far plane, the sky or a cleared pixel.
bool hwIsFar(float depth) {
  return depth <= 0.0;
}

// The view-space point under a screen position (uv, 0 to 1) at a reversed depth.
vec3 hwViewPosition(vec2 uv, float depth, mat4 projectionInverse) {
  vec4 view = projectionInverse * vec4(uv * 2.0 - 1.0, depth, 1.0);
  return view.xyz / view.w;
}
`;

export function linearDepth(depth: number, near: number, far: number): number {
  return (near * far) / (depth * (far - near) + near);
}

export function isFar(depth: number): boolean {
  return depth <= 0;
}

export function viewPosition(u: number, v: number, depth: number, projectionInverse: Matrix4): Vector3 {
  const view = new Vector4(u * 2 - 1, v * 2 - 1, depth, 1).applyMatrix4(projectionInverse);
  return new Vector3(view.x / view.w, view.y / view.w, view.z / view.w);
}

/** The depth a view-space point is drawn at through a projection: what a depth texture holds there. */
export function depthOf(point: Vector3, projection: Matrix4): number {
  const clip = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(projection);
  return clip.z / clip.w;
}
