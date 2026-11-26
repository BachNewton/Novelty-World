import { COUNTRY_DIRT, COUNTRY_OPEN_ENDS, COUNTRY_ROUGH, COUNTRY_WATER } from "./country";
import type { Placement } from "./town";
import { cellsAlong, GROUND, tilesOf, type Cell, type Tile } from "./ways";

export { GROUND, type Cell } from "./ways";

/** The cells a path runs through, from its first cell to its last by each one between, in straight runs along x or z. */
export const pathCells = cellsAlong;

/**
 * The ground: grass on every cell of the grid, but the paths' and the
 * country's dirt patches, each the dirt tile its neighbours call for, and the
 * country's water, each the water tile. Where a path crosses water the water
 * is laid, and the path ends in a bank either side of it, under a bridge's ends.
 */
export function groundOf(paths: readonly (readonly Cell[])[]): Placement[] {
  const wet = new Set(COUNTRY_WATER.map(key));
  const dirt = [...paths.flatMap(cellsAlong), ...COUNTRY_DIRT];
  const laid = new Map<string, Tile>();
  for (const tile of tilesOf("path", dirt.filter((c) => !wet.has(key(c))), [], COUNTRY_ROUGH, COUNTRY_OPEN_ENDS)) laid.set(key([tile.x, tile.z]), tile);
  for (const tile of tilesOf("river", COUNTRY_WATER, [], COUNTRY_ROUGH, COUNTRY_OPEN_ENDS)) laid.set(key([tile.x, tile.z]), tile);
  const tiles: Placement[] = [];
  for (let x = GROUND.min; x <= GROUND.max; x++) {
    for (let z = GROUND.min; z <= GROUND.max; z++) tiles.push(laid.get(key([x, z])) ?? { piece: "ground_grass", x, z });
  }
  return tiles;
}

const key = ([x, z]: Cell): string => `${x},${z}`;
