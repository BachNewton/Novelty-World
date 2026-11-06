import { SEA_LIGHTS, type SeaLight } from "../art/night";
import data from "../sea/marks.json";

/*
 * The sea's lights come from OSM (`art/night/lights.json`), and the marks they stand on from the official register
 * (`sea/marks.json`), which is what the game draws. Where the two disagree the register wins: a light stands on the
 * register's mark at its place and takes its kind from that mark's model, so a glow is in the light it belongs to, and
 * only a real lighthouse is drawn as one. A light OSM has and the register doesn't has nothing drawn to shine from, and is left
 * out: its glow would hang in the air or in a tree (the light by Långnäs's ferry berth did).
 */

/** A light this near a register mark is that mark's light. */
const SAME_PLACE_M = 25;

/** A register mark as `sea/marks.json` rows it: its model, and where it stands in the scene. */
export type Mark = readonly [model: string, x: number, z: number, ...rest: number[]];
export const REGISTER_MARKS = data.marks as unknown as readonly Mark[];

/** The light's kind for a register model: its lighthouses, the floating marks, and every fixed mark ashore or on a rock. */
function kindOf(model: string): SeaLight["kind"] {
  if (model === "lighthouse") return "lighthouse";
  if (model.startsWith("spar-") || model.startsWith("pillar-")) return "buoy";
  if (model.startsWith("leading-")) return "leading";
  return "beacon";
}

export function lightsOnMarks(lights: readonly SeaLight[], marks: readonly Mark[]): SeaLight[] {
  return lights.flatMap((light) => {
    let nearest: Mark | null = null;
    let nearestM = SAME_PLACE_M;
    for (const mark of marks) {
      const apart = Math.hypot(mark[1] - light.x, mark[2] - light.z);
      if (apart < nearestM) [nearest, nearestM] = [mark, apart];
    }
    if (nearest === null) return [];
    return [{ ...light, x: nearest[1], z: nearest[2], kind: kindOf(nearest[0]) }];
  });
}

/** Every sea light, on the register's marks. */
export const LIGHTS_ON_MARKS = lightsOnMarks(SEA_LIGHTS, REGISTER_MARKS);
