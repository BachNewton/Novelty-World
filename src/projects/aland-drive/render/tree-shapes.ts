/*
 * What Åland's trees look like, as numbers: an outline of nine rings for each kind of
 * tree at each stage of its life, read by the forest's vertex shader from one table.
 * Adding a shape adds a row here and no mesh or draw. `tree-place.ts` says where trees
 * stand; `forest.ts` says which of these each one is.
 *
 * MS-NFI knows pine, spruce and birch, and lumps the rest as other broadleaf, so that
 * share gets two general shapes rather than a shape for each species it can't place:
 * a round one for the oak, ash and maple of Åland's wooded meadows, and an upright one
 * for the alder, aspen and rowan through its woods.
 */

/** Rings 0 and 1 are trunk, the rest crown, and the last is the tip. */
type Rings = [up: number, wide: number][];

export const TRUNK_RINGS = 2;
export const NEAR_RINGS = 9;
export const FAR_RINGS = 3;
export const STAGES = 3;
/** A ring's unevenness at its widest. */
export const SWELL = 0.16;

export type TreeKind = "spruce" | "pine" | "birch" | "round" | "upright";
export const TREE_KINDS: TreeKind[] = ["spruce", "pine", "birch", "round", "upright"];

/** The young keep their branches to the ground, the grown clear their trunks, and the old carry a small crown high up. */
const STAGED: Record<TreeKind, [young: Rings, grown: Rings, old: Rings]> = {
  spruce: [
    [[0, 0.018], [0.03, 0.016], [0.04, 0.25], [0.3, 0.14], [0.32, 0.19], [0.55, 0.09], [0.57, 0.13], [0.8, 0.05], [1, 0]],
    [[0, 0.016], [0.1, 0.014], [0.11, 0.21], [0.34, 0.12], [0.36, 0.17], [0.58, 0.08], [0.6, 0.12], [0.8, 0.04], [1, 0]],
    [[0, 0.016], [0.2, 0.013], [0.21, 0.16], [0.42, 0.09], [0.44, 0.13], [0.63, 0.06], [0.65, 0.095], [0.84, 0.03], [1, 0]],
  ],
  pine: [
    [[0, 0.02], [0.05, 0.018], [0.06, 0.17], [0.22, 0.2], [0.3, 0.14], [0.48, 0.16], [0.56, 0.1], [0.8, 0.05], [1, 0]],
    [[0, 0.016], [0.36, 0.012], [0.38, 0.11], [0.5, 0.17], [0.63, 0.16], [0.75, 0.16], [0.86, 0.13], [0.95, 0.06], [1, 0]],
    [[0, 0.016], [0.6, 0.011], [0.62, 0.1], [0.7, 0.17], [0.78, 0.18], [0.86, 0.17], [0.93, 0.13], [0.98, 0.06], [1, 0]],
  ],
  birch: [
    [[0, 0.012], [0.12, 0.01], [0.13, 0.09], [0.3, 0.13], [0.5, 0.14], [0.7, 0.11], [0.84, 0.07], [0.94, 0.03], [1, 0]],
    [[0, 0.014], [0.3, 0.01], [0.31, 0.1], [0.46, 0.15], [0.62, 0.16], [0.76, 0.13], [0.88, 0.08], [0.96, 0.03], [1, 0]],
    [[0, 0.016], [0.42, 0.011], [0.43, 0.11], [0.56, 0.16], [0.7, 0.16], [0.82, 0.12], [0.91, 0.07], [0.97, 0.03], [1, 0]],
  ],
  round: [
    [[0, 0.016], [0.16, 0.013], [0.17, 0.12], [0.3, 0.19], [0.48, 0.21], [0.66, 0.18], [0.82, 0.13], [0.93, 0.06], [1, 0]],
    [[0, 0.022], [0.24, 0.017], [0.25, 0.15], [0.36, 0.22], [0.52, 0.24], [0.68, 0.21], [0.83, 0.15], [0.95, 0.07], [1, 0]],
    [[0, 0.028], [0.28, 0.02], [0.29, 0.17], [0.4, 0.24], [0.56, 0.26], [0.72, 0.23], [0.85, 0.16], [0.95, 0.07], [1, 0]],
  ],
  upright: [
    [[0, 0.012], [0.14, 0.01], [0.15, 0.07], [0.32, 0.11], [0.5, 0.12], [0.68, 0.1], [0.84, 0.06], [0.94, 0.03], [1, 0]],
    [[0, 0.014], [0.26, 0.011], [0.27, 0.08], [0.42, 0.13], [0.57, 0.14], [0.72, 0.12], [0.85, 0.08], [0.95, 0.03], [1, 0]],
    [[0, 0.018], [0.36, 0.013], [0.37, 0.09], [0.5, 0.14], [0.64, 0.15], [0.77, 0.12], [0.88, 0.08], [0.96, 0.03], [1, 0]],
  ],
};

