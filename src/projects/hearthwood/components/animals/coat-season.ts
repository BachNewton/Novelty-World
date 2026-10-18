import type { IUniform } from "three";

/*
 * The season every wild animal's coat answers to, as uniforms all their
 * materials share: how far into its winter coat a squirrel or a deer is
 * (greyer, fuller), and how white a mountain hare has turned. The scene
 * sets them each frame from the date (`coatSeason` in `engine/wildlife.ts`);
 * an animal shown in a coat of its own (the preview's winter hare) is given
 * uniforms of its own instead.
 */

export interface CoatSeasonUniforms {
  uWinter: IUniform<number>;
  uWhite: IUniform<number>;
}

export const COAT_SEASON: CoatSeasonUniforms = { uWinter: { value: 0 }, uWhite: { value: 0 } };

/** The season's shared uniforms, or a coat of its own held at a season. */
export function coatSeasonFor(held: { winter: number; white: number } | undefined): CoatSeasonUniforms {
  return held ? { uWinter: { value: held.winter }, uWhite: { value: held.white } } : COAT_SEASON;
}
