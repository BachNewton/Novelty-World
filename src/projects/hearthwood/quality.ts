/*
 * Every knob that trades how the world looks for how fast it draws, in one
 * place: how far the land reaches, how fine it is with distance, how far
 * plants are drawn and in which detail, the pixel ratio and the sun's
 * shadows. The game runs on the desktop profile while it is a prototype; a
 * phone's profile is another object of the same shape.
 */

export interface Quality {
  /** How far the land is drawn, in metres: out to the horizon, so a clear day shows land all the way and no edge. */
  viewDistance: number;
  /** A tile of land is split into four finer ones while the camera is nearer than this many of its own widths. */
  tileSplit: number;
  /** Tiles at this level and finer carry their water (level 0 is the finest, 64 m across). */
  waterLevels: number;
  /** Plants are drawn in full within `near` metres and in their far shape out to `far`; past `thinFrom`, only `keep` of them. */
  trees: PlantReach;
  /** Bushes, heather and rocks. */
  shrubs: PlantReach;
  /** Flowers and ferns. */
  small: PlantReach;
  /** The sharpest the world draws, in device pixels per CSS pixel. */
  maxPixelRatio: number;
  /** Each of the sun's shadow maps, in texels a side. */
  shadowMap: number;
  /** How far from the camera the shadows reach, in metres: in four maps with the far shadows on (`shadowCascades`), in one without. */
  shadowReach: number;
  shadowReachNear: number;
  /** How many tiles of land and chunks of plants are built in one frame while the world streams in. */
  buildsPerFrame: number;
}

export interface PlantReach {
  near: number;
  far: number;
  thinFrom: number;
  keep: number;
}

export const DESKTOP: Quality = {
  viewDistance: 100000,
  tileSplit: 2.6,
  waterLevels: 4,
  trees: { near: 200, far: 1100, thinFrom: Infinity, keep: 1 },
  shrubs: { near: 110, far: 420, thinFrom: Infinity, keep: 1 },
  small: { near: 90, far: 200, thinFrom: Infinity, keep: 1 },
  maxPixelRatio: 2,
  shadowMap: 2048,
  shadowReach: 900,
  shadowReachNear: 60,
  buildsPerFrame: 8,
};

export const QUALITY: Quality = DESKTOP;
