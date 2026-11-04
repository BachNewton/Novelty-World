import type { Mesh } from "three/webgpu";
import type { RoadsideModel } from "../art/roadside/index";

/*
 * A placed model's near and far meshes each cost a draw call whether any of their places shows that version or not.
 * A list that moves (boats under way) or is kept to the camera's surroundings (sea marks) can skip the draw of a
 * version none of its places is near enough or far enough to show. The margins are wider than any kit's own band
 * and spread round its swap, so a version is never hidden while one of its places could show a pixel of it.
 */

const NEAR_UNTIL = 1.25;
const FAR_FROM = 0.7;
const GONE_PAST = 1.05;

/** Shows each of a list's meshes, `[near, far?]`, only while some place is within that version's distances of the camera. */
export function showVersionsInReach(model: RoadsideModel, meshes: readonly Mesh[], nearestM: number, farthestM: number): void {
  // `placeModel` gives a model with a far version its far mesh second.
  const inReach = nearestM < model.reachM * GONE_PAST;
  meshes[0].visible = inReach && nearestM < model.swapM * NEAR_UNTIL;
  if (model.far !== null) meshes[1].visible = inReach && farthestM > model.swapM * FAR_FROM;
}
