import { DoubleSide, MeshBasicNodeMaterial, Vector3, type Node } from "three/webgpu";
import { attribute, cameraPosition, cos, cross, dFdx, dFdy, dot, float, fract, int, mix, normalize, positionGeometry, positionWorld, round, screenCoordinate, select, sin, smoothstep, uniform, uniformArray, vec2, vec3 } from "three/tsl";
import type { RoadsideInputs } from "../roadside/material";
import { MOTION_KINDS, MOTION_RANGE_M, STREET_PARTS, type MotionKind, type StreetPart } from "./paint";
import "../cars/tokens.css";
import "./tokens.css";

/*
 * The same instance layout as the roadside kit, so `placeModel` places these
 * models, and the same light and haze. It adds three things: the street's paints,
 * vertices that move, and no switch anyone can see. An object grows out of nothing
 * over the last share of its reach, and between its versions the two trade pixels
 * by a fixed screen pattern over a band of distance, so they are never both whole
 * and there's never a hole. The pattern means a `discard` in these two materials,
 * so they keep to objects, never to anything that covers the screen.
 */

export interface StreetInputs extends RoadsideInputs {
  /** Seconds, for what moves. It needn't be the clock: a paused game can hold it. */
  time: Node<"float">;
}

const PAINT: Record<StreetPart, { from: string; to?: string; share?: number; gain?: number }> = {
  rail: { from: "wall-pale", to: "wall-grey", share: 0.3, gain: 1.02 },
  "rail-post": { from: "wall-pale", to: "wall-grey", share: 0.55, gain: 0.85 },
  "rail-spacer": { from: "wall-grey", to: "wall-plinth", share: 0.4 },
  "post-white": { from: "wall-trim" },
  "post-band": { from: "car-tyre", gain: 1.3 },
  reflector: { from: "car-lens-reverse", to: "wall-trim", share: 0.5, gain: 1.1 },
  "camera-grey": { from: "wall-pale", to: "wall-grey", share: 0.65, gain: 0.95 },
  "camera-dark": { from: "wall-plinth", gain: 0.6 },
  "camera-glass": { from: "car-glass", to: "water", share: 0.25 },
  "camera-lens": { from: "car-lens-head", gain: 0.9 },
  concrete: { from: "wall-pale", to: "wall-grey", share: 0.35 },
  "paving-stone": { from: "wall-grey", to: "wall-pale", share: 0.4 },
  grass: { from: "tree-birch", to: "ground", share: 0.45, gain: 0.95 },
  "grass-pale": { from: "tree-birch", to: "wall-yellow", share: 0.3, gain: 1.05 },
  "grass-seed": { from: "wall-yellow", to: "tree-bark", share: 0.45 },
  stem: { from: "tree-birch", to: "tree-pine", share: 0.5 },
  "petal-white": { from: "wall-trim", gain: 1.05 },
  "petal-yellow": { from: "ui-accent", to: "wall-yellow", share: 0.2 },
  "petal-lupine": { from: "flower-lupine" },
  "petal-fireweed": { from: "flower-fireweed" },
  "flower-eye": { from: "ui-accent" },
  leaf: { from: "tree-birch", to: "tree-pine", share: 0.2, gain: 1.1 },
  "leaf-lit": { from: "tree-birch", to: "wall-yellow", share: 0.09, gain: 1.24 },
  "leaf-under": { from: "tree-pine", to: "tree-birch", share: 0.3, gain: 1.05 },
  bark: { from: "tree-bark", to: "wall-plinth", share: 0.45, gain: 0.95 },
  "bark-limb": { from: "tree-bark", to: "wall-plinth", share: 0.3, gain: 1.05 },
  "bench-wood": { from: "wall-door", to: "wall-yellow", share: 0.3, gain: 1.15 },
  iron: { from: "car-tyre", to: "wall-plinth", share: 0.3, gain: 1.1 },
  "park-green": { from: "tree-spruce", to: "wall-plinth", share: 0.2, gain: 0.95 },
  steel: { from: "wall-pale", to: "wall-grey", share: 0.45, gain: 0.95 },
  "cafe-top": { from: "wall-trim", to: "wall-cream", share: 0.4 },
  "cafe-frame": { from: "wall-plinth", gain: 0.55 },
  canvas: { from: "wall-cream", gain: 1.08 },
  "canvas-trim": { from: "wall-red", gain: 1.1 },
  "planter-wood": { from: "wall-door", to: "wall-grey", share: 0.4 },
  soil: { from: "tree-bark", gain: 0.55 },
  "flag-white": { from: "flag-white" },
  "flag-fi-blue": { from: "flag-fi-blue" },
  "flag-ax-blue": { from: "flag-ax-blue" },
  "flag-ax-yellow": { from: "flag-ax-yellow" },
  "flag-ax-red": { from: "flag-ax-red" },
  "pole-white": { from: "wall-trim" },
  "pole-gold": { from: "ui-accent", to: "wall-yellow", share: 0.5 },
  "mast-wood": { from: "wall-grey", to: "wall-door", share: 0.35, gain: 1.05 },
  "midsummer-leaf": { from: "tree-birch", to: "tree-pine", share: 0.15 },
  "midsummer-leaf-lit": { from: "tree-birch", to: "wall-yellow", share: 0.05, gain: 1.22 },
  "ribbon-red": { from: "wall-red", to: "edge", share: 0.35 },
  "ribbon-blue": { from: "water", gain: 1.05 },
  bollard: { from: "car-tyre", to: "wall-plinth", share: 0.2, gain: 1.15 },
  "bollard-cap": { from: "wall-plinth", gain: 0.75 },
  "crane-yellow": { from: "wall-yellow", to: "ui-accent", share: 0.5 },
  "crane-dark": { from: "wall-plinth", gain: 0.6 },
  "crane-glass": { from: "car-glass", to: "sky", share: 0.2 },
  "hull-white": { from: "wall-trim" },
  "hull-stripe": { from: "water", gain: 0.6 },
  "hull-under": { from: "wall-red", to: "wall-plinth", share: 0.5, gain: 0.7 },
  deck: { from: "wall-cream", to: "wall-grey", share: 0.2 },
  cabin: { from: "wall-trim", to: "wall-cream", share: 0.4 },
  spar: { from: "wall-pale", gain: 1.05 },
  "sail-cover": { from: "water", gain: 0.7 },
  rigging: { from: "wall-plinth", gain: 0.85 },
};

