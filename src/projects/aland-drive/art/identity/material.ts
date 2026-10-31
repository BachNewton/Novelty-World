import { DoubleSide, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cos, cross, dFdx, dFdy, dot, float, floor, fract, int, mix, mod, normalize, positionGeometry, positionWorld, round, screenCoordinate, select, sin, smoothstep, step, uniform, uniformArray, vec2, vec3 } from "three/tsl";
import type { RoadsideMaterials } from "../roadside/index";
import { MOTION_KINDS, MOTION_RANGE_M } from "../street/paint";
import type { StreetInputs } from "../street/index";
import { AFLOAT_UNIT, IDENTITY_PARTS, PAINT, PATTERNS, type Pattern } from "./mesh";
import "./tokens.css";

/*
 * The street kit's two materials with this kit's palette: the same instance layout,
 * so `placeModel` places these; the same light, haze and motion; the same grow-in at
 * a reach and pixel-traded swap between versions, so nothing pops. Its palette is
 * sealed inside `streetMaterials`, hence the copy of those lines: taking a palette
 * as an argument there would let this file shrink to the two patterns below.
 */

const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
const FOOT_SHADE = 0.72;
const FOOT_M = 1.1;
const GROW_SHARE = 0.14;
const SWAP_BAND = 0.1;
const BOARD_M = 0.19;
const MESH_M = 0.07;
/** Metres a pixel covers, per metre away, at the game's lens and size. */
const PIXEL_M_PER_M = (2 * Math.tan((60 * Math.PI) / 360)) / 1007;

const MOVES = { still: [0, 0], leaf: [1.25, 0.8], cloth: [3.4, 2.1], hull: [0.7, 0], run: [0, 0] } as const;

const patternIs = (code: Node<"float">, name: Pattern) => mod(floor(code.div(8)), 8).equal(PATTERNS.indexOf(name));
const gone = (widthM: number, away: Node<"float">) => smoothstep(float(0.5), float(1.6), away.mul(PIXEL_M_PER_M).div(widthM));

function placedMaterial(inputs: StreetInputs, isNear: boolean): MeshBasicNodeMaterial {
  const { linear, hazed, sun, time } = inputs;
  const place = attribute<"vec4">("place", "vec4");
  const fit = attribute<"vec4">("fit", "vec4");
  const reach = attribute<"vec2">("reach", "vec2");
  const tint = attribute<"vec4">("tint", "vec4");
  const code = round(tint.a.mul(255));
  const kind = mod(code, 8);
  const afloat = step(float(AFLOAT_UNIT), code);
  const distance = place.xz.sub(cameraPosition.xz).length();
  const roll = fract(sin(dot(place.xz, vec2(12.9898, 78.233))).mul(43758.5453));

  const grown = float(1).sub(smoothstep(reach.y.mul(1 - GROW_SHARE), reach.y, distance));
  const shown = isNear ? distance.lessThan(reach.x.mul(1 + SWAP_BAND)) : distance.greaterThanEqual(reach.x.mul(1 - SWAP_BAND)).and(distance.lessThan(reach.y));
  const size = select(shown, fit.x, float(0)).mul(grown);

  const x = positionGeometry.x.mul(fit.y);
  const up = positionGeometry.y.add(x.mul(fit.z));
  const pick = (index: 0 | 1) => MOTION_KINDS.reduce<Node<"float">>((value, name, at) => select(kind.equal(at), float(MOVES[name][index]), value), float(0));
  const wave = time.mul(pick(0)).sub(positionGeometry.x.mul(pick(1))).add(roll.mul(6.283));
  const z = positionGeometry.z.add(tint.b.mul(MOTION_RANGE_M).mul(sin(wave)));
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(size)), place.y.add(up.mul(size)), place.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(size)));

  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const palette = uniformArray(IDENTITY_PARTS.map((part) => {
    const paint: { from: string; to?: string; share?: number; gain?: number } = PAINT[part];
    const { from, to = from, share = 0, gain = 1 } = paint;
    return linear(from).lerp(linear(to), share).multiplyScalar(gain);
  }));
  const base = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));

  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const normal = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  const lit = float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const grounded = mix(mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), up.mul(fit.x))), float(1), afloat);

  const away = positionWorld.sub(cameraPosition).length();
  const metres = vec3(x, positionGeometry.y, positionGeometry.z).mul(fit.x);
  const along = metres.x.add(metres.z).div(BOARD_M);
  const seam = float(1).sub(smoothstep(float(0.02), float(0.09), abs(fract(along).sub(0.5)).sub(0.5).abs()));
  const tone = fract(sin(floor(along).mul(127.1)).mul(43758.5453));
  const boarded = base.mul(mix(float(0.92), float(1.07), tone)).mul(float(1).sub(seam.mul(0.45).mul(float(1).sub(gone(0.04, away)))));
  const surfaced = isNear ? select(patternIs(code, "boards"), boarded, base) : base;
  material.colorNode = hazed(surfaced.mul(lit).mul(grounded));

  const pattern = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
  const share = smoothstep(reach.x.mul(1 - SWAP_BAND), reach.x.mul(1 + SWAP_BAND), distance);
  // A net is its knots near and half the pixels once they're under one, so it thins rather than shimmers.
  const knotA = abs(fract(metres.x.add(metres.y).div(MESH_M)).sub(0.5));
  const knotB = abs(fract(metres.x.sub(metres.y).add(metres.z).div(MESH_M)).sub(0.5));
  const cord = smoothstep(float(0.36), float(0.44), knotA.max(knotB));
  const netAlpha = mix(cord, float(0.45), gone(MESH_M * 0.5, away));
  const kept = patternIs(code, "net").not().or(pattern.lessThan(netAlpha));
  material.maskNode = (isNear ? pattern.greaterThanEqual(share) : pattern.lessThan(share)).and(kept);
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all its models share them and go through the roadside kit's `placeModel`. */
export function identityMaterials(inputs: StreetInputs): RoadsideMaterials {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}