/** A pine that has spent a century on bare rock: thick for its height, forking low into broad flat plates. */
const ROCK_PINE: Rings = [[0, 0.034], [0.28, 0.024], [0.3, 0.2], [0.4, 0.27], [0.48, 0.13], [0.64, 0.3], [0.72, 0.15], [0.9, 0.2], [1, 0]];

/** A kind's stages are rows of the tables in order, and the rock pine's comes after them all. */
export const ROCK_ROW = TREE_KINDS.length * STAGES;

const ROWS: Rings[] = [...TREE_KINDS.flatMap((kind) => STAGED[kind]), ROCK_PINE];

/** The crown's lower tip, its belly and its top: the fewest rings that keep a far tree's outline its near outline's. */
function farRings(rings: Rings): Rings {
  const crown = rings.slice(TRUNK_RINGS, -1);
  const [baseUp, baseWide] = crown[0];
  const lineWideAt = (up: number) => baseWide * (1 - (up - baseUp) / (1 - baseUp));
  const fullest = crown.reduce((best, ring) => (ring[1] - lineWideAt(ring[0]) > best[1] - lineWideAt(best[0]) ? ring : best));
  return [[baseUp, 0], fullest, [1, 0]];
}

/** Where a ring is in the crown, 0 at its base and 1 at its tip, and the trunk at the base. */
const inCrown = (rings: Rings) => {
  const baseUp = rings[TRUNK_RINGS][0];
  return rings.map(([up], ring) => (ring < TRUNK_RINGS ? 0 : (up - baseUp) / (1 - baseUp)));
};

/** How far out a ring reaches, as a share of the crown's outer envelope there: below 1 it's tucked between tiers or plates, where little light gets in. */
function outerShare(rings: Rings): number[] {
  const crown = rings.slice(TRUNK_RINGS);
  const hull: Rings = [];
  for (const ring of crown) {
    while (hull.length >= 2) {
      const [[upA, wideA], [upB, wideB]] = hull.slice(-2);
      if ((upB - upA) * (ring[1] - wideA) - (wideB - wideA) * (ring[0] - upA) < 0) break;
      hull.pop();
    }
    hull.push(ring);
  }
  const hullAt = (up: number) => {
    const above = hull.findIndex(([hullUp]) => hullUp >= up);
    if (above <= 0) return hull[0][1];
    const [[upA, wideA], [upB, wideB]] = [hull[above - 1], hull[above]];
    return wideA + ((wideB - wideA) * (up - upA)) / (upB - upA);
  };
  return rings.map(([up, wide], ring) => (ring < TRUNK_RINGS || hullAt(up) === 0 ? 1 : wide / hullAt(up)));
}

/** A row's tucked share averaged over its crown's height, so a far crown, which has no tiers, is as dark on the whole as its near one. */
function meanOuterShare(rings: Rings): number {
  const share = outerShare(rings);
  let sum = 0;
  for (let ring = TRUNK_RINGS + 1; ring < rings.length; ring++) sum += ((share[ring] + share[ring - 1]) / 2) * (rings[ring][0] - rings[ring - 1][0]);
  return sum / (1 - rings[TRUNK_RINGS][0]);
}

/** A ring as the shader reads it: (up, wide), then where it is in the crown and how far out it reaches, for its light. */
const nearRow = (rings: Rings) => {
  const [crown, outer] = [inCrown(rings), outerShare(rings)];
  return rings.map(([up, wide], ring) => [up, wide, crown[ring], outer[ring]]);
};
const farRow = (rings: Rings) => {
  const far = farRings(rings);
  const [baseUp] = far[0];
  const outer = meanOuterShare(rings);
  return far.map(([up, wide]) => [up, wide, (up - baseUp) / (1 - baseUp), outer]);
};

/** Rows of rings of (up, wide, in crown, outer share), for the shader: a tree's value is at row × rings + ring. */
export const RING_VALUES = 4;
export const NEAR_TABLE = Float32Array.from(ROWS.flatMap(nearRow).flat());
export const FAR_TABLE = Float32Array.from(ROWS.flatMap(farRow).flat());

/** The widest any crown spreads, as a share of the tree's height, with a ring's swell. */
export const WIDEST_CROWN = Math.max(...ROWS.flat().map(([, wide]) => wide)) * (1 + SWELL);

/** How wide a grown tree of a kind spreads, as a share of its height: what the stands plan a stand's cover from. */
export const grownCrown = (kind: TreeKind) => Math.max(...STAGED[kind][1].map(([, wide]) => wide));

/** Every row's rings, to check. */
export const shapeRows = (): readonly Rings[] => ROWS;
