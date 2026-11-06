import { DoubleSide, MeshBasicNodeMaterial, type Node, type Vector3 } from "three/webgpu";
import { attribute, cameraPosition, cos, float, int, mix, positionGeometry, round, select, sin, smoothstep, uniformArray, vec3 } from "three/tsl";
import { outsideCar } from "../car-volume";
import { seasonNodes, type SeasonLook } from "../season";
import { lindenThroughYear } from "./linden";
import { facetLight, footShade, rollOf, screenPattern, type RoadsideInputs } from "../roadside/material";
import { MOTION_KINDS, MOTION_RANGE_M, STREET_PARTS, type MotionKind, type StreetPart } from "./paint";

/*
 * The same instance layout as the roadside kit, so `placeModel` places these
 * models, and the same light and haze. It adds three things: the street's paints,
 * vertices that move, and no switch anyone can see. Between its versions the two
 * trade pixels by a fixed screen pattern over a band of distance, so they are never
 * both whole and there's never a hole, and towards its reach the last version
 * dissolves by the same pattern, at a distance rolled per place, as the roadside
 * kit's do: a bench rising out of the ground would be seen. The pattern means a `discard` in these two materials,
 * so they keep to objects, never to anything that covers the screen.
 */

export interface StreetInputs extends RoadsideInputs {
  /** Seconds, for what moves. It needn't be the clock: a paused game can hold it. */
  time: Node<"float">;
  /** The season a linden's leaves turn and fall by; summer if none. */
  season?: SeasonLook;
}

const PAINT: Record<StreetPart, { from: string; to?: string; share?: number; gain?: number }> = {
  rail: { from: "wall-pale", to: "wall-grey", share: 0.3, gain: 1.02 },
  "rail-post": { from: "wall-pale", to: "wall-grey", share: 0.55, gain: 0.85 },
  "rail-spacer": { from: "wall-grey", to: "wall-plinth", share: 0.4 },
  "post-white": { from: "wall-trim" },
  "post-band": { from: "car-tyre", gain: 1.3 },
  reflector: { from: "car-lens-reverse", to: "wall-trim", share: 0.5, gain: 1.1 },
  "camera-glass": { from: "car-glass", to: "water", share: 0.25 },
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
  "linden-leaf": { from: "tree-birch", to: "tree-pine", share: 0.2, gain: 1.1 },
  "linden-leaf-lit": { from: "tree-birch", to: "wall-yellow", share: 0.09, gain: 1.24 },
  "linden-leaf-under": { from: "tree-pine", to: "tree-birch", share: 0.3, gain: 1.05 },
};

/** The share of its reach over which the last version dissolves. */
const LEAVE_SHARE = 0.15;
/** Each place leaves somewhere in this share of its reach, so a row doesn't go on one line. */
const LEAVE_SPREAD = 0.1;
/** The band two versions trade pixels over, as a share either side of the swap. */
const SWAP_BAND = 0.1;

/** How fast each kind moves, in radians a second, and how many waves fit in a metre along it. */
const MOVES: Record<MotionKind, { speed: number; waves: number }> = {
  still: { speed: 0, waves: 0 },
  leaf: { speed: 1.25, waves: 0.8 },
  cloth: { speed: 4.6, waves: 2.4 },
  hull: { speed: 0.7, waves: 0 },
};
const RIPPLE_SHARE = 0.35;
const RIPPLE_RATE = 1.73;

const kindIs = (kind: Node<"float">, wanted: MotionKind) => kind.equal(MOTION_KINDS.indexOf(wanted));

/** How far along its two versions a place's distance has come: 0 is all near, 1 all far. */
const swapShare = (reach: Node<"vec2">, distance: Node<"float">) => smoothstep(reach.x.mul(1 - SWAP_BAND), reach.x.mul(1 + SWAP_BAND), distance);

/** Every part's paint in linear light, by its place in `STREET_PARTS`. */
export function streetColours(linear: RoadsideInputs["linear"]): Vector3[] {
  return STREET_PARTS.map((part) => {
    const { from, to, share = 0, gain = 1 } = PAINT[part];
    return linear(from).lerp(to === undefined ? linear(from) : linear(to), share).multiplyScalar(gain);
  });
}

/** Every part's paint, by its place in `STREET_PARTS`, for a shader. */
export function streetPalette(linear: RoadsideInputs["linear"]) {
  return uniformArray(streetColours(linear));
}

/** A vertex's paint from the kit's palette, before any light. */
export function streetPaint(palette: ReturnType<typeof streetPalette>): Node<"vec3"> {
  const tint = attribute<"vec4">("tint", "vec4");
  return (palette.element(int(round(tint.r.mul(255)))) as unknown as Node<"vec3">).mul(tint.g.mul(255 / 128));
}

function paintOf({ linear, sun }: Pick<RoadsideInputs, "linear" | "sun">, foot: Node<"float">, roll: Node<"float">, kind: Node<"float">, inSeason: (summer: Node<"vec3">) => Node<"vec3">) {
  const painted = inSeason(streetPaint(streetPalette(linear)));
  // No two trees or tufts are quite the one green.
  const base = select(kindIs(kind, "leaf"), painted.mul(mix(float(0.88), float(1.1), roll)), painted);
  return base.mul(facetLight(sun).lit.mul(footShade(foot)));
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

  const end = reach.y.mul(float(1).sub(roll.mul(LEAVE_SPREAD)));
  const shown = isNear ? distance.lessThan(reach.x.mul(1 + SWAP_BAND).min(end)) : distance.greaterThanEqual(reach.x.mul(1 - SWAP_BAND)).and(distance.lessThan(end));
  const size = select(shown, fit.x, float(0));

  const tint = attribute<"vec4">("tint", "vec4");
  const year = lindenThroughYear(seasonNodes(inputs.season), place.xz, round(tint.r.mul(255)), tint.g.mul(255 / 128), inputs.linear);
  const x = positionGeometry.x.mul(fit.y).mul(year.spread);
  const up = positionGeometry.y.add(positionGeometry.x.mul(fit.y).mul(fit.z));
  const z = positionGeometry.z.add(motionOf(inputs.time, roll, kind)).mul(year.spread);
  const [yawCos, yawSin] = [cos(place.w), sin(place.w)];

  const material = new MeshBasicNodeMaterial();
  material.positionNode = vec3(place.x.add(x.mul(yawCos).add(z.mul(yawSin)).mul(size)), place.y.add(up.mul(size)), place.z.add(z.mul(yawCos).sub(x.mul(yawSin)).mul(size)));
  material.colorNode = inputs.hazed(paintOf(inputs, up.mul(fit.x), roll, kind, year.paint));
  const pattern = screenPattern();
  const share = swapShare(reach, distance);
  const kept = pattern.greaterThanEqual(smoothstep(end.mul(1 - LEAVE_SHARE), end, distance));
  material.maskNode = (isNear ? pattern.greaterThanEqual(share) : pattern.lessThan(share)).and(kept).and(outsideCar());
  material.side = DoubleSide;
  return material;
}

/** The kit's materials, made once for the game; all objects share them, and go through the roadside kit's `placeModel`. */
export function streetMaterials(inputs: StreetInputs) {
  return { near: placedMaterial(inputs, true), far: placedMaterial(inputs, false) };
}

export type StreetMaterials = ReturnType<typeof streetMaterials>;
