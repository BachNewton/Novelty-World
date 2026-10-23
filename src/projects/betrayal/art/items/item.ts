import * as THREE from "three";
import { animated } from "../animate";
import { figureMaterial, form, type Solid } from "../forms";
import { declareParts, partsOf, type FigureParts } from "../figure-parts";
import { joins } from "../explorers/figure";
import { handsOf, holdIn, type Prop } from "../explorers/hands";
import { CARRIED_LIGHT, carriedLight, flickerOf } from "../lighting";
import { FLOOR_RINGS } from "../room";
import { glow, group } from "../shapes";
import { shiny, type Shine } from "../shine";
import type { ExplorerBuilder } from "../stage";

/*
 * The item and omen cards' models: one per card, built once and shown in two
 * places, in a hand and on its plate when it lies on the floor. The base
 * game has no "equipped" state, so the figure is not the inventory: a card is
 * shown in the hand only while it is used (an attack, ringing the Bell),
 * worn things always (Armor, the Mask), the Candle always, lit; the rest are
 * pips on the explorer's mark. See the `betrayal-figure-art` skill, "Item
 * models".
 *
 * A model is built round its grip, as `Prop` says: its handle's axis along +y
 * through the origin, +z along the hand towards the fingertips, +x across the
 * palm (towards the body, in a right hand). Held things are oversized, as a
 * tabletop miniature's are, so they read from the house's distance: about
 * one and a half to two times their real size, a weapon most of all.
 *
 * Its geometry is meshed once a session, in a worker in the house
 * (`figure-parts.ts`), and every copy shares it. Each material is its own
 * mesh: metal that shines is a part apart from the wood that doesn't, and the
 * places where a model's own parts meet are declared as joints, so the
 * clipping check passes them.
 */

/** How much bigger than life a held thing is built. */
export const OVERSIZE = 1.8;
/** Metres at the held size. */
export const o = (metres: number) => metres * OVERSIZE;

/** A card's model: in a hand, and on its plate. */
export interface ItemModel {
  /** The card's id, as the engine names it. */
  readonly card: string;
  /** What it is meshed from, once a session. */
  readonly parts: readonly FigureParts<unknown>[];
  /** A new copy in a hand, built round its grip. */
  readonly held: () => Prop;
  /** A new copy lying (or standing) on its plate: at the plate's middle, resting on it, sized for the plate. */
  readonly floor: () => THREE.Object3D;
}

/** How a model lies on its plate: turned from its grip's frame onto the floor (`lie`), then spun round the plate's middle. */
export interface PlatePose {
  lie: THREE.Euler;
  spin: number;
}

/** On its side, a model thin through x (a blade in the hand's plane, a revolver) lying on its flat, its handle across the plate. */
export const ON_ITS_SIDE: PlatePose = { lie: new THREE.Euler(0, 0, Math.PI / 2), spin: 0.6 };
/** Face up, a model thin through z (broad across the hand: a spear's head, an axe's bit) lying on its flat, its handle across the plate. */
export const FACE_UP: PlatePose = { lie: new THREE.Euler(Math.PI / 2, 0, 0), spin: 0.7 };

/** How much of its plate a model covers: within the rim's glow, and no taller than this. */
const PLATE_FIT = { reach: FLOOR_RINGS.plate.rim * 0.9, height: 0.32 };
/** Where a model on its plate rests: just on the plate, which lies on the colour rings' plane over the floor and would hide what lies under it. */
export const PLATE_TOP = FLOOR_RINGS.height + 0.002;

/**
 * A model posed on its plate: turned as `pose` says, then sized so it fills
 * the plate inside its rim (a ring as much as a spear: the plate is how a
 * thing on the floor reads, whatever it is), resting on the plate at its
 * middle.
 */
export function onPlate(model: THREE.Object3D, { lie, spin }: PlatePose): THREE.Object3D {
  model.rotation.copy(lie);
  const turned = group(model);
  turned.rotation.y = spin;
  const sized = group(turned);
  sized.updateMatrixWorld(true);
  const points: THREE.Vector3[] = [];
  sized.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const position = (child.geometry as THREE.BufferGeometry).getAttribute("position");
    for (let i = 0; i < position.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
  });
  if (points.length === 0) throw new Error("A model with no meshes can't lie on a plate");
  const box = new THREE.Box3().setFromPoints(points);
  const middle = box.getCenter(new THREE.Vector3());
  const reach = points.reduce((most, point) => Math.max(most, Math.hypot(point.x - middle.x, point.z - middle.z)), 0);
  const scale = Math.min(PLATE_FIT.reach / reach, PLATE_FIT.height / (box.max.y - box.min.y));
  sized.scale.setScalar(scale);
  sized.position.set(-middle.x * scale, PLATE_TOP - box.min.y * scale, -middle.z * scale);
  return group(sized);
}

/** A held thing's model, and the floor's the same model posed on its plate, unless it gives its own (`floor`). */
export function itemModel(spec: { card: string; parts: readonly FigureParts<unknown>[]; held: () => Prop; plate: PlatePose; floor?: () => THREE.Object3D }): ItemModel {
  const { card, parts, held, plate } = spec;
  return { card, parts, held, floor: spec.floor ?? (() => onPlate(held().object, plate)) };
}

