import { float, select, smoothstep } from "three/tsl";
import type { Node } from "three/webgpu";
import { changeOf, type SeasonNodes } from "./season";

/*
 * A broadleaf's leaves and a plant's snow through the year, from the season's dials and the plant's own threshold,
 * rolled from its place. The forest's trees, the shrubs and the town's lindens all read it, so a wood, its edge and an
 * avenue go the same way.
 *
 * In autumn a plant turns when the share turned passes its threshold, and goes bare when the share bare does, so the
 * first to turn is the first to fall, a couple of weeks later (`climate/season.ts`'s windows). Nothing is turned while
 * leaves come out in spring, and then a plant leafs out when the share in leaf passes its threshold, so a late kind,
 * the oak, is late both ways.
 */

export interface Leaves {
  /** 1 in leaf, 0 bare. */
  inLeaf: Node<"float">;
  /** How far to its autumn colour. */
  turned: Node<"float">;
  /** How much of spring's light new green it still has. */
  fresh: Node<"float">;
}

/**
 * A plant's leaves at the season. `fallSpan` is how much of the season's share in leaf one plant takes to lose its
 * leaves, or to grow them back, as a softness of `changeOf`: a tree loses its leaves over a couple of weeks, not at once.
 */
export function leavesOf(season: SeasonNodes, threshold: Node<"float">, fallSpan = 0.04): Leaves {
  const spring = season.turned.lessThanEqual(0);
  const inLeaf = changeOf(season.leafed, select(spring, threshold, float(1).sub(threshold)), fallSpan);
  return { inLeaf, turned: changeOf(season.turned, threshold), fresh: select(spring, float(1).sub(season.leafed), float(0)).mul(inLeaf) };
}

/** How much of spring's new green a leaf in it shows at most: the rest is its summer colour already. */
export const FRESH_SHARE = 0.7;

/** How white a plant's upward faces are, 0 to 1: its own threshold against the land's cover, more of it as the snow deepens. */
export function snowHeldOf(season: SeasonNodes, threshold: Node<"float">): Node<"float"> {
  return changeOf(season.snowCover, threshold).mul(smoothstep(float(0), float(10), season.snowDepthCm).mul(0.4).add(0.45));
}

/** How much of a face the snow lies on, by how far it looks up. */
export const snowOnFace = (up: Node<"float">) => smoothstep(float(0.3), float(0.75), up);

/*
 * Leaf fall plant by plant, as the forest's broadleaves, the lindens and the bushes share it: a plant loses its leaves
 * over its own span of the season's share in leaf (`FALL_SPAN`, about a fortnight), so a stand in October holds full,
 * thinning and bare plants side by side. As its first leaves go, clumps of leaves grow out of its leafy crown on its
 * twigs while the crown shrinks away inside them, so the crown breaks up with no jump; then the clumps fall one by one,
 * each on its own share, and the branches show through. Spring runs the same backwards. Near, a bare plant is its
 * branches; far off, where they're thinner than a pixel, a see-through haze of its twigs fills its crown's outline.
 */

/** How much of the season's share in leaf one plant takes to lose its leaves: `leavesOf`'s `fallSpan`. */
export const FALL_SPAN = 0.5;
/** The leafy crown has shrunk away by this share of the plant's leaves left. */
export const CROWN_GONE = 0.85;
/** The clumps have grown out whole by this much less than all the plant's leaves. */
export const CLUMP_GROW = 0.1;
/** The clumps fall one by one between this share and none, each over this much of it. */
export const CLUMPS_FROM = 0.82;
export const CLUMP_RUN = 0.12;
/** The twigs' haze: none near, where the branches carry a plant on their own, coming in as its twigs and then its limbs go below a pixel on the floor's screen, to this opacity far off. */
export const HAZE_OPACITY = 0.6;
export const HAZE_RUN_M: [number, number] = [60, 420];
/** A mass of twigs shades itself: against the sky it's darker than any one twig in the sun. */
export const HAZE_LIGHT = 0.4;
/** How far in from its outline the haze thickens, by how square on a face is seen, so it has no edge of its own. */
export const HAZE_EDGE = 0.6;

/** How much of a leafy crown is left, 0 to 1, as a plant's share of its leaves falls. */
export const crownLeftOf = (share: Node<"float">) => smoothstep(float(CROWN_GONE), float(1), share);

/** A clump's size, 0 to 1: grown out of the crown as the first leaves go, then fallen at its own share (`own`, 0 to 1, varied per plant). */
export const clumpSizeOf = (share: Node<"float">, own: Node<"float">) =>
  share.sub(own.mul(CLUMPS_FROM - CLUMP_RUN)).div(CLUMP_RUN).min(float(1).sub(share).div(CLUMP_GROW)).clamp(0, 1);

/** The twigs' haze's opacity at a distance, before how bare the plant is. */
export const hazeByDistance = (metres: Node<"float">) => smoothstep(float(HAZE_RUN_M[0]), float(HAZE_RUN_M[1]), metres).mul(HAZE_OPACITY);
