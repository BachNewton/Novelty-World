import { SphericalHarmonics3, Vector3 } from "three";
import { sphereDirections, type Rgb, type Vec } from "../sky/scattering";

/*
 * The light from the sky and the ground all round, as the sky really is in
 * every direction: its colours are gathered over the whole sphere into
 * spherical harmonics (nine numbers per colour, the smooth part of the light
 * from every direction), which three's light probe turns into the light
 * each surface catches by which way it faces. So shade under a blue sky is
 * bluish, a sunset's light comes from the sunset's side, and a slope facing
 * the ground catches the ground's own warm bounce.
 */

/** Where the sky is sampled: evenly over the sphere, the upper half the sky and the lower half the ground. */
export const AMBIENT_DIRECTIONS: readonly Vec[] = sphereDirections(96);

/** Projects the light arriving from every direction onto spherical harmonics, as three's light probe reads them (the coefficients of radiance). */
export function projectLight(radiance: (direction: Vec) => Rgb, directions: readonly Vec[] = AMBIENT_DIRECTIONS, out: SphericalHarmonics3 = new SphericalHarmonics3()): SphericalHarmonics3 {
  const basis = new Array<number>(9).fill(0);
  const sums = Array.from({ length: 9 }, () => [0, 0, 0]);
  const at = new Vector3();
  for (const direction of directions) {
    SphericalHarmonics3.getBasisAt(at.set(direction.x, direction.y, direction.z), basis);
    const light = radiance(direction);
    for (let k = 0; k < 9; k++) {
      sums[k][0] += light[0] * basis[k];
      sums[k][1] += light[1] * basis[k];
      sums[k][2] += light[2] * basis[k];
    }
  }
  const weight = (4 * Math.PI) / directions.length;
  out.coefficients.forEach((coefficient, k) => coefficient.set(sums[k][0] * weight, sums[k][1] * weight, sums[k][2] * weight));
  return out;
}

/** The light a surface facing `normal` catches from the harmonics, as three's shader works it out (`shGetIrradianceAt`). */
export function irradianceAt(sh: SphericalHarmonics3, normal: Vec): Rgb {
  const { x, y, z } = normal;
  const c = sh.coefficients;
  const weights = [0.886227, 2 * 0.511664 * y, 2 * 0.511664 * z, 2 * 0.511664 * x, 2 * 0.429043 * x * y, 2 * 0.429043 * y * z, 0.743125 * z * z - 0.247708, 2 * 0.429043 * x * z, 0.429043 * (x * x - y * y)];
  const out: Rgb = [0, 0, 0];
  weights.forEach((w, k) => {
    out[0] += c[k].x * w;
    out[1] += c[k].y * w;
    out[2] += c[k].z * w;
  });
  return out;
}
