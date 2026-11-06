import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel } from "./paint";

/*
 * The town's Christmas tree: a tall spruce stood in a square from late November to Tjugondag Knut, as Mariehamn stands
 * one on Torget. Tiers of cones, each a little turned from the one below, a short trunk in a timber stand, and a star
 * on top. Its lights aren't in the mesh: `christmasTreeLights` says where its bulbs hang, for the night's glows to draw
 * (`render/winter-lights.ts`), so by day it's a spruce and by night it's strung with lights.
 */

export const CHRISTMAS_TREE_TALL_M = 12.5;
const TIERS = 7;
const FOOT_M = 1.1;
const TIER_TALL_M = 2.5;
const SPREAD_M = 3.1;
const TOP_SHARE = 0.22;
const SIDES = 8;
const FAR_SIDES = 5;
const STAR_M = 0.6;
const STAR_POINTS = 5;
const STAR_DEPTH_M = 0.04;

interface Tier {
  foot: number;
  head: number;
  radius: number;
}

/** Each tier's foot, head and spread, from the lowest: they overlap, and narrow up to the leader. */
function tiers(): Tier[] {
  const top = CHRISTMAS_TREE_TALL_M - STAR_M * 1.4;
  const rise = (top - TIER_TALL_M - FOOT_M) / (TIERS - 1);
  return Array.from({ length: TIERS }, (_, tier) => {
    const foot = FOOT_M + tier * rise;
    return { foot, head: Math.min(top, foot + TIER_TALL_M), radius: SPREAD_M * (1 - (tier / TIERS) * 0.82) };
  });
}

/** A five-pointed star upright in the x-y plane, as a fan of points: front and back a little apart. */
function starPoints(centre: V3, outer: number): V3[] {
  return Array.from({ length: STAR_POINTS * 2 }, (_, at) => {
    const angle = Math.PI / 2 + (at * Math.PI) / STAR_POINTS;
    const radius = at % 2 === 0 ? outer : outer * 0.42;
    return [centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius, centre[2]] as const;
  });
}

function addStar(tree: TownPainted, centre: V3) {
  for (const side of [-1, 1]) {
    const face: V3 = [centre[0], centre[1], centre[2] + side * STAR_DEPTH_M];
    const points = starPoints(face, STAR_M);
    // A fan from the middle, so the concave outline fills right.
    for (let at = 0; at < points.length; at++) tree.face([face, points[at], points[(at + 1) % points.length]], "tree-star", side < 0 ? 0.85 : 1);
  }
}

export function buildChristmasTree(): RoadsideModel {
  const near = new TownPainted()
    .box([-0.75, 0, -0.75], [0.75, 0.42, 0.75], "post-wood", { shade: 0.9, shadeTop: 1.05 })
    .tube([0, -0.4, 0], [0, FOOT_M + 0.6, 0], 0.26, 6, { radiusTo: 0.2, shadeFrom: 0.8 }, "spruce-bark");
  for (const { foot, head, radius } of tiers()) {
    near.tube([0, foot, 0], [0, head, 0], radius, SIDES, { radiusTo: radius * TOP_SHARE, shadeFrom: 0.86, shadeTo: 1.08 }, "spruce");
    // The underside, in its own shade, so a tier seen from below is a bough and not a hollow: inside the cone whichever way its sides turn.
    const under = Array.from({ length: SIDES }, (_, side): V3 => {
      const angle = (side / SIDES) * 2 * Math.PI;
      return [Math.cos(angle) * radius * 0.88, foot + 0.01, Math.sin(angle) * radius * 0.88];
    });
    near.face(under, "spruce-shade");
  }
  const leaderFoot = CHRISTMAS_TREE_TALL_M - STAR_M * 1.4 - 0.4;
  near.spike([0, leaderFoot, 0], [0, CHRISTMAS_TREE_TALL_M - STAR_M, 0], 0.16, "spruce");
  addStar(near, [0, CHRISTMAS_TREE_TALL_M - STAR_M * 0.15, 0]);

  const far = new TownPainted()
    .box([-0.75, 0, -0.75], [0.75, 0.42, 0.75], "post-wood", { open: true })
    .tube([0, 0.3, 0], [0, FOOT_M + 0.6, 0], 0.3, 3, {}, "spruce-bark");
  for (const { foot, head, radius } of tiers()) far.tube([0, foot, 0], [0, head, 0], radius, FAR_SIDES, { radiusTo: radius * TOP_SHARE, shadeFrom: 0.86, shadeTo: 1.08 }, "spruce");
  far.spike([0, leaderFoot, 0], [0, CHRISTMAS_TREE_TALL_M - STAR_M, 0], 0.2, "spruce");
  addStar(far, [0, CHRISTMAS_TREE_TALL_M - STAR_M * 0.15, 0]);
  return townModel(near, far, 160, 3000);
}

/** Where the tree's bulbs hang, in its own metres: strings looped round each tier just in from its boughs' edge, and the star. */
export function christmasTreeLights(): { bulbs: V3[]; star: V3 } {
  const bulbs: V3[] = [];
  for (const [index, { foot, head, radius }] of tiers().entries()) {
    for (const share of [0.12, 0.5]) {
      const y = foot + (head - foot) * share;
      const across = radius + (radius * TOP_SHARE - radius) * share + 0.08;
      const count = Math.max(6, Math.round(across * 7));
      for (let at = 0; at < count; at++) {
        const angle = ((at + index * 0.37 + share) / count) * 2 * Math.PI;
        bulbs.push([Math.cos(angle) * across, y + Math.sin(angle * 3) * 0.12, Math.sin(angle) * across]);
      }
    }
  }
  return { bulbs, star: [0, CHRISTMAS_TREE_TALL_M - STAR_M * 0.15, 0] };
}
