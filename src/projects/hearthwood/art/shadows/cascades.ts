import { Matrix4, Vector3 } from "three";

/*
 * Where the sun's (or the moon's) shadow maps lie, as plain numbers: the
 * camera's view cut into slices by distance, each slice wrapped in the
 * smallest sphere that holds it, and each sphere seen square-on from the
 * light. A sphere's size depends only on the lens and the slice, never on
 * where the camera looks, and its centre is moved only in whole texels of
 * its map, so turning or walking never makes a shadow's edge crawl.
 */

/**
 * Where each slice of the view ends, `count + 1` distances from `start` to
 * `far`, each slice the same many times longer than the one before, so the
 * maps' texels grow with distance as the view's own pixels do. The first
 * slice reaches back to the camera's near plane, whatever `start` is.
 */
export function splitDistances(start: number, far: number, count: number): number[] {
  if (!(start > 0 && far > start && count >= 1)) throw new Error(`Shadow slices need 0 < start < far and a count, not ${start}, ${far}, ${count}`);
  return Array.from({ length: count + 1 }, (_, i) => (i === count ? far : start * (far / start) ** (i / count)));
}

/** What a perspective camera sees, enough to wrap a slice of it. */
export interface Lens {
  /** Vertical field of view, in degrees. */
  fov: number;
  /** Width over height. */
  aspect: number;
}

export interface Sphere {
  /** How far along the view its centre lies, in metres. */
  along: number;
  radius: number;
}

/**
 * The smallest sphere round the slice of a view between two distances. A
 * slice's corners at a distance d lie d·k from the axis (k the tangent of
 * the half-diagonal), so the sphere's centre sits on the axis where the near
 * and far corners are equally far, or at the far end when the slice is
 * wider than it is deep.
 */
export function sliceSphere(lens: Lens, near: number, far: number): Sphere {
  const halfHeight = Math.tan((lens.fov * Math.PI) / 360);
  const k2 = halfHeight * halfHeight * (1 + lens.aspect * lens.aspect);
  const along = Math.min(far, ((far + near) * (1 + k2)) / 2);
  const radius = Math.sqrt((far - along) ** 2 + far * far * k2);
  return { along, radius };
}

/** A radius rounded up to one of a few sizes per doubling, so a field of view that eases (the broom's) changes a map's scale only now and then. */
export function steadyRadius(radius: number): number {
  const step = 2 ** Math.floor(Math.log2(radius)) / 16;
  return Math.ceil(radius / step) * step;
}

/** The light's square-on frame: the way it shines (from the light into the world) and two directions across its map. */
export interface LightFrame {
  forward: Vector3;
  right: Vector3;
  up: Vector3;
}

/** The frame a light shining from `toLight` (the direction towards it) is seen square-on in, steady as the light moves: across its map, "up" leans to the world's north when the light is overhead. */
export function lightFrame(toLight: Vector3, out: LightFrame = { forward: new Vector3(), right: new Vector3(), up: new Vector3() }): LightFrame {
  out.forward.copy(toLight).normalize().negate();
  const reference = Math.abs(out.forward.y) > 0.99 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  out.right.crossVectors(out.forward, reference).normalize();
  out.up.crossVectors(out.right, out.forward).normalize();
  return out;
}

/** `centre` moved, across the light's map, onto the nearest whole texel, so a map that follows the camera keeps every shadow's edge on the same texels. */
export function snapToTexels(centre: Vector3, frame: LightFrame, texel: number, out: Vector3 = new Vector3()): Vector3 {
  const x = centre.dot(frame.right);
  const y = centre.dot(frame.up);
  return out
    .copy(centre)
    .addScaledVector(frame.right, Math.round(x / texel) * texel - x)
    .addScaledVector(frame.up, Math.round(y / texel) * texel - y);
}

/** Takes a map's clip space to its square: x and y from -1..1 to 0..1, the reversed depth as it is. */
const TO_SQUARE = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);

/** A map's matrix, from the world to its square: x and y across it from 0 to 1, z the light's reversed depth (1 nearest the light). */
export function squareMatrix(projection: Matrix4, viewInverse: Matrix4, out: Matrix4 = new Matrix4()): Matrix4 {
  return out.multiplyMatrices(TO_SQUARE, projection).multiply(viewInverse);
}