const AMBIENT = 0.68;
const SUN_SHARE = 0.5;
const FOOT_SHADE = 0.72;
const FOOT_M = 1.1;

/** The share of an object's reach it takes to grow from nothing. */
const GROW_SHARE = 0.14;
/** The band two versions trade pixels over, as a share either side of the swap. */
const SWAP_BAND = 0.1;

/** How fast each kind moves, in radians a second, and how many waves fit in a metre along it. */
const MOVES: Record<MotionKind, { speed: number; waves: number }> = {
  still: { speed: 0, waves: 0 },
  leaf: { speed: 1.25, waves: 0.8 },
  cloth: { speed: 4.6, waves: 2.4 },
  hull: { speed: 0.7, waves: 0 },
  run: { speed: 0, waves: 0 },
};
const RIPPLE_SHARE = 0.35;
const RIPPLE_RATE = 1.73;

const kindIs = (kind: Node<"float">, wanted: MotionKind) => kind.equal(MOTION_KINDS.indexOf(wanted));
const rollOf = (place: Node<"vec2">) => fract(sin(dot(place, vec2(12.9898, 78.233))).mul(43758.5453));

/** Interleaved gradient noise: an even spread of thresholds over the screen, the same every frame for a still pixel. */
const screenPattern = () => fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));

/** How far along its two versions a place's distance has come: 0 is all near, 1 all far. */
const swapShare = (reach: Node<"vec2">, distance: Node<"float">) => smoothstep(reach.x.mul(1 - SWAP_BAND), reach.x.mul(1 + SWAP_BAND), distance);

