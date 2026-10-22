import * as THREE from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { figureMaterial, form, loft, type Section, type Vec3 } from "../forms";
import type { PaletteKey } from "../palette";
import { flat, group } from "../shapes";
import { solidLathe, vessel } from "./vessel";

/**
 * Plants, built as a few broad, smooth leaves rather than many small parts:
 * each leaf a flat ribbon lofted along an arc that rises from the crown and
 * sags under its own weight, smooth-shaded and coloured along its length,
 * so a plant reads by its silhouette at house distance. Matte: no plant
 * shines.
 *
 * A plant's `leaf` colours run from the base of a leaf, through its body
 * (one of the middle keys, picked per leaf), to its tip. `LEAVES` holds a
 * living plant's greens and a withered one's dry straw, dusty tan and grey,
 * a little dull green left at the base.
 */
export const LEAVES = {
  living: ["wraithDark", "wraith", "wraith", "verdigris"],
  withered: ["wraithDark", "brass", "boneDark", "brass", "stoneDark"],
} as const satisfies Record<string, readonly PaletteKey[]>;

export interface LeafOptions {
  /** Metres from base to tip, along the leaf. */
  length: number;
  /** Its greatest breadth. */
  width: number;
  /** How steeply it rises from the crown, in degrees above level. */
  rise: number;
  /** How far it bends over along its length: 0 stays straight, 1 curls right over to hang. */
  droop: number;
  leaf: readonly PaletteKey[];
  /** 0 a living leaf, 1 a dead one: narrower, more bowed and paler. */
  wither: number;
}

const SECTIONS = 14;

/**
 * A loft turned right side out. `loft` winds its triangles to face into the
 * tube (its own "faces outwards" test has no vertex in the stretch it checks,
 * so it never sees it), which a figure, lit by probes, doesn't show, but a
 * still piece does: the bake takes each face's outside from its winding, so
 * an inward leaf lifts its rays into itself and lies in its own shadow.
 */
function outward(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of ["position", "normal", "color"]) {
    const attribute = geometry.getAttribute(name);
    for (let t = 0; t < attribute.count; t += 3) {
      for (let k = 0; k < attribute.itemSize; k++) {
        const second = attribute.getComponent(t + 1, k);
        attribute.setComponent(t + 1, k, attribute.getComponent(t + 2, k));
        attribute.setComponent(t + 2, k, second);
      }
    }
  }
  const normal = geometry.getAttribute("normal");
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  return geometry;
}
const THICKNESS = 0.006;
const UP = new THREE.Vector3(0, 1, 0);

/** One leaf from `base`, heading out along `heading` (a level unit vector): a flat ribbon on a sagging arc. */
function leafGeometry(rng: Rng, base: THREE.Vector3, heading: THREE.Vector3, options: LeafOptions): THREE.BufferGeometry {
  const { length, width, rise, droop, leaf, wither } = options;
  const limp = rng.next() < wither * 0.3 ? 0.35 : 0;
  const bend = (droop + wither * 0.2 + limp) * Math.PI * 0.95;
  const body = leaf.slice(1, -1);
  const colour = body[Math.floor(rng.next() * body.length)];
  const side = UP.clone().cross(heading).normalize();
  const step = length / SECTIONS;
  const sections: Section[] = [];
  const at = base.clone();
  for (let i = 0; i <= SECTIONS; i++) {
    const t = i / SECTIONS;
    const breadth = width * (1 - wither * 0.25) * Math.pow(Math.sin(Math.PI * (0.1 + 0.82 * t)), 0.7);
    const key = t < 0.12 ? leaf[0] : t > 0.82 ? leaf[leaf.length - 1] : colour;
    sections.push({ at: [at.x, at.y, at.z] as Vec3, radius: [breadth / 2, THICKNESS], colour: key });
    // The leaf bows more towards its tip, where its weight hangs.
    const angle = THREE.MathUtils.degToRad(rise) - bend * Math.pow(t, 1.4);
    at.addScaledVector(heading, Math.cos(angle) * step).addScaledVector(UP, Math.sin(angle) * step);
  }
  return outward(loft(sections, { sides: 8, side: [side.x, side.y, side.z], ends: ["round", "point"] }));
}

