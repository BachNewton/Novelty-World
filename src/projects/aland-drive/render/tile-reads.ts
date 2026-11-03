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

/** The far photo's level that says what a whole patch is, past a narrow verge's own colour: 32 m. */
const WIDE_LAND_MIP = 2;

/** What `tileReads` says of the ground at a place. */
export type LandAt = (place: Node<"vec2">) => { broad: Node<"vec3">; wide: Node<"vec3">; shade: Node<"float">; dry: Node<"float"> };

export function tileReads(layers: TileLayers, tileM: number, canopyUnitM: number) {
  const slotOf = (place: Node<"vec2">) => {
    const inTiles = place.div(tileM);
    const tile = inTiles.floor();
    const spot = tile.sub(vec2(layers.mapColumn, layers.mapRow));
    const within = all(greaterThanEqual(spot, vec2(0, 0))).and(all(lessThan(spot, vec2(layers.mapColumns, layers.mapRows))));
    const row = textureLoad(layers.slots, ivec2(spot.clamp(vec2(0, 0), vec2(layers.mapColumns - 1, layers.mapRows - 1))));
    const layer = int(row.r.mul(255).round().sub(1).max(0));
    const nearLayer = int(row.g.mul(255).round().sub(1).max(0));
    return { uv: inTiles.sub(tile), layer, nearLayer, held: within.and(row.r.greaterThan(0.001)), nearHeld: within.and(row.g.greaterThan(0.001)) };
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
    roadsAt(place: Node<"vec2">, mip: number = ROAD_MASK_MIP) {
      const { uv, layer, held } = slotOf(place);
      const roads = texture(layers.mask, uv).depth(layer).level(float(mip));
      return select(held, roads.g.add(roads.b), float(0));
    },
    /** How open a place is to reeds: 1, or 0 where a dock keeps the water clear, which the mask's alpha marks at half. */
    openToReedsAt(place: Node<"vec2">) {
      const { uv, layer, held } = slotOf(place);
      return select(held, texture(layers.mask, uv).depth(layer).level(float(0)).a.sub(0.5).mul(2).clamp(0, 1), float(1));
    },
    /** How much of the land round a place is water, at a level of the mask's mips. Over a tile not held, none. */
    waterAt(place: Node<"vec2">, mip: number) {
      const { uv, layer, held } = slotOf(place);
      return select(held, texture(layers.mask, uv).depth(layer).level(float(mip)).r, float(0));
    },
    /** What's on the ground at a place: its colour at 8 m, its colour over a whole patch of land, its baked shade, and whether it's dry land with a tile under it. */
    landAt(place: Node<"vec2">) {
      const { uv, layer, nearLayer, held, nearHeld } = slotOf(place);
      const broad = texture(layers.groundFar, uv).depth(layer).level(float(0));
      const sharpAlpha = texture(layers.groundNear, uv).depth(nearLayer).level(float(0)).a;
      const water = texture(layers.mask, uv).depth(layer).level(float(0)).r;
      return {
        broad: broad.rgb,
        wide: texture(layers.groundFar, uv).depth(layer).level(float(WIDE_LAND_MIP)).rgb,
        shade: texture(layers.shadeFar, uv).depth(layer).level(float(0)).r,
        dry: select(held, float(1).sub(water).mul(select(nearHeld, sharpAlpha, broad.a)), float(0)),
      };
    },
  };
}

export function canopyLift(canopyAt: (place: Node<"vec2">, mip: number) => Node<"float">, cameraSpot: Node<"vec2">, forestReach: Node<"float">): TerrainLift {
  return (place, level) => {
    if (level < 1) return float(0);
    return canopyAt(place, level).mul(MEAN_HEIGHT).mul(smoothstep(forestReach.sub(CANOPY_RISE_FROM_M), forestReach.sub(CANOPY_RISE_FULL_M), place.sub(cameraSpot).length()));
  };
}
