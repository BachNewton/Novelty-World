import { uniform } from "three/tsl";
import type { UniformNode } from "three/webgpu";

/*
 * The season every wild animal's coat answers to: how far into its winter
 * coat a squirrel or a deer is (greyer, fuller), and how white a mountain
 * hare has turned. The scene sets these each frame from the date
 * (`coatSeason` in `engine/wildlife.ts`); every such coat reads them. An
 * animal shown in a coat of its own (the preview's winter hare) holds its
 * season on its own material instead (`held`), in the same graph.
 */

export interface CoatSeasonUniforms {
  uWinter: UniformNode<"float", number>;
  uWhite: UniformNode<"float", number>;
}

export const COAT_SEASON: CoatSeasonUniforms = { uWinter: uniform(0), uWhite: uniform(0) };

/** No season held: the coat follows the year's. */
export const FOLLOW_SEASON = -1;

/** A coat's held season value, or the year's where it holds none. */
export function heldOr(held: number | undefined): number {
  return held ?? FOLLOW_SEASON;
}