/** One of a model's parts, one material: shiny, if it is metal (or anything else that clearly shines). */
export function piece(geometry: THREE.BufferGeometry, name: string, shine?: Shine): THREE.Mesh {
  const mesh = form(shine ? shiny(figureMaterial(), shine) : figureMaterial(), geometry);
  mesh.name = name;
  return mesh;
}

/** A model of several parts, its own joints declared (where its parts pass into each other, which they always do alike). */
export function assembled(name: string, parts: readonly THREE.Mesh[], seams: readonly { between: readonly [THREE.Mesh, THREE.Mesh]; at: THREE.Vector3Tuple; radius: number }[] = []): THREE.Group {
  const model = group(...parts);
  model.name = name;
  const joints = seams.map(({ between, at, radius }) => {
    const mark = group();
    mark.position.set(...at);
    model.add(mark);
    return { parts: between, at: mark, radius };
  });
  return joins(model, joints);
}

/**
 * A flat blade: `outline`, a polygon of [z, y] points (along the hand and
 * along the handle), extruded through x, `thickness` through its middle,
 * bevelled down to `edge` at its outline over `bevel` metres in from it, so
 * a blade has a ridge down it and its edges catch the light. An axe's bit,
 * a dagger's blade. `flat: "z"` lays it across the hand instead, its outline
 * in x and y and its thickness through z: a spear's head, broad face on.
 */
export function blade(
  outline: readonly (readonly [number, number])[],
  { thickness, edge, bevel, flat = "x" }: { thickness: number; edge: number; bevel: number; flat?: "x" | "z" },
): Solid {
  const n = outline.length;
  const zs = outline.map(([z]) => z);
  const ys = outline.map(([, y]) => y);
  // Inigo Quilez's signed distance to a polygon.
  const across = (z: number, y: number) => {
    let d = (z - zs[0]) ** 2 + (y - ys[0]) ** 2;
    let sign = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const ez = zs[j] - zs[i];
      const ey = ys[j] - ys[i];
      const wz = z - zs[i];
      const wy = y - ys[i];
      const t = THREE.MathUtils.clamp((wz * ez + wy * ey) / (ez * ez + ey * ey), 0, 1);
      d = Math.min(d, (wz - ez * t) ** 2 + (wy - ey * t) ** 2);
      const up = y >= ys[i];
      const below = y < ys[j];
      const left = ez * wy > ey * wz;
      if ((up && below && left) || (!up && !below && !left)) sign = -sign;
    }
    return sign * Math.sqrt(d);
  };
  const distance = (thin: number, y: number, along: number) => {
    const outside = across(along, y);
    const inward = THREE.MathUtils.smoothstep(-outside, 0, bevel);
    const through = Math.abs(thin) - (edge + (thickness - edge) * inward) / 2;
    return Math.hypot(Math.max(outside, 0), Math.max(through, 0)) + Math.min(Math.max(outside, through), 0);
  };
  const [low, high] = [Math.min(...zs), Math.max(...zs)];
  const half = thickness / 2;
  return flat === "x"
    ? { distance, min: [-half, Math.min(...ys), low], max: [half, Math.max(...ys), high] }
    : { distance: (x, y, z) => distance(z, y, x), min: [low, Math.min(...ys), -half], max: [high, Math.max(...ys), half] };
}

/** Points along a curve from `from` to `to` that bows `bow` metres to its left (as [z, y] runs from one to the other), `steps` of them past the first. */
export function bowed(from: readonly [number, number], to: readonly [number, number], bow: number, steps = 6): [number, number][] {
  const [dz, dy] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dz, dy);
  const [nz, ny] = [-dy / length, dz / length];
  return Array.from({ length: steps }, (_, k) => {
    const t = (k + 1) / steps;
    const out = bow * Math.sin(Math.PI * t);
    return [from[0] + dz * t + nz * out, from[1] + dy * t + ny * out];
  });
}

/**
 * A held thing that burns: its flame, a glowing teardrop at `at` (in the
 * prop's frame) that wavers, and the live light it gives (see
 * `carriedLight`), flickering with it. Any prop with a flame (a candle, a
 * lantern, a torch) carries its light this way, so the light goes wherever
 * the prop is carried.
 */
export function burning(body: THREE.Object3D, flame: THREE.BufferGeometry, at: THREE.Vector3): THREE.Group {
  const lit = new THREE.Mesh(flame, glow("flame"));
  lit.name = "flame";
  lit.position.copy(at);
  const light = carriedLight();
  light.position.copy(at);
  return animated(group(body, lit, light), (seconds) => {
    const waver = flickerOf(seconds, 1);
    light.intensity = CARRIED_LIGHT.intensity * (1 + CARRIED_LIGHT.flicker * waver);
    lit.scale.set(1 - 0.06 * waver, 1 + 0.18 * waver, 1 - 0.06 * waver);
  });
}

/** A figure built holding an item in its right hand. */
export function carrying(build: ExplorerBuilder, item: ItemModel): ExplorerBuilder {
  const carried: ExplorerBuilder = (seed, gait) => {
    const figure = build(seed, gait);
    const hands = handsOf(figure);
    if (!hands) throw new Error("A figure without hands can't carry an item");
    holdIn(hands.right, item.held());
    return figure;
  };
  return declareParts(carried, [...partsOf(build), ...item.parts]);
}
