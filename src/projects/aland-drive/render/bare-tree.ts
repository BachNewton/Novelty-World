import { NEAR_RINGS, SWELL, shapeRows, STAGES, TREE_KINDS, type TreeKind } from "./tree-shapes";

/*
 * A broadleaf without its leaves, as numbers: a trunk forking into limbs and branches, and the clumps of leaves those
 * carry while it has some, for the forest's branch and clump lists (`forest.ts`). A bare tree is a different object
 * from a leafy crown, so it is a model of its own, not the crown narrowed or see-through.
 *
 * Each of the three broadleaf shapes (birch, round, upright) is one set of vertices on one shared list of triangles, so
 * one draw serves all three: the shader picks a tree's own set by its kind. A point is laid in the crown's own terms,
 * how far up its rings and what share of the crown's width there, so the same branches fit any stage of life the
 * outline table gives (`tree-shapes.ts`), a young birch's low crown as an old one's high one; a branch's thickness is
 * a share of the tree's height on top of that, so a limb isn't squeezed thin where the crown narrows.
 *
 * The first ring pair of every tree is the leafy model's own trunk, point for point, so a tree going from its crown
 * to its branches keeps the trunk it stood on.
 *
 * Clumps sit on the branches within the crown's outline, each a blob in the crown's terms. As a tree's leaves start to
 * fall they grow out of its leafy crown while that shrinks away inside them, so the crown breaks up into clumps with
 * no jump; then they shrink away one by one, each on its own share of the tree's leaves, and the branches show through.
 */

export const BARE_KINDS = ["birch", "round", "upright"] as const satisfies readonly TreeKind[];
export type BareKind = (typeof BARE_KINDS)[number];
/** The first broadleaf in the forest's kinds: a bare kind's set is its kind less this. */
export const FIRST_BARE_KIND = TREE_KINDS.indexOf("birch");

/** What a branch vertex is, for its colour: the leafy model's trunk, wood, or a twig. */
export const PART_TRUNK = 0;
export const PART_WOOD = 1;
export const PART_TWIG = 2;

/** A vertex is two rows of four floats: (across, ring, across, part or a clump's own share) and (offset as a share of the tree's height, then how thin; or a clump's middle). */
export const ROWS_A_VERTEX = 2;

const TRUNK_SIDES = 5;
const WOOD_SIDES = 4;
const BRANCH_SIDES = 3;
/** No clump reaches further out than this share of the crown's width, a little past the leafy crown's own outline: clumps grow out of it while it shrinks, so none shows at once. */
const CLUMP_REACH = 1.1;
const LIMBS = 9;
const TWIGS_A_LIMB = 5;
/** A clump is a squashed octahedron, each corner pushed in or out its own way, and each clump this much bigger or smaller than its kind's. */
const CLUMP_SIDES = 4;
const CLUMP_UNEVEN = 0.3;
const CLUMP_SIZES: [number, number] = [0.7, 1.25];

interface Spec {
  /** The leader up the middle: ring, then its radius as a share of height. */
  leader: [ring: number, radius: number][];
  /** Where the limbs leave the leader, lowest and highest ring. */
  limbsFrom: [number, number];
  /** A limb's elbow and tip: (share of the crown's width, rings up from where it starts), and its radius at base and elbow. */
  elbow: [number, number];
  tip: [number, number];
  limbRadius: [number, number];
  /** A twig leaves its limb this far along each of its two lengths, and ends this much further out and this many rings up (down if below 0), turned this far from its limb. */
  twigAt: [number, number, number, number, number];
  twigTo: [out: number, up: number];
  twigTurn: number;
  twigRadius: number;
  /** A clump's half width as a share of the crown's, and half height in rings: rings stand closer in a round crown, so its clumps take more of them to be as round. */
  clump: [number, number];
}

