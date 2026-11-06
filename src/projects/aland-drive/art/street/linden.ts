import type { Node, Vector3 } from "three/webgpu";
import { float, mix, select, varying, vec3 } from "three/tsl";
import { placeSeed, unitOf } from "../hash";
import { BARE_SPREAD, FRESH_SHARE, leavesOf } from "../leaves";
import type { SeasonNodes } from "../season";
import { seeded, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { Painted, STREET_PARTS, streetModel, type StreetPart } from "./paint";

/*
 * A planted linden one unit tall, to be scaled by the tree's height, like the
 * roadside pine. A clean stem to a lifted crown, as an esplanade keeps them, under
 * one full egg-shaped crown: an icosphere pushed out by a few lobes, its facets lit
 * by height so the top is bright and the skirt is dark. The far version is the same
 * crown at a coarser sphere, so the shape doesn't change at the swap. Each seed is a
 * crown of its own, its lobes and its width, so a row of a few seeds isn't one tree
 * repeated. It holds still, as the forest's trees do.
 */

const SINK = -0.04;
/** The crown in shares of the tree's height. */
const CROWN_LOW = 0.26;
const CROWN_HIGH = 1;
const CROWN_WIDE = 0.34;
/** How much one seed's crown is wider or narrower than another's, as a share of the width. */
const CROWN_WIDE_SPREAD = 0.28;
const STEM_TOP = 0.42;
const LOBES = 7;
const LOBE_DEPTH = 0.13;

type Triangle = [V3, V3, V3];

const ICOSAHEDRON_T = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON: V3[] = [[-1, ICOSAHEDRON_T, 0], [1, ICOSAHEDRON_T, 0], [-1, -ICOSAHEDRON_T, 0], [1, -ICOSAHEDRON_T, 0], [0, -1, ICOSAHEDRON_T], [0, 1, ICOSAHEDRON_T], [0, -1, -ICOSAHEDRON_T], [0, 1, -ICOSAHEDRON_T], [ICOSAHEDRON_T, 0, -1], [ICOSAHEDRON_T, 0, 1], [-ICOSAHEDRON_T, 0, -1], [-ICOSAHEDRON_T, 0, 1]];
const FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

const unit = ([x, y, z]: V3): V3 => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};
const middle = (a: V3, b: V3) => unit([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);

/** A unit sphere of 20 × 4^splits triangles, on the same points at every level it shares. */
function icosphere(splits: number): Triangle[] {
  let triangles = FACES.map(([a, b, c]): Triangle => [unit(ICOSAHEDRON[a]), unit(ICOSAHEDRON[b]), unit(ICOSAHEDRON[c])]);
  for (let split = 0; split < splits; split++) {
    triangles = triangles.flatMap(([a, b, c]): Triangle[] => {
      const [ab, bc, ca] = [middle(a, b), middle(b, c), middle(c, a)];
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return triangles;
}

interface Lobe {
  way: V3;
  wide: number;
}

/** A sphere's point on the crown: egg-shaped, widest low, pushed out by the lobes, `wide` the crown's share of its height across. */
function onCrown(point: V3, lobes: readonly Lobe[], wide: number): V3 {
  const bulge = lobes.reduce((sum, { way, wide }) => {
    const nearness = Math.max(0, point[0] * way[0] + point[1] * way[1] + point[2] * way[2]);
    return sum + nearness ** wide;
  }, 0);
  const out = 1 + LOBE_DEPTH * (bulge - 0.55);
  const up = (point[1] + 1) / 2;
  // Narrower to the top than the skirt, with the widest part a third of the way up.
  const taper = 1 - 0.34 * Math.max(0, up - 0.34) ** 1.3;
  const height = CROWN_LOW + (CROWN_HIGH - CROWN_LOW) * up;
  const reach = wide * out * taper;
  return [point[0] * reach, height + (out - 1) * 0.08 * point[1], point[2] * reach];
}

function crown(into: Painted, splits: number, lobes: readonly Lobe[], wide: number, random: () => number): Painted {
  for (const triangle of icosphere(splits)) {
    const centre = (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3;
    const up = (centre + 1) / 2;
    // A loose edge between the crown's greens, or it's a clean line round the tree.
    const dappled = up + (random() - 0.5) * 0.26;
    const part: StreetPart = dappled < 0.3 ? "linden-leaf-under" : dappled > 0.58 ? "linden-leaf-lit" : "linden-leaf";
    const shade = (0.8 + up * 0.36) * (0.9 + random() * 0.2);
    into.face(triangle.map((point) => onCrown(point, lobes, wide)), part, shade);
  }
  return into;
}

const NEAR_SPLITS = 2;
const FAR_SPLITS = 1;
const LINDEN_SWAP_M = 130;
const LINDEN_REACH_M = 1200;

/** The crowns the game places, by seed: `linden-<seed>` in the roadside's lists (`pipeline/dressing.py` holds the same). */
export const LINDEN_SEEDS = [3, 8, 14] as const;

export function buildLinden(seed = 3): RoadsideModel {
  const random = seeded(seed);
  const lobes = Array.from({ length: LOBES }, (): Lobe => ({ way: unit([random() - 0.5, (random() - 0.5) * 1.4, random() - 0.5]), wide: 2 + random() * 3 }));
  const wide = CROWN_WIDE * (1 + (random() - 0.5) * CROWN_WIDE_SPREAD);
  const near = new Painted()
    .tube([0, SINK, 0], [0, 0.05, 0], 0.036, 6, { radiusTo: 0.024, shadeFrom: 0.8, shadeTo: 0.95 }, "bark")
    .tube([0, 0.05, 0], [0.004, 0.24, 0.002], 0.024, 6, { radiusTo: 0.019, shadeFrom: 0.95 }, "bark")
    .tube([0.004, 0.24, 0.002], [0, STEM_TOP, 0], 0.019, 5, { radiusTo: 0.011 }, "bark-limb");
  for (let limb = 0; limb < 4; limb++) {
    const turn = limb * 1.7 + random();
    near.spike([0.004, 0.225 + limb * 0.015, 0.002], [Math.cos(turn) * 0.17, 0.36, Math.sin(turn) * 0.17], 0.009, "bark-limb");
  }
  crown(near, NEAR_SPLITS, lobes, wide, random);
  const far = crown(new Painted().tube([0, SINK, 0], [0, 0.3, 0], 0.027, 3, { radiusTo: 0.02, shadeFrom: 0.9 }, "bark"), FAR_SPLITS, lobes, wide, random);
  return streetModel(near, far, LINDEN_SWAP_M, LINDEN_REACH_M);
}

/*
 * A linden through the year (`art/leaves.ts`): yellow in early to mid October, then bare to a narrower, see-through
 * crown of twigs, each tree on a threshold rolled from its place, so an avenue turns tree by tree. Only the linden's
 * own leaves (the last of the street's paints) change, so nothing else the street's material draws does.
 */
const FIRST_LINDEN_LEAF = STREET_PARTS.indexOf("linden-leaf");
const LINDEN_ROLL = 51;
const LINDEN_GOES: [number, number] = [0.05, 0.75];
/** The share of a bare crown's pixels left open, so it reads as twigs rather than a solid mass. */
const BARE_OPEN = 0.5;

export interface LindenYear {
  /** How far a vertex spreads from the trunk, against its summer self. */
  spread: Node<"float">;
  /** A vertex's paint as the season has it, from its summer paint. */
  paint: (summer: Node<"vec3">) => Node<"vec3">;
  /** The share of the pixels left open. */
  open: Node<"float">;
}

/** A vertex of a part, at a place, in its paint's shade, through the year. */
export function lindenThroughYear(season: SeasonNodes, place: Node<"vec2">, part: Node<"float">, shade: Node<"float">, linear: (name: string) => Vector3): LindenYear {
  const isLeaf = select(part.greaterThanEqual(FIRST_LINDEN_LEAF), float(1), float(0));
  const leaves = leavesOf(season, mix(float(LINDEN_GOES[0]), float(LINDEN_GOES[1]), unitOf(placeSeed(place), LINDEN_ROLL)));
  const bare = float(1).sub(leaves.inLeaf).mul(isLeaf);
  // Worked out where the place is exact, and handed on whole, so no pixel rolls its own tree.
  const state = varying(vec3(bare, leaves.turned.mul(isLeaf), leaves.fresh.mul(FRESH_SHARE).mul(isLeaf)));
  const token = (name: string) => vec3(linear(name)).mul(shade);
  return {
    spread: mix(float(1), float(BARE_SPREAD), bare),
    paint: (summer) => mix(mix(mix(summer, token("tree-fresh"), state.z), token("autumn-linden"), state.y), token("tree-twig"), state.x),
    open: state.x.mul(BARE_OPEN),
  };
}
