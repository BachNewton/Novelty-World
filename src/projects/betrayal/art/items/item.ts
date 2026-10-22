import * as THREE from "three";
import { animated } from "../animate";
import { figureMaterial, form, shaped, solidOf, type Solid, type Vec3 } from "../forms";
import { declareParts, partsOf, type FigureParts } from "../figure-parts";
import { bandAt, joins, middleOf, slotOf, type ChestFit, type Fits, type Slot } from "../explorers/figure";
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

/** What every card's model has: its card, what it is meshed from, and how it lies on the floor. */
interface Model {
  /** The card's id, as the engine names it. */
  readonly card: string;
  /** What it is meshed from, once a session. */
  readonly parts: readonly FigureParts<unknown>[];
  /** A new copy lying (or standing) on its plate: at the plate's middle, resting on it, sized for the plate. */
  readonly floor: () => THREE.Object3D;
}

/** A thing carried in the hand, shown there in the beat it is used. */
export interface HeldModel extends Model {
  /** A new copy in a hand, built round its grip. */
  readonly held: () => Prop;
  readonly worn?: undefined;
}

/**
 * A thing worn on the body (Armor, the Mask), shown there always: clothing,
 * the one exception to a figure not being its inventory. It is sculpted once
 * at its `reference` fit and stretched to whichever figure wears it.
 */
export interface Worn<S extends Slot> {
  readonly slot: S;
  /** The fit it is sculpted at, and shown at on its plate. */
  readonly reference: Fits[S];
  /** A new copy fitted to a figure's slot, in its anchor part's frame. */
  readonly build: (fit: Fits[S]) => THREE.Object3D;
  /** How what lies over it (a scarf's ends, a pack's straps) is lifted clear of it: scaled about a point in the anchor's frame. */
  readonly lifts?: (fit: Fits[S]) => { about: THREE.Vector3; scale: THREE.Vector3 };
}

export interface WornModel extends Model {
  readonly worn: Worn<"chest"> | Worn<"face">;
  readonly held?: undefined;
}

/** A card's model: in a hand or on the body, and on its plate. */
export type ItemModel = HeldModel | WornModel;

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
export function itemModel(spec: { card: string; parts: readonly FigureParts<unknown>[]; held: () => Prop; plate: PlatePose; floor?: () => THREE.Object3D }): HeldModel {
  const { card, parts, held, plate } = spec;
  return { card, parts, held, floor: spec.floor ?? (() => onPlate(held().object, plate)) };
}

/** A worn thing at the fit it was sculpted at: on its plate, or anywhere it is shown off a figure. */
export function asSculpted(worn: Worn<"chest"> | Worn<"face">): THREE.Object3D {
  return worn.slot === "chest" ? worn.build(worn.reference) : worn.build(worn.reference);
}

/** A worn thing's model, and the floor's the same model at its reference fit, posed on its plate. */
export function wornModel(spec: { card: string; parts: readonly FigureParts<unknown>[]; worn: Worn<"chest"> | Worn<"face">; plate: PlatePose }): WornModel {
  const { card, parts, worn, plate } = spec;
  return { card, parts, worn, floor: () => onPlate(asSculpted(worn), plate) };
}

/** Where a worn thing keeps what it lifted out of its way, to let it lie back when it comes off. */
const LIFTED = "lifted";

function fitOn<S extends Slot>(figure: THREE.Object3D, worn: Worn<S>): THREE.Object3D {
  const slot = slotOf(figure, worn.slot);
  if (!slot) throw new Error(`The figure has no ${worn.slot} to wear a thing on`);
  takeOff(figure, worn.slot);
  const object = worn.build(slot.fit);
  slot.anchor.add(object);
  slot.worn = object;
  const lifting = worn.lifts?.(slot.fit);
  const lifted: THREE.Group[] = [];
  if (lifting) {
    figure.updateMatrixWorld(true);
    for (const over of slot.over) {
      const parent = over.parent;
      if (!parent) throw new Error("A thing that lies over a worn one is not on the figure");
      // Its parent shares the anchor's axes (the anchor itself, or the group the anchor stands in), so only the point to scale about moves.
      const about = parent.worldToLocal(slot.anchor.localToWorld(lifting.about.clone()));
      const lift = group();
      lift.scale.copy(lifting.scale);
      lift.position.copy(about).multiply(new THREE.Vector3(1, 1, 1).sub(lifting.scale));
      parent.add(lift);
      lift.add(over);
      lifted.push(lift);
    }
  }
  object.userData[LIFTED] = lifted;
  for (const tucked of slot.under) tucked.visible = false;
  return object;
}

/** Puts a worn thing on a figure, in its slot, fitted to the figure; whatever it wore there comes off. */
export function wear(figure: THREE.Object3D, model: WornModel): THREE.Object3D {
  const { worn } = model;
  return worn.slot === "chest" ? fitOn(figure, worn) : fitOn(figure, worn);
}

