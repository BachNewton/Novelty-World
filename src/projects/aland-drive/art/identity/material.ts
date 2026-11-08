import { DoubleSide, MeshBasicNodeMaterial, type Node } from "three/webgpu";
import { abs, attribute, cameraPosition, cos, float, floor, fract, int, max, mix, mod, positionGeometry, positionWorld, round, select, sin, smoothstep, step, varying, vec3 } from "three/tsl";
import { outsideCar } from "../car-volume";
import { seedOf, unitOf } from "../hash";
import { rollOf, screenPattern, type RoadsideMaterials } from "../roadside/index";
import { MOTION_KINDS, MOTION_RANGE_M } from "../street/paint";
import type { StreetInputs } from "../street/index";
import { AFLOAT_UNIT, IDENTITY_PARTS, PAINT, PATTERNS, SPIN_UNIT, type Pattern } from "./mesh";
import "./tokens.css";
import { flatNormal } from "../flat-normal";
import { towardsSun } from "../sun";
import { kitPalette } from "../palette";

/*
 * The street kit's two materials with this kit's palette: the same instance layout,
 * so `placeModel` places these; the same light, haze and motion; the same pixel-traded
 * swap between versions and dissolve at a reach rolled per place, so nothing pops or
 * grows out of the ground. Its palette is
 * sealed inside `streetMaterials`, hence the copy of those lines: taking a palette
 * as an argument there would let this file shrink to the two patterns below.
 */

const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
const FOOT_SHADE = 0.72;
const FOOT_M = 1.1;
/** The share of its reach over which the last version dissolves, and the share of it each place's reach is rolled over. */
const LEAVE_SHARE = 0.15;
const LEAVE_SPREAD = 0.1;
const SWAP_BAND = 0.1;
const BOARD_M = 0.19;
const MESH_M = 0.07;
/** Metres a pixel covers, per metre away, at the game's lens and size. */
const PIXEL_M_PER_M = (2 * Math.tan((60 * Math.PI) / 360)) / 1007;
/** Pixels from a thin part's axis to its corners, at the least: a line any thinner breaks into dashes that crawl as it moves. */
const THIN_PIXELS = 0.6;
/** The share of a thin part's cover over which it dissolves, either side of its roll. */
const THIN_BAND = 0.03;
/** A thin part stays while it covers this share of its roll: a little heavier than its share reads truer than a railing with gaps. */
const THIN_HOLD = 0.6;

