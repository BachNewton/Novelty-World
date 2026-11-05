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

export function leavesOf(season: SeasonNodes, threshold: Node<"float">): Leaves {
  const spring = season.turned.lessThanEqual(0);
  const inLeaf = changeOf(season.leafed, select(spring, threshold, float(1).sub(threshold)));
  return { inLeaf, turned: changeOf(season.turned, threshold), fresh: select(spring, float(1).sub(season.leafed), float(0)).mul(inLeaf) };
}

/** How much of spring's new green a leaf in it shows at most: the rest is its summer colour already. */
export const FRESH_SHARE = 0.7;

/** A bare crown is a twig mass this much narrower than the leaves were. */
export const BARE_SPREAD = 0.8;

/** How white a plant's upward faces are, 0 to 1: its own threshold against the land's cover, more of it as the snow deepens. */
export function snowHeldOf(season: SeasonNodes, threshold: Node<"float">): Node<"float"> {
  return changeOf(season.snowCover, threshold).mul(smoothstep(float(0), float(10), season.snowDepthCm).mul(0.4).add(0.45));
}

/** How much of a face the snow lies on, by how far it looks up. */
export const snowOnFace = (up: Node<"float">) => smoothstep(float(0.3), float(0.75), up);
