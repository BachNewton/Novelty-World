import { all, float, greaterThanEqual, int, ivec2, lessThan, select, smoothstep, texture, textureLoad, vec2 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { Clipmap, TerrainLift } from "./clipmap";
import { FOREST_REACH_M, type ForestInputs } from "./forest";
import type { TileLayers } from "./tile-layers";
import { ROAD_MASK_MIP } from "./tree-place";

/*
 * What a shader reads of the world for the forest: the canopy and the road mask
 * off whichever tile holds a place, the terrain's rise past the last trees, and
 * which of the terrain's rings each of the forest's models stands on. The game
 * and the forest lab (`forest-lab.ts`) both draw from here, so the lab's trees
 * are the game's.
 */

/** Past the trees, the terrain itself rises by the forest. */
const CANOPY_RISE_FROM_M = FOREST_REACH_M - 300;
const CANOPY_RISE_FULL_M = FOREST_REACH_M - 40;
const FOREST_NEAR_RING = 0;
const FOREST_FAR_RING = 2;

export function tileReads(layers: TileLayers, tileM: number, canopyUnitM: number) {
  const slotOf = (place: Node<"vec2">) => {
    const inTiles = place.div(tileM);
    const tile = inTiles.floor();
    const spot = tile.sub(vec2(layers.mapColumn, layers.mapRow));
    const within = all(greaterThanEqual(spot, vec2(0, 0))).and(all(lessThan(spot, vec2(layers.mapColumns, layers.mapRows))));
    const row = textureLoad(layers.slots, ivec2(spot.clamp(vec2(0, 0), vec2(layers.mapColumns - 1, layers.mapRows - 1))));
    const layer = int(row.r.mul(255).round().sub(1).max(0));
    return { uv: inTiles.sub(tile), layer, held: within.and(row.r.greaterThan(0.001)) };
  };
  return {
    /** A tree's height at a place anywhere, off the image of whichever tile holds it, at a level of its mips. */
    canopyAt(place: Node<"vec2">, mip: number) {
      const { uv, layer, held } = slotOf(place);
      const units = texture(layers.canopy, uv).depth(layer).level(float(mip)).r.mul(255);
      return select(held, units.mul(canopyUnitM), float(0));
    },
    roadsAt(place: Node<"vec2">) {
      const { uv, layer, held } = slotOf(place);
      const roads = texture(layers.mask, uv).depth(layer).level(float(ROAD_MASK_MIP));
      return select(held, roads.g.add(roads.b), float(0));
    },
  };
}

export function canopyLift(canopyAt: (place: Node<"vec2">, mip: number) => Node<"float">, cameraSpot: Node<"vec2">): TerrainLift {
  return (place, level) => {
    if (level < 1) return float(0);
    return canopyAt(place, level).mul(smoothstep(float(CANOPY_RISE_FROM_M), float(CANOPY_RISE_FULL_M), place.sub(cameraSpot).length()));
  };
}

/** The ground each of the forest's models stands on. */
export function forestGround(clipmap: Clipmap, read: Clipmap["groundAt"] = clipmap.groundBlendedAt): Pick<ForestInputs, "groundNear" | "groundMid" | "groundFar"> {
  return {
    groundNear: (place) => read(FOREST_NEAR_RING, place),
    groundMid: (place) => read(1, place),
    groundFar: (place) => read(FOREST_FAR_RING, place),
  };
}
