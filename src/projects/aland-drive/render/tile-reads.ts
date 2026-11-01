import { all, float, greaterThanEqual, int, ivec2, lessThan, select, smoothstep, texture, textureLoad, vec2, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { TerrainLift } from "./clipmap";
import type { TileLayers } from "./tile-layers";
import { MEAN_HEIGHT, ROAD_MASK_MIP } from "./tree-place";

/*
 * What a shader reads of the world for the forest: the canopy and the road mask
 * off whichever tile holds a place, and the terrain's rise past the last trees.
 * The game and the forest lab (`forest-lab.ts`) both draw from here, so the lab's
 * trees are the game's.
 */

/** Past the trees the terrain itself rises by the forest, from this far inside the forest's reach to this far. */
const CANOPY_RISE_FROM_M = 300;
const CANOPY_RISE_FULL_M = 40;

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
    /** The stand at a place: the shares of pine, spruce and birch, then the density. Over a tile not held, no trees. */
    standsAt(place: Node<"vec2">) {
      const { uv, layer, held } = slotOf(place);
      return select(held, texture(layers.stands, uv).depth(layer).level(float(0)), vec4(0));
    },
    roadsAt(place: Node<"vec2">) {
      const { uv, layer, held } = slotOf(place);
      const roads = texture(layers.mask, uv).depth(layer).level(float(ROAD_MASK_MIP));
      return select(held, roads.g.add(roads.b), float(0));
    },
  };
}

export function canopyLift(canopyAt: (place: Node<"vec2">, mip: number) => Node<"float">, cameraSpot: Node<"vec2">, forestReach: Node<"float">): TerrainLift {
  return (place, level) => {
    if (level < 1) return float(0);
    return canopyAt(place, level).mul(MEAN_HEIGHT).mul(smoothstep(forestReach.sub(CANOPY_RISE_FROM_M), forestReach.sub(CANOPY_RISE_FULL_M), place.sub(cameraSpot).length()));
  };
}