/** Read against photos of bare Nordic trees: a birch's leader runs to the top with limbs climbing off it and fine twigs hanging; an oak forks low into a few spreading limbs; an aspen or alder keeps a leader and short steep limbs. */
const SPECS: Record<BareKind, Spec> = {
  birch: {
    leader: [[1, 0], [3, 0.0075], [5.5, 0.0045], [7.9, 0]],
    limbsFrom: [2.1, 6.4],
    elbow: [0.5, 0.55],
    tip: [0.92, 0.75],
    limbRadius: [0.0042, 0.0026],
    twigAt: [0.3, 0.5, 0.7, 0.85, 1],
    twigTo: [0.12, -0.9],
    twigTurn: 0.45,
    twigRadius: 0.0016,
    clump: [0.44, 0.4],
  },
  round: {
    leader: [[1, 0], [2.1, 0.012], [4.4, 0.006], [7, 0]],
    limbsFrom: [1.9, 3.8],
    elbow: [0.5, 1.2],
    tip: [0.82, 2.4],
    limbRadius: [0.0085, 0.0055],
    twigAt: [0.35, 0.55, 0.7, 0.85, 1],
    twigTo: [0.12, 0.7],
    twigTurn: 0.6,
    twigRadius: 0.0025,
    clump: [0.42, 0.55],
  },
  upright: {
    leader: [[1, 0], [3, 0.0075], [5.5, 0.0045], [7.9, 0]],
    limbsFrom: [2.2, 6.4],
    elbow: [0.42, 0.75],
    tip: [0.82, 1.3],
    limbRadius: [0.0042, 0.0028],
    twigAt: [0.3, 0.5, 0.7, 0.85, 1],
    twigTo: [0.12, 0.6],
    twigTurn: 0.5,
    twigRadius: 0.0018,
    clump: [0.44, 0.42],
  },
};

type Vec3 = [number, number, number];
/** A point in the crown's terms: (across as a share of the width, ring, across). */
type CrownPoint = Vec3;

interface Built {
  rows: number[];
  indices: number[];
}

/** The grown stage's outline of a kind, to turn a crown point into a share of height when laying a branch's sides square to it. */
function grownOutline(kind: BareKind) {
  const rings = shapeRows()[TREE_KINDS.indexOf(kind) * STAGES + 1];
  return (point: CrownPoint): Vec3 => {
    const at = Math.min(Math.max(Math.floor(point[1]), 0), NEAR_RINGS - 2);
    const t = point[1] - at;
    const up = rings[at][0] + (rings[at + 1][0] - rings[at][0]) * t;
    const wide = rings[at][1] + (rings[at + 1][1] - rings[at][1]) * t;
    return [point[0] * wide, up, point[2] * wide];
  };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};
const scaled = (a: Vec3, by: number): Vec3 => [a[0] * by, a[1] * by, a[2] * by];

/** A point in the crown this share of the width out the way `angle` points, at a ring. */
const outAt = (angle: number, share: number, ring: number): CrownPoint => [Math.sin(angle) * share, ring, Math.cos(angle) * share];

