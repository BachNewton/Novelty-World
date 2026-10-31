import type { Point } from "../cars/mesh";

/*
 * Rigid transforms as sixteen numbers, column first, as a GPU reads them. Pure
 * numbers, so a pose can be tested with no renderer.
 */

export type Mat = number[];

export const IDENTITY: Mat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Folds a part to nothing: an option that is off costs no pixels. */
export const HIDDEN: Mat = new Array<number>(16).fill(0);

export function mul(a: Mat, b: Mat): Mat {
  const out = new Array<number>(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

export const chain = (...parts: Mat[]) => parts.reduce(mul);

export const translate = ([x, y, z]: Point): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

export function rotX(angle: number): Mat {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

export function rotY(angle: number): Mat {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

export function rotZ(angle: number): Mat {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function rotAxis([x, y, z]: Point, angle: number): Mat {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const t = 1 - c;
  return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
}

export const apply = (m: Mat, [x, y, z]: Point): Point => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

export const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Point, by: number): Point => [a[0] * by, a[1] * by, a[2] * by];
export const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a: Point): Point => scale(a, 1 / Math.hypot(...a));
export const mix = (a: Point, b: Point, share: number): Point => add(a, scale(sub(b, a), share));
