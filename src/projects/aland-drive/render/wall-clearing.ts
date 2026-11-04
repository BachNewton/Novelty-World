import { DataTexture, NearestFilter, RedFormat, UnsignedByteType, Vector2, type Node } from "three/webgpu";
import { all, float, floor, greaterThanEqual, ivec2, lessThan, mix, select, textureLoad, uniform, vec2 } from "three/tsl";
import { ROADSIDE_FLOATS } from "./tile-models";
import { SECTION_FLOATS, STONE_WALL_HALF_WIDE_M, type WallSections } from "./tile-walls";

/*
 * How far a place is from the nearest stone wall or street furniture, for the plantings,
 * so no grass, bush or birch stands up through a wall, a bench or a café terrace. The
 * plantings read only images (`planting.ts`), and a wall is too thin for any image a tile
 * has, so this is an image of its own: the distance to the walls and furniture of every
 * loaded tile, in a square that follows the camera. It reads as a distance from a wall's
 * line, so furniture counts from its own edge less a wall's half width, which the
 * plantings add.
 *
 * Walls only stand on tiles with detail, and those land well beyond anything planted,
 * so a plant never vanishes because a tile landed. The square's reach covers the
 * plantings that read it, so none vanishes as it moves either.
 */

export interface ClearingSpec {
  across: number;
  texelM: number;
  /** The farthest distance it tells apart: farther than this reads as this. */
  capM: number;
  /** How far the camera moves from the square's middle before it's drawn again round the camera. */
  recentreM: number;
}

/** For the verge and the bushes, to past their reach: right to a few centimetres away from a wall, and on its line it reads at most a texel's half-diagonal. */
export const NEAR_CLEARING: ClearingSpec = { across: 2048, texelM: 0.6, capM: 4, recentreM: 48 };
/** For the birches, to past theirs, which can't be told so finely: a birch keeps a couple of metres off a wall. */
export const FAR_CLEARING: ClearingSpec = { across: 1536, texelM: 2.5, capM: 10, recentreM: 256 };

/** What a place on a wall's line can read at most, half a texel's diagonal away: a clearing for anything narrower can't be trusted. */
export const onLineReading = ({ texelM }: ClearingSpec) => (texelM * Math.SQRT2) / 2;

/** A place's distance to the nearest wall's line, in metres, up to the clearing's cap. */
export type WallDistance = (place: Node<"vec2">) => Node<"float">;

/** Lines as `WallSections` lays them, and how much further than a stone wall's line a plant keeps off them. */
export interface Clearance {
  sections: WallSections;
  outM: number;
}

/**
 * Each piece of street furniture as a line along its length in its own axes (x along, z its front) and how far either
 * side of it a plant keeps off: its own half depth and a little. A café table's line runs between its chairs, and its
 * reach covers the 1.4 m between the tables of a terrace's row, so a terrace stands clear as a patio would.
 */
const FURNITURE_CLEARANCES: Record<string, { from: [number, number]; to: [number, number]; halfWideM: number }> = {
  bench: { from: [-0.95, -0.03], to: [0.95, -0.03], halfWideM: 0.45 },
  bin: { from: [0, 0.04], to: [0, 0.04], halfWideM: 0.35 },
  "bike-rack": { from: [0, 0], to: [2.4, 0], halfWideM: 0.55 },
  "cafe-set": { from: [0, -1.05], to: [0, 1.05], halfWideM: 1.2 },
};

/** The furniture among a tile's roadside places, by model, as clearances. */
export function furnitureClearances(models: Record<string, Float32Array>): Clearance[] {
  return Object.entries(FURNITURE_CLEARANCES).flatMap(([model, { from, to, halfWideM }]) => {
    const places = models[model] as Float32Array | undefined;
    if (places === undefined) return [];
    const count = places.length / ROADSIDE_FLOATS;
    const sections = new Float32Array(count * SECTION_FLOATS);
    for (let place = 0; place < count; place++) {
      const [x, , z, yaw] = places.subarray(place * ROADSIDE_FLOATS, place * ROADSIDE_FLOATS + 4);
      // A model's own x lies along (cos yaw, -sin yaw) in the scene, and its z along (sin yaw, cos yaw).
      const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
      const scene = ([along, front]: [number, number]) => [x + along * cos + front * sin, 0, z - along * sin + front * cos];
      sections.set([...scene(from), ...scene(to)], place * SECTION_FLOATS);
    }
    return [{ sections, outM: halfWideM - STONE_WALL_HALF_WIDE_M }];
  });
}

