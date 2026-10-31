import { abs, cross, dot, float, fract, fwidth, max, mix, normalize, select, smoothstep, texture, vec2, vec3 } from "three/tsl";
import type { Node, Texture } from "three/webgpu";
import { COARSE_M } from "./ground";

/*
 * A roof up close: the colour stays the photo's, and the slope's own direction
 * lays out what the roof is made of. Warm roofs are tile, in courses up the
 * slope; the rest are sheet metal, with a standing seam running down it. A flat
 * roof is felt. Like the walls' boards, it all fades by the size of a pixel.
 */

const COURSE_M = 0.34;
const TILE_M = 0.3;
const SEAM_M = 0.52;
const FLAT_FROM = 0.97;
const GONE = [0.08, 0.24] as const;
const MOSS_SHARE = 0.34;

export interface RoofInput {
  /** The roof's colour from the photo, linear. */
  base: Node<"vec3">;
  position: Node<"vec3">;
  /** The face's normal, towards the camera. */
  normal: Node<"vec3">;
  toSun: Node<"vec3">;
  moss: Node<"vec3">;
  detail: Texture;
}

export function roofDetail({ base, position, normal, toSun, moss, detail }: RoofInput): Node<"vec3"> {
  const up = abs(normal.y);
  const downhill = normalize(vec2(normal.x, normal.z).add(vec2(0.0001, 0)));
  const sideways = normalize(cross(vec3(downhill.x, 0, downhill.y), vec3(0, 1, 0)));
  const across = dot(position, sideways);
  const upSlope = dot(position.xz, downhill).div(up.max(0.3));
  const pixel = fwidth(across).add(fwidth(upSlope));
  const shown = float(1).sub(smoothstep(float(GONE[0]), float(GONE[1]), pixel));
  const stain = texture(detail, position.xz.div(COARSE_M * 2.3));

  // Tile: each course laps the one below, with a shadow under its edge and a rounded profile across.
  const course = upSlope.div(COURSE_M);
  const inCourse = fract(course);
  const courseShadow = smoothstep(float(0.8), float(1), inCourse);
  const staggered = fract(across.div(TILE_M).add(course.floor().mul(0.5)));
  const profile = abs(staggered.sub(0.5)).mul(2);
  const tile = float(1).sub(courseShadow.mul(0.42)).sub(profile.mul(profile).mul(0.2)).add(0.1);

  // Sheet metal: a raised seam, lit on its sunward side, its other side in shadow.
  const seamPlace = fract(across.div(SEAM_M));
  const seamSide = select(dot(sideways, toSun).greaterThan(0), float(1), float(-1));
  const seamLit = smoothstep(float(0.86), float(0.94), seamPlace).mul(float(1).sub(smoothstep(float(0.94), float(1), seamPlace)));
  const seamDark = smoothstep(float(0), float(0.04), seamPlace).mul(float(1).sub(smoothstep(float(0.04), float(0.13), seamPlace)));
  const metal = float(1).add(seamLit.sub(seamDark).mul(seamSide).mul(0.3));

  // A warm roof's red runs well above its blue.
  const warm = smoothstep(float(0.12), float(0.3), base.r.sub(base.b).div(max(base.r, float(0.01))));
  const sloped = mix(metal, tile, warm);
  const felt = float(1).add(stain.g.sub(0.5).mul(0.5));
  const pattern = mix(select(up.greaterThan(FLAT_FROM), felt, sloped), float(1), float(1).sub(shown));

  const weathered = float(1).add(stain.a.sub(0.5).mul(0.3));
  const mossy = smoothstep(float(0.58), float(0.72), stain.a).mul(select(up.greaterThan(FLAT_FROM), float(0), float(1))).mul(MOSS_SHARE).mul(warm);
  return mix(base.mul(pattern).mul(mix(float(1), weathered, shown)), moss, mossy.mul(shown));
}