function branchesOf(kind: BareKind): Built {
  const spec = SPECS[kind];
  const toUnits = grownOutline(kind);
  const rows: number[] = [];
  const indices: number[] = [];
  const vertex = (point: CrownPoint, part: number, offset: Vec3, thin: number) => {
    rows.push(point[0], point[1], point[2], part, offset[0], offset[1], offset[2], thin);
    return rows.length / (ROWS_A_VERTEX * 4) - 1;
  };
  const joinRings = (lower: number[], upper: number[]) => {
    for (let side = 0; side < lower.length; side++) {
      const next = (side + 1) % lower.length;
      if (upper.length === 1) indices.push(lower[side], lower[next], upper[0]);
      else indices.push(lower[side], lower[next], upper[side], upper[side], lower[next], upper[next]);
    }
  };

  // The leafy model's trunk, ring for ring as `forest.ts`'s `turned` lays it.
  const trunk = [0, 1].map((level) =>
    Array.from({ length: TRUNK_SIDES }, (_, side) => {
      const angle = (side + level * 0.37) * ((2 * Math.PI) / TRUNK_SIDES);
      const swell = 1 + SWELL * Math.sin(side * 2.4 + level * 1.7);
      return vertex([Math.sin(angle) * swell, level, Math.cos(angle) * swell], PART_TRUNK, [0, 0, 0], 0);
    }),
  );
  joinRings(trunk[0], trunk[1]);

  /** A run of sides along points of a branch, each with its radius as a share of height: a radius of 0 ends it in a point. Its sides stand square to the run as a whole. */
  const branch = (points: CrownPoint[], radii: number[], sides: number, part: number, thin: [number, number]) => {
    const way = unit(sub(toUnits(points[points.length - 1]), toUnits(points[0])));
    const across = unit(Math.abs(way[1]) > 0.9 ? cross(way, [1, 0, 0]) : cross(way, [0, 1, 0]));
    const over = cross(way, across);
    let lower: number[] = [];
    points.forEach((point, at) => {
      const share = at / (points.length - 1);
      const thinness = thin[0] + (thin[1] - thin[0]) * share;
      const ring =
        radii[at] === 0
          ? [vertex(point, part, scaled(way, 1e-4), thinness)]
          : Array.from({ length: sides }, (_, side) => {
              const angle = (side / sides) * 2 * Math.PI + at * 0.5;
              const offset: Vec3 = [0, 1, 2].map((axis) => (across[axis] * Math.cos(angle) + over[axis] * Math.sin(angle)) * radii[at]) as Vec3;
              return vertex(point, part, offset, thinness);
            });
      if (at > 0) joinRings(lower, ring);
      lower = ring;
    });
  };

  // The leader starts as wide as the trunk's top ring, in the crown's own terms, so the two meet whatever the tree's roll.
  const leaderBase = Array.from({ length: WOOD_SIDES }, (_, side) => {
    const angle = (side / WOOD_SIDES) * 2 * Math.PI;
    return vertex([Math.sin(angle) * 0.92, 1, Math.cos(angle) * 0.92], PART_WOOD, [0, 0, 0], 0);
  });
  const leaderRest = spec.leader.slice(1);
  const way: Vec3 = [0, 1, 0];
  let lower = leaderBase;
  leaderRest.forEach(([ring, radius], at) => {
    const thin = (at + 1) / leaderRest.length;
    const upper =
      radius === 0
        ? [vertex([0, ring, 0], PART_WOOD, scaled(way, 1e-4), thin)]
        : Array.from({ length: WOOD_SIDES }, (_, side) => {
            const angle = (side / WOOD_SIDES) * 2 * Math.PI + at * 0.4;
            return vertex([0, ring, 0], PART_WOOD, [Math.sin(angle) * radius, 0, Math.cos(angle) * radius], thin * 0.7);
          });
    joinRings(lower, upper);
    lower = upper;
  });

  for (const { start, elbow, tip, twigs } of skeletonOf(kind)) {
    branch([start, elbow, tip], [spec.limbRadius[0], spec.limbRadius[1], 0], BRANCH_SIDES, PART_WOOD, [0.15, 0.75]);
    for (const [base, end] of twigs) branch([base, end], [spec.twigRadius, 0], BRANCH_SIDES, PART_TWIG, [0.6, 1]);
  }
  return { rows, indices };
}

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

interface Limb {
  start: CrownPoint;
  elbow: CrownPoint;
  tip: CrownPoint;
  twigs: [base: CrownPoint, end: CrownPoint][];
}

/** A kind's limbs and twigs: the branches are drawn along them and the clumps sit at the twigs' ends. */
function skeletonOf(kind: BareKind): Limb[] {
  const spec = SPECS[kind];
  const goldenTurn = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: LIMBS }, (_, limb) => {
    const share = limb / (LIMBS - 1);
    const from = spec.limbsFrom[0] + (spec.limbsFrom[1] - spec.limbsFrom[0]) * share;
    const angle = limb * goldenTurn + Math.sin(limb * 3.1) * 0.3;
    // Higher limbs are shorter and steeper, as the crown narrows.
    const reach = 1 - share * 0.25;
    const start = outAt(angle, 0, from);
    const elbow = outAt(angle, spec.elbow[0] * reach, Math.min(from + spec.elbow[1], 7.6));
    const tip = outAt(angle, spec.tip[0] * reach, Math.min(from + spec.tip[1], 7.75));
    const twigs = spec.twigAt.map((along, twig): [CrownPoint, CrownPoint] => {
      const base: CrownPoint = along <= 0.5 ? lerp(start, elbow, along * 2) : lerp(elbow, tip, (along - 0.5) * 2);
      const turn = angle + (twig % 2 === 0 ? 1 : -1) * spec.twigTurn * (1 + twig * 0.15);
      const outShare = Math.min(Math.hypot(base[0], base[2]) + spec.twigTo[0], 0.95);
      const end = outAt(turn, outShare, Math.min(Math.max(base[1] + spec.twigTo[1] * (0.7 + (0.3 * twig) / TWIGS_A_LIMB), 2), 7.8));
      return [base, end];
    });
    return { start, elbow, tip, twigs };
  });
}