/** Writes each texel's distance to the nearest section, as a share of the cap in bytes, for a square whose corner is at `west`, `north` in the scene. */
export function stampDistances(field: Uint8Array, { across, texelM, capM }: ClearingSpec, west: number, north: number, clearances: Iterable<Clearance>) {
  field.fill(255);
  for (const { sections, outM } of clearances) {
    for (let at = 0; at < sections.length; at += SECTION_FLOATS) {
      const [x1, z1, x2, z2] = [sections[at], sections[at + 2], sections[at + 3], sections[at + 5]];
      const [dx, dz] = [x2 - x1, z2 - z1];
      const lengthSquared = Math.max(dx * dx + dz * dz, 1e-9);
      const reach = capM + outM;
      const first = (low: number, from: number) => Math.max(0, Math.floor((low - reach - from) / texelM - 0.5));
      const last = (high: number, from: number) => Math.min(across - 1, Math.ceil((high + reach - from) / texelM - 0.5));
      for (let row = first(Math.min(z1, z2), north); row <= last(Math.max(z1, z2), north); row++) {
        const z = north + (row + 0.5) * texelM;
        for (let column = first(Math.min(x1, x2), west); column <= last(Math.max(x1, x2), west); column++) {
          const x = west + (column + 0.5) * texelM;
          const along = Math.min(1, Math.max(0, ((x - x1) * dx + (z - z1) * dz) / lengthSquared));
          const distance = Math.max(0, Math.hypot(x - (x1 + dx * along), z - (z1 + dz * along)) - outM);
          const value = Math.min(255, Math.round((distance / capM) * 255));
          const index = row * across + column;
          if (value < field[index]) field[index] = value;
        }
      }
    }
  }
}

export function createWallClearing(spec: ClearingSpec) {
  const { across, texelM, capM, recentreM } = spec;
  const field = new Uint8Array(across * across).fill(255);
  const texture = new DataTexture(field, across, across, RedFormat, UnsignedByteType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  const corner = uniform(new Vector2(-1e9, -1e9));
  const tiles = new Map<string, Clearance[]>();
  let middle: { x: number; z: number } | null = null;
  let stale = false;

  return {
    add(tile: string, clearances: Clearance[]) {
      if (tiles.has(tile)) throw new Error(`${tile}'s walls are already cleared round`);
      tiles.set(tile, clearances);
      stale = true;
    },
    remove(tile: string) {
      if (!tiles.delete(tile)) throw new Error(`${tile} has no walls cleared round`);
      stale = true;
    },
    /** Draws the square round a spot again once the spot has moved far enough, or what it clears round changed. */
    update(spot: { x: number; z: number }) {
      if (!stale && middle !== null && Math.hypot(spot.x - middle.x, spot.z - middle.z) < recentreM) return;
      middle = { x: Math.round(spot.x / texelM) * texelM, z: Math.round(spot.z / texelM) * texelM };
      const half = (across / 2) * texelM;
      stampDistances(field, spec, middle.x - half, middle.z - half, [...tiles.values()].flat());
      corner.value.set(middle.x - half, middle.z - half);
      texture.needsUpdate = true;
      stale = false;
    },
    /** Blended between the four texels round a place; outside the square, the cap. */
    distanceAt: ((place) => {
      const at = place.sub(corner).div(texelM).sub(0.5);
      const low = floor(at);
      const share = at.sub(low);
      const inside = all(greaterThanEqual(low, vec2(0, 0))).and(all(lessThan(low, vec2(across - 1, across - 1))));
      const texel = ivec2(low.clamp(vec2(0, 0), vec2(across - 2, across - 2)));
      const load = (column: number, row: number) => textureLoad(texture, texel.add(ivec2(column, row))).r;
      const blended = mix(mix(load(0, 0), load(1, 0), share.x), mix(load(0, 1), load(1, 1), share.x), share.y);
      return select(inside, blended.mul(capM), float(capM));
    }) satisfies WallDistance,
    dispose() {
      texture.dispose();
    },
  };
}