export interface RosetteOptions extends LeafOptions {
  /** How many leaves spring from the crown. */
  fronds: number;
  seed: string;
}

/** A rosette of leaves springing from one crown at the origin: a fern, a tuft of seedlings, or a palm's head. */
export function rosette(options: RosetteOptions): THREE.Mesh {
  return form(figureMaterial(), ...rosetteLeaves(options, new THREE.Vector3()));
}

function rosetteLeaves(options: RosetteOptions, crown: THREE.Vector3): THREE.BufferGeometry[] {
  const rng = createRng(`plant:${options.seed}`);
  const turn = rng.next() * Math.PI * 2;
  return Array.from({ length: options.fronds }, (_, i) => {
    const angle = turn + (i / options.fronds) * Math.PI * 2 + (rng.next() - 0.5) * 0.4;
    const heading = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    // Each leaf springs a little higher than the last, so no two lie in one plane where they meet.
    const base = crown.clone().add(new THREE.Vector3(heading.x * 0.01, i * 0.004, heading.z * 0.01));
    return leafGeometry(rng, base, heading, {
      ...options,
      length: options.length * (0.8 + rng.next() * 0.35),
      rise: options.rise + (rng.next() - 0.5) * 20,
      droop: options.droop * (0.85 + rng.next() * 0.3),
    });
  });
}

export interface PalmOptions {
  /** Height of the crown above the pot's soil. */
  height: number;
  /** How many long leaves hang from the crown. */
  fronds: number;
  leaf: readonly PaletteKey[];
  wither: number;
  seed: string;
}

/**
 * A palm: a smooth trunk, ringed in two browns and leaning a little, and a
 * head of a few long leaves arching out and hanging down. A withered one
 * also wears a skirt of dead leaves hanging straight down its trunk. Base
 * at the origin, which is the soil it grows from.
 */
export function palm({ height, fronds, leaf, wither, seed }: PalmOptions): THREE.Mesh {
  const rng = createRng(`palm:${seed}`);
  const lean = (rng.next() - 0.5) * 0.15;
  const rings = 10;
  const trunk: Section[] = Array.from({ length: rings + 1 }, (_, i) => {
    const t = i / rings;
    return { at: [lean * height * t * t, height * t, 0] as Vec3, radius: 0.075 - t * 0.025, colour: i % 2 ? "woodDark" : "wood" };
  });
  const crown = new THREE.Vector3(lean * height, height, 0);
  const head = rosetteLeaves({ fronds, length: height * 0.75, width: 0.15, rise: 50, droop: 0.5 + wither * 0.25, leaf, wither, seed }, crown);
  const skirt =
    wither > 0
      ? rosetteLeaves({ fronds: Math.max(3, Math.round(fronds * 0.6)), length: height * 0.4, width: 0.11, rise: -55, droop: 0.12, leaf: LEAVES.withered, wither: 1, seed: `${seed}-skirt` }, crown.clone().add(new THREE.Vector3(0, -0.06, 0)))
      : [];
  return form(figureMaterial(), outward(loft(trunk, { sides: 10, ends: ["flat", "round"] })), ...head, ...skirt);
}

export interface PotOptions {
  /** Radius at the rim. */
  radius: number;
  height: number;
  /** Its clay or glaze. */
  material?: THREE.Material;
  /** The soil showing inside, just below the rim. */
  soil?: PaletteKey;
}

/** A flowerpot, tapering to its foot, with a rolled rim and its soil. Base at the origin; `soilTop` is where a plant stands in it. */
export function flowerPot({ radius, height, material = flat("brickLight"), soil = "soot" }: PotOptions): { pot: THREE.Group; soilTop: number } {
  const foot = radius * 0.7;
  const body = vessel(
    [
      [foot, 0],
      [radius * 0.92, height * 0.82],
      [radius, height * 0.84],
      [radius, height],
    ],
    material,
    { wall: Math.max(0.008, radius * 0.08), depth: height * 0.85, sides: 12 },
  );
  const soilTop = height - Math.min(0.03, height * 0.12);
  const earth = solidLathe([[radius * 0.9, soilTop - 0.02], [radius * 0.9, soilTop]], flat(soil), 12);
  return { pot: group(body, earth), soilTop };
}
