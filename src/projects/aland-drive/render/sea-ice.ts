import { ClampToEdgeWrapping, DataTexture, LinearFilter, NoColorSpace, RedFormat, UnsignedByteType, type Node } from "three/webgpu";
import { abs, float, fwidth, mix, select, smoothstep, texture, vec2 } from "three/tsl";
import { seedOf, unitOf } from "../art/hash";
import { seasonNodes, type SeasonLook } from "../art/season";
import { EDGE_NOISE, type ExposureGrid } from "../sim/sea-ice";

/*
 * The sea ice as a shader reads it: each place's exposure from the same bytes the simulation reads (`sim/sea-ice.ts`),
 * with the same ragged edge rolled from the place, against the season's `iceReach` and `iceDrivable`. Sheltered bays
 * freeze first, then the archipelago between its islands, and the open sea last.
 *
 * What a pixel of water is, frozen: how much of it is ice (the edge breaks into floes with open water between them, a
 * lead along the ice's edge that is never a straight line), how thick (new ice is dark and glassy, ice that bears a car
 * pale and matt), the snow lying on it, and the cracks and pressure ridges across it. `render/water.ts` paints it.
 */

/** The share of the reach over which the edge breaks up into floes and open water. */
const LEAD_SHARE = 0.04;
/** A floe's size, metres. */
const FLOE_M = 11;
/** New ice turns to old, pale ice from a little short of the reach that bears a car to a little past it. */
const THICK_FROM = 0.03;
const THICK_TO = 0.04;
/** Snow lies in drifts on three sizes of patch, metres, each moving a place's threshold this much, so a drift's edge is ragged. */
const SNOW_PATCHES = [
  { cellM: 23, share: 0.55 },
  { cellM: 7, share: 0.3 },
  { cellM: 2.3, share: 0.15 },
] as const;
/** How soft a drift's edge is, as a share of the cover, and how much of the cover thin ice and thick take: the wind keeps patches of the ice bare. */
const SNOW_SOFT = 0.05;
const SNOW_ON_THIN = 0.35;
const SNOW_ON_THICK = 0.68;
/** A pressure ridge's spacing, metres, and a crack's; each line is about this wide, in the noise's own units. */
const RIDGE_M = 90;
const CRACK_M = 23;
const LINE_WIDTH = 0.008;
/** Lines finer than this, in the noise's units a pixel, have faded to nothing. */
const LINES_GONE = 0.05;
const SALT = { floes: 6101, snow: 6103, ridges: 6107, cracks: 6109 } as const;

/** Noise from 0 to 1 between whole cells' rolls, eased: `sim/sea-ice.ts`'s `valueNoiseOf`, on the GPU. */
function valueNoise(place: Node<"vec2">, cellM: number, salt: number): Node<"float"> {
  const at = place.div(cellM);
  const cell = at.floor();
  const t = at.sub(cell);
  const eased = t.mul(t).mul(float(3).sub(t.mul(2)));
  const roll = (across: number, down: number) => unitOf(seedOf(cell.x.add(across), cell.y.add(down)), salt);
  return mix(mix(roll(0, 0), roll(1, 0), eased.x), mix(roll(0, 1), roll(1, 1), eased.x), eased.y);
}

/** A line along the middle of a noise, faded out once it's finer than a pixel can show. */
function lineOf(noise: Node<"float">): Node<"float"> {
  const middle = abs(noise.sub(0.5));
  const blur = fwidth(noise);
  return float(1).sub(smoothstep(float(LINE_WIDTH).mul(0.5), blur.add(LINE_WIDTH), middle)).mul(float(1).sub(smoothstep(float(LINES_GONE * 0.4), float(LINES_GONE), blur)));
}

/** What a pixel of water is, frozen, all from 0 to 1: nothing but `frozen` matters where it's 0. */
export interface IceLook {
  frozen: Node<"float">;
  /** 0 new ice, dark and glassy; 1 old ice that bears a car, pale and matt. */
  thick: Node<"float">;
  snow: Node<"float">;
  ridge: Node<"float">;
  crack: Node<"float">;
}

export function createSeaIce(grid: ExposureGrid, season: SeasonLook) {
  const map = new DataTexture(grid.values, grid.columns, grid.rows, RedFormat, UnsignedByteType);
  map.colorSpace = NoColorSpace;
  map.wrapS = map.wrapT = ClampToEdgeWrapping;
  map.magFilter = map.minFilter = LinearFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  const size = vec2(grid.columns * grid.stepM, grid.rows * grid.stepM);
  const { iceReach, iceDrivable, snowCover } = seasonNodes(season);

  /** A place's exposure with its ragged edge, as `sim/sea-ice.ts`'s `exposureAt` has it. */
  const exposureAt = (place: Node<"vec2">) =>
    EDGE_NOISE.reduce<Node<"float">>((sum, { cellM, amount, salt }) => sum.add(valueNoise(place, cellM, salt).sub(0.5).mul(amount)), texture(map, place.sub(vec2(grid.west, -grid.north)).div(size)).level(float(0)).r);

  return {
    exposureAt,
    /** The ice at a place on the water. */
    lookAt(place: Node<"vec2">): IceLook {
      const exposure = exposureAt(place);
      const intoIce = iceReach.sub(exposure).div(LEAD_SHARE);
      const pastFloe = intoIce.sub(valueNoise(place, FLOE_M, SALT.floes));
      const soft = fwidth(pastFloe).max(0.001);
      const frozen = select(iceReach.greaterThan(0), smoothstep(soft.negate(), soft, pastFloe), float(0));
      const thick = smoothstep(iceDrivable.add(THICK_TO), iceDrivable.sub(THICK_FROM), exposure).mul(select(iceDrivable.greaterThan(0), float(1), float(0)));
      const patch = SNOW_PATCHES.reduce<Node<"float">>((sum, { cellM, share }, at) => sum.add(valueNoise(place, cellM, SALT.snow + at).mul(share)), float(0));
      const cover = snowCover.mul(mix(float(SNOW_ON_THIN), float(SNOW_ON_THICK), thick)).mul(1 + SNOW_SOFT);
      const drift = cover.sub(patch);
      const snow = smoothstep(fwidth(drift).add(SNOW_SOFT).negate(), float(0), drift);
      return {
        frozen,
        thick,
        snow,
        ridge: lineOf(valueNoise(place, RIDGE_M, SALT.ridges)).mul(thick),
        crack: lineOf(valueNoise(place, CRACK_M, SALT.cracks)),
      };
    },
    dispose() {
      map.dispose();
    },
  };
}

export type SeaIce = ReturnType<typeof createSeaIce>;