/** A roll from whole numbers, for a clump's own size and shape, the same every build. */
const rolled = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The clumps sit at the twigs' ends, out on the crown and never on the stem, each pulled in just far enough to stay
 * inside the leafy crown's outline. Together they fill that outline as a broken shell, and as they fall the gaps open.
 */
function clumpsOf(kind: BareKind): Built {
  const [halfWide, halfHigh] = SPECS[kind].clump;
  const rows: number[] = [];
  const indices: number[] = [];
  const ends = skeletonOf(kind).flatMap(({ twigs }) => twigs.map(([, end]) => end));
  ends.forEach((end, clump) => {
    // Each clump's share of the tree's leaves when it falls, spread evenly over a tree's clumps.
    const own = (clump * 0.6180339887) % 1;
    const size = CLUMP_SIZES[0] + (CLUMP_SIZES[1] - CLUMP_SIZES[0]) * rolled(clump, 1);
    const [wide, high] = [halfWide * size, halfHigh * size];
    const out = Math.hypot(end[0], end[2]);
    const pulled = Math.min(out, CLUMP_REACH - wide * (1 + CLUMP_UNEVEN)) / Math.max(out, 1e-6);
    const middle: CrownPoint = [end[0] * pulled, Math.min(Math.max(end[1], 2 + high), 7.9 - high * (1 + CLUMP_UNEVEN)), end[2] * pulled];
    const first = rows.length / (ROWS_A_VERTEX * 4);
    const push = (point: CrownPoint) => rows.push(point[0], point[1], point[2], own, middle[0], middle[1], middle[2], 0);
    const uneven = (salt: number) => 1 + CLUMP_UNEVEN * (rolled(clump, salt) * 2 - 1);
    push([middle[0], middle[1] + high * uneven(2), middle[2]]);
    const turn = rolled(clump, 3) * Math.PI;
    for (let side = 0; side < CLUMP_SIDES; side++) {
      const angle = turn + (side / CLUMP_SIDES) * 2 * Math.PI;
      const reach = wide * uneven(4 + side);
      push([middle[0] + Math.sin(angle) * reach, middle[1] + high * 0.25 * (rolled(clump, 9 + side) * 2 - 1), middle[2] + Math.cos(angle) * reach]);
    }
    push([middle[0], middle[1] - high * 0.6 * uneven(8), middle[2]]);
    const [top, ring, bottom] = [first, first + 1, first + 1 + CLUMP_SIDES];
    for (let side = 0; side < CLUMP_SIDES; side++) {
      const next = (side + 1) % CLUMP_SIDES;
      indices.push(top, ring + side, ring + next, ring + side, bottom, ring + next);
    }
  });
  return { rows, indices };
}

export interface BareModel {
  /** Every kind's vertices, kind after kind, `ROWS_A_VERTEX` vec4s each. */
  table: Float32Array;
  vertices: number;
  indices: number[];
}

/** The kinds' sets on one list of triangles, which must be the same list for all three. */
function joined(build: (kind: BareKind) => Built): BareModel {
  const built = BARE_KINDS.map(build);
  const [first] = built;
  for (const other of built) {
    if (other.indices.length !== first.indices.length || other.indices.some((index, at) => index !== first.indices[at])) throw new Error("Every bare kind must share one list of triangles.");
  }
  return { table: Float32Array.from(built.flatMap(({ rows }) => rows)), vertices: first.rows.length / (ROWS_A_VERTEX * 4), indices: first.indices };
}

export const BRANCHES = joined(branchesOf);
export const CLUMPS = joined(clumpsOf);

/** How far a crown point reaches across, as a share of the crown's width there, for the check that no clump pokes out of the leafy crown. */
export const clumpReach = (model: BareModel): number => {
  let most = 0;
  for (let at = 0; at < model.table.length; at += ROWS_A_VERTEX * 4) most = Math.max(most, Math.hypot(model.table[at], model.table[at + 2]));
  return most;
};

export { CLUMP_REACH };