/** Takes off what a figure wears in a slot, if anything, and lets what it lifted lie back. */
export function takeOff(figure: THREE.Object3D, name: Slot) {
  const slot = slotOf(figure, name);
  const object = slot?.worn;
  if (!slot || !object) return;
  object.removeFromParent();
  slot.worn = null;
  for (const tucked of slot.under) tucked.visible = true;
  for (const lift of object.userData[LIFTED] as THREE.Group[]) {
    const parent = lift.parent;
    if (!parent) throw new Error("A lifted thing has come off the figure");
    for (const child of [...lift.children]) parent.add(child);
    lift.removeFromParent();
  }
}

/**
 * The stretch from one chest fit to another: each height moves to the same
 * place between the new fit's bands, and each point there out as the
 * torso's section there is wider and deeper. `at` says how a height of the
 * first fit moves and how much it is stretched each way there; `back` takes a
 * point of the second fit to the first's.
 */
export function taper(from: ChestFit, to: ChestFit) {
  const knots = (fit: ChestFit) => [fit.waist.y, fit.chest.y, fit.neck.y];
  const [source, target] = [knots(from), knots(to)];
  /** A height in one fit at the same place between the bands in the other, past the ends along the end lengths. */
  const along = (y: number, a: number[], b: number[]) => {
    const k = y <= a[1] ? 0 : 1;
    return b[k] + ((y - a[k]) * (b[k + 1] - b[k])) / (a[k + 1] - a[k]);
  };
  const at = (y: number) => {
    const moved = along(y, source, target);
    const k = y <= source[1] ? 0 : 1;
    const [was, now] = [bandAt(from, y), bandAt(to, moved)];
    const [a, b] = [middleOf(was), middleOf(now)];
    return { y: moved, x: now.halfWidth / was.halfWidth, z: b.depth / a.depth, tall: (target[k + 1] - target[k]) / (source[k + 1] - source[k]), from: a.centre, to: b.centre };
  };
  const warp = (x: number, y: number, z: number): Vec3 => {
    const here = at(y);
    return [x * here.x, here.y, here.to + (z - here.from) * here.z];
  };
  const back = (x: number, y: number, z: number): Vec3 => {
    const was = along(y, target, source);
    const here = at(was);
    return [x / here.x, was, here.from + (z - here.to) / here.z];
  };
  return { at, warp, back };
}

/**
 * A chest piece sculpted at one fit, stretched to another (`taper`). Its
 * normals turn with the stretch, and its solid stretches too, so the
 * clipping check asks the shape as worn.
 */
export function taperedTo(geometry: THREE.BufferGeometry, from: ChestFit, to: ChestFit): THREE.BufferGeometry {
  const { at, warp, back } = taper(from, to);
  const solid = solidOf(geometry);
  if (!solid) throw new Error("A chest piece to stretch has no solid");
  const fitted = geometry.clone();
  const position = fitted.getAttribute("position");
  const normal = fitted.getAttribute("normal");
  const turned = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const here = at(position.getY(i));
    position.setXYZ(i, ...warp(position.getX(i), position.getY(i), position.getZ(i)));
    turned.set(normal.getX(i) / here.x, normal.getY(i) / here.tall, normal.getZ(i) / here.z).normalize();
    normal.setXYZ(i, turned.x, turned.y, turned.z);
  }
  fitted.computeBoundingBox();
  fitted.computeBoundingSphere();
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => warp(k & 1 ? solid.max[0] : solid.min[0], k & 2 ? solid.max[1] : solid.min[1], k & 4 ? solid.max[2] : solid.min[2]));
  const lowest = (axis: number) => Math.min(...corners.map((corner) => corner[axis])) - 0.005;
  const highest = (axis: number) => Math.max(...corners.map((corner) => corner[axis])) + 0.005;
  return shaped(fitted, {
    distance: (x, y, z) => {
      const point = back(x, y, z);
      const here = at(point[1]);
      return solid.distance(...point) * Math.min(here.x, here.z, here.tall);
    },
    min: [lowest(0), lowest(1), lowest(2)],
    max: [highest(0), highest(1), highest(2)],
  });
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
export function carrying(build: ExplorerBuilder, item: HeldModel): ExplorerBuilder {
  const carried: ExplorerBuilder = (seed, gait) => {
    const figure = build(seed, gait);
    const hands = handsOf(figure);
    if (!hands) throw new Error("A figure without hands can't carry an item");
    holdIn(hands.right, item.held());
    return figure;
  };
  return declareParts(carried, [...partsOf(build), ...item.parts]);
}

/** A figure built wearing a worn item. */
export function wearing(build: ExplorerBuilder, item: WornModel): ExplorerBuilder {
  const dressed: ExplorerBuilder = (seed, gait) => {
    const figure = build(seed, gait);
    wear(figure, item);
    return figure;
  };
  return declareParts(dressed, [...partsOf(build), ...item.parts]);
}
