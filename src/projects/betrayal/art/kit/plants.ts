import * as THREE from "three";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import type { PaletteKey } from "../palette";
import { batch, cylinder, flat, group, type Batch } from "../shapes";
import { vessel, solidLathe } from "./vessel";

/**
 * Plants, built from strips: a frond is a stalk of thin boxes along a curve,
 * with leaflets either side, all in one batch. A plant's `leaf` colours run
 * from its stalks to its palest leaflets; `LEAVES` holds a living plant's and
 * a withered one's. `droop` is how far a frond falls along its length (0
 * arches up and out, 1 hangs), and `wither` thins and shortens the leaflets
 * and breaks some fronds off short.
 */
export const LEAVES = {
  living: ["wraithDark", "wraith", "verdigris"],
  withered: ["woodMid", "woodLight", "woodLight", "boneDark"],
} as const satisfies Record<string, readonly PaletteKey[]>;

export interface FrondOptions {
  /** Metres from base to tip, measured along the stalk. */
  length: number;
  /** How the stalk rises at its base, in degrees above level. */
  rise: number;
  /** How far it falls over its length: 0 arches out, 1 hangs. */
  droop: number;
  /** Leaflet length at the middle of the frond, in metres. */
  leaflet: number;
  leaf: readonly PaletteKey[];
  /** 0 a living frond, 1 a dead one: leaflets fewer, shorter and hanging. */
  wither: number;
  /** How broad a leaflet is, in metres. */
  blade: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A thin strip from `a` to `b`, `width` wide across `side` and `thickness` thick. */
function strip(b: Batch, from: THREE.Vector3, to: THREE.Vector3, side: THREE.Vector3, width: number, thickness: number, tint: PaletteKey) {
  const along = to.clone().sub(from);
  const length = along.length();
  if (length < 1e-4) return;
  const z = along.divideScalar(length);
  const x = side.clone().sub(z.clone().multiplyScalar(side.dot(z))).normalize();
  const y = z.clone().cross(x);
  const matrix = new THREE.Matrix4().makeBasis(x, y, z).setPosition(from.clone().add(to).multiplyScalar(0.5));
  b.add([width, thickness, length], tint, matrix);
}

/** One frond from `base`, heading out along `heading` (a level unit vector), into the batch. */
function frond(b: Batch, rng: Rng, base: THREE.Vector3, heading: THREE.Vector3, options: FrondOptions) {
  const { length, rise, droop, leaflet, leaf, wither } = options;
  const segments = 7;
  const broken = wither > 0 && rng.next() < wither * 0.3 ? 0.45 + rng.next() * 0.3 : 1;
  const side = UP.clone().cross(heading).normalize();
  const climb = Math.tan(THREE.MathUtils.degToRad(rise));
  const point = (t: number) => {
    const out = length * t * Math.cos(Math.atan(climb * (1 - t)));
    const up = length * (climb * t * (1 - t / 2) * 0.7 - droop * t * t * 1.1);
    return base.clone().addScaledVector(heading, out).addScaledVector(UP, up);
  };
  const stalk = leaf[0];
  const blades = leaf.slice(1);
  for (let i = 0; i < segments * broken; i++) {
    const [t0, t1] = [i / segments, Math.min((i + 1) / segments, broken)];
    const [a, c] = [point(t0), point(t1)];
    // Each stalk segment is a few millimetres finer than the last, so where they meet at a bend their faces never lie in one plane.
    strip(b, a, c, side, 0.03 - i * 0.003, 0.02 - i * 0.0022, stalk);
    if (i === 0) continue;
    const reach = leaflet * Math.sin(Math.PI * Math.min(1, t0 + 0.1)) * (1 - wither * 0.35);
    for (const s of [-1, 1]) {
      if (rng.next() < wither * 0.35) continue;
      const hang = 0.25 + wither * 0.9 + droop * 0.3 + rng.next() * 0.15;
      const tip = a.clone().addScaledVector(side, s * reach * Math.cos(hang)).addScaledVector(UP, -reach * Math.sin(hang)).addScaledVector(c.clone().sub(a).normalize(), reach * 0.35);
      strip(b, a, tip, c.clone().sub(a), options.blade * (1 - wither * 0.3), 0.008, blades[Math.floor(rng.next() * blades.length)]);
    }
  }
}

export interface RosetteOptions extends FrondOptions {
  /** How many fronds spring from the crown. */
  fronds: number;
  seed: string;
}

/** A rosette of fronds springing from one crown at the origin: a fern, or a palm's head. */
export function rosette(options: RosetteOptions): THREE.Mesh {
  const rng = createRng(`plant:${options.seed}`);
  const b = batch();
  const turn = rng.next() * Math.PI * 2;
  for (let i = 0; i < options.fronds; i++) {
    const angle = turn + (i / options.fronds) * Math.PI * 2 + (rng.next() - 0.5) * 0.25;
    const heading = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const vary = 0.8 + rng.next() * 0.35;
    // Each frond springs a little higher than the last, so no two stalks lie in one plane where they meet at the crown.
    frond(b, rng, new THREE.Vector3(0, i * 0.004, 0), heading, {
      ...options,
      length: options.length * vary,
      rise: options.rise + (rng.next() - 0.5) * 20,
      droop: Math.min(1.2, options.droop * (0.8 + rng.next() * 0.5)),
    });
  }
  return b.mesh();
}

export interface PalmOptions {
  /** Height of the crown above the pot's soil. */
  height: number;
  fronds: number;
  leaf: readonly PaletteKey[];
  wither: number;
  seed: string;
}

/**
 * A palm: a ringed trunk leaning a little, and a head of long fronds. A
 * withered one wears a skirt of dead fronds hanging down its trunk. Base at
 * the origin, which is the soil it grows from.
 */
export function palm({ height, fronds, leaf, wither, seed }: PalmOptions): THREE.Group {
  const rng = createRng(`palm:${seed}`);
  const bark = flat("woodDark");
  const scar = flat("wood");
  const trunk = group();
  const rings = Math.round(height / 0.16);
  const lean = (rng.next() - 0.5) * 0.15;
  for (let i = 0; i < rings; i++) {
    const t = i / rings;
    const ring = cylinder(0.075 - t * 0.02, height / rings + 0.01, i % 2 ? bark : scar, [lean * t * height, (i * height) / rings, 0], { top: 0.07 - t * 0.02, sides: 7 });
    ring.rotation.y = i * 0.4;
    trunk.add(ring);
  }
  const crown = new THREE.Vector3(lean * height, height, 0);
  const head = rosette({ fronds, length: height * 0.62, rise: 40, droop: 0.35 + wither * 0.5, leaflet: 0.3, blade: 0.07, leaf, wither, seed });
  head.position.copy(crown);
  trunk.add(head);
  if (wither > 0) {
    const skirt = rosette({ fronds: Math.round(fronds * 0.8), length: height * 0.45, rise: -10, droop: 1.1, leaflet: 0.2, blade: 0.07, leaf: LEAVES.withered, wither: 1, seed: `${seed}-skirt` });
    skirt.position.copy(crown).add(new THREE.Vector3(0, -0.05, 0));
    trunk.add(skirt);
  }
  return trunk;
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