function paintOf({ linear, sun }: Pick<RoadsideInputs, "linear" | "sun">, foot: Node<"float">, roll: Node<"float">, kind: Node<"float">) {
  const azimuth = (sun.azimuthDeg * Math.PI) / 180;
  const elevation = (sun.elevationDeg * Math.PI) / 180;
  const toSun = uniform(new Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)));
  const palette = uniformArray(STREET_PARTS.map((part) => {
    const { from, to, share = 0, gain = 1 } = PAINT[part];
    return linear(from).lerp(to === undefined ? linear(from) : linear(to), share).multiplyScalar(gain);
  }));
  const tint = attribute<"vec4">("tint", "vec4");
  const painted = (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));
  // No two trees or tufts are quite the one green.
  const base = select(kindIs(kind, "leaf"), painted.mul(mix(float(0.88), float(1.1), roll)), painted);

  const facing = normalize(cross(dFdx(positionWorld), dFdy(positionWorld)));
  const normal = select(facing.dot(cameraPosition.sub(positionWorld)).lessThan(0), facing.negate(), facing);
  const lit = float(AMBIENT).add(normal.dot(toSun).max(0).mul(SUN_SHARE));
  return base.mul(lit.mul(mix(float(FOOT_SHADE), float(1), smoothstep(float(0), float(FOOT_M), foot))));
}

/** The way a vertex is out of true: towards the model's +z, as the wind or the swell has it. */
function motionOf(time: Node<"float">, roll: Node<"float">, kind: Node<"float">) {
  const metres = attribute<"vec4">("tint", "vec4").b.mul(MOTION_RANGE_M);
  const pick = (key: "speed" | "waves") => (Object.keys(MOVES) as MotionKind[]).reduce<Node<"float">>((value, name) => select(kindIs(kind, name), float(MOVES[name][key]), value), float(0));
  const wave = time.mul(pick("speed")).add(positionGeometry.x.mul(pick("waves")).mul(-1)).add(roll.mul(6.283));
  return metres.mul(sin(wave).add(sin(wave.mul(RIPPLE_RATE)).mul(RIPPLE_SHARE)));
}

function placedMaterial(inputs: StreetInputs, isNear: boolean): MeshBasicNodeMaterial {
  const place = attribute<"vec4">("place", "vec4");
  const fit = attribute<"vec4">("fit", "vec4");
  const reach = attribute<"vec2">("reach", "vec2");
  const kind = round(attribute<"vec4">("tint", "vec4").a.mul(255));
  const distance = place.xz.sub(cameraPosition.xz).length();
  const roll = rollOf(place.xz);

  const grown = float(1).sub(smoothstep(reach.y.mul(1 - GROW_SHARE), reach.y, distance));
  const shown = isNear ? distance.lessThan(reach.x.mul(1 + SWAP_BAND)) : distance.greaterThanEqual(reach.x.mul(1 - SWAP_BAND)).and(distance.lessThan(reach.y));
  const size = select(shown, fit.x, float(0));
  const isRun = kindIs(kind, "run");
  const wide = select(isRun, size, size.mul(grown));
  const tall = size.mul(grown);

  const x = positionGeometry.x.mul(fit.y);
  const up = positionGeometry.y.add(x.mul(fit.z));
  const z = positionGeometry.z.add(motionOf(inputs.time, roll, kind));
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(wide)), place.y.add(up.mul(tall)), place.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(wide)));
  material.colorNode = inputs.hazed(paintOf(inputs, up.mul(fit.x), roll, kind));
  const pattern = screenPattern();
  const share = swapShare(reach, distance);
  material.maskNode = isNear ? pattern.greaterThanEqual(share) : pattern.lessThan(share);
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all objects share them, and go through the roadside kit's `placeModel`. */
export function streetMaterials(inputs: StreetInputs) {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}

export type StreetMaterials = ReturnType<typeof streetMaterials>;