/** How fast a spinning model turns: an Enercon E-70's rotor at a fresh breeze, 15 turns a minute. */
const SPIN_RAD_PER_S = (15 / 60) * 2 * Math.PI;

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
  const spins = step(float(SPIN_UNIT), code);
  const afloat = step(float(AFLOAT_UNIT), mod(code, SPIN_UNIT));
  const distance = place.xz.sub(cameraPosition.xz).length();
  const roll = rollOf(place.xz);

  const end = reach.y.mul(float(1).sub(roll.mul(LEAVE_SPREAD)));
  const shown = isNear ? distance.lessThan(reach.x.mul(1 + SWAP_BAND).min(end)) : distance.greaterThanEqual(reach.x.mul(1 - SWAP_BAND)).and(distance.lessThan(end));
  const size = select(shown, fit.x, float(0));

  // A thin part is widened to a pixel. Once that pixel is more than the part covers, it goes at a distance of its own
  // roll, so a model's thin parts thin out one by one to their share of the pixels rather than breaking into dashes.
  const thin = attribute<"vec4">("thin", "vec4");
  const half = thin.xyz.length().mul(fit.x);
  const widened = max(float(1), distance.mul(PIXEL_M_PER_M * THIN_PIXELS).div(max(half, float(1e-4))));
  const widenedAt = positionGeometry.add(thin.xyz.mul(widened.sub(1)));
  // A spinning model turns about its own z axis, each place from a start of its own; a still one turns by nothing.
  const turn = time.mul(SPIN_RAD_PER_S).add(roll.mul(6.283)).mul(spins);
  const local = vec3(widenedAt.x.mul(cos(turn)).sub(widenedAt.y.mul(sin(turn))), widenedAt.x.mul(sin(turn)).add(widenedAt.y.mul(cos(turn))), widenedAt.z);
  const thinLeft = varying(select(thin.w.greaterThan(0), smoothstep(thin.w.sub(THIN_BAND), thin.w.add(THIN_BAND), float(1 / THIN_HOLD).div(widened)), float(1)));

  const x = local.x.mul(fit.y);
  const up = local.y.add(x.mul(fit.z));
  const pick = (index: 0 | 1) => MOTION_KINDS.reduce<Node<"float">>((value, name, at) => select(kind.equal(at), float(MOVES[name][index]), value), float(0));
  const wave = time.mul(pick(0)).sub(local.x.mul(pick(1))).add(roll.mul(6.283));
  const z = local.z.add(tint.b.mul(MOTION_RANGE_M).mul(sin(wave)));
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];

  const material = new MeshBasicNodeMaterial();
  material.name = isNear ? "identity-near" : "identity-far";
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(size)), place.y.add(up.mul(size)), place.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(size)));

  const toSun = towardsSun(sun);
  const palette = kitPalette(linear, "identity", () =>
    IDENTITY_PARTS.map((part) => {
      const paint: { from: string; to?: string; share?: number; gain?: number } = PAINT[part];
      const { from, to = from, share = 0, gain = 1 } = paint;
      return linear(from).lerp(linear(to), share).multiplyScalar(gain);
    }),
  );
  const base = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));

  const normal = flatNormal();
  const lit = float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  const grounded = mix(mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), up.mul(fit.x))), float(1), afloat.max(spins));

  const away = positionWorld.sub(cameraPosition).length();
  const metres = vec3(x, local.y, local.z).mul(fit.x);
  const along = metres.x.add(metres.z).div(BOARD_M);
  const seam = float(1).sub(smoothstep(float(0.02), float(0.09), abs(fract(along).sub(0.5)).sub(0.5).abs()));
  const tone = unitOf(seedOf(floor(along)), 1);
  const boarded = base.mul(mix(float(0.92), float(1.07), tone)).mul(float(1).sub(seam.mul(0.45).mul(float(1).sub(gone(0.04, away)))));
  const surfaced = isNear ? select(patternIs(code, "boards"), boarded, base) : base;
  material.colorNode = hazed(surfaced.mul(lit).mul(grounded));

  const pattern = screenPattern();
  const share = smoothstep(reach.x.mul(1 - SWAP_BAND), reach.x.mul(1 + SWAP_BAND), distance);
  // A net is its knots near and half the pixels once they're under one, so it thins rather than shimmers.
  const knotA = abs(fract(metres.x.add(metres.y).div(MESH_M)).sub(0.5));
  const knotB = abs(fract(metres.x.sub(metres.y).add(metres.z).div(MESH_M)).sub(0.5));
  const cord = smoothstep(float(0.36), float(0.44), knotA.max(knotB));
  const netAlpha = mix(cord, float(0.45), gone(MESH_M * 0.5, away));
  const kept = patternIs(code, "net").not().or(pattern.lessThan(netAlpha));
  // A thin part's share is taken from within its version's own share of the pattern, so the two don't eat into each other.
  const traded = isNear ? pattern.greaterThanEqual(share).and(pattern.lessThan(mix(share, float(1), thinLeft))) : pattern.lessThan(share.mul(thinLeft));
  const leaving = smoothstep(end.mul(1 - LEAVE_SHARE), end, distance);
  material.maskNode = traded.and(kept).and(pattern.greaterThanEqual(leaving)).and(outsideCar());
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all its models share them and go through the roadside kit's `placeModel`. */
export function identityMaterials(inputs: StreetInputs): RoadsideMaterials {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}
