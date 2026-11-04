import type { Place } from "../audio/model";
import type { World } from "./world";

/*
 * What's round the car, for what the driver hears, read from what the world
 * already holds. Canopy data lives only on the GPU, so forest is a stand-in:
 * whatever land is neither town nor shore.
 */

const SHORE_LOOK_M = [70, 160];
const SHORE_LOOKS = 8;
/** Walls in a 120 m block that read as a full town: a dozen or so buildings. */
const TOWN_WALLS = 70;

export function placeAround(world: World, x: number, z: number): Place {
  let water = 0;
  for (const reach of SHORE_LOOK_M) {
    for (let look = 0; look < SHORE_LOOKS; look++) {
      const angle = (look / SHORE_LOOKS) * 2 * Math.PI;
      if (world.isWater(x + reach * Math.cos(angle), z + reach * Math.sin(angle))) water++;
    }
  }
  const shore = water / (SHORE_LOOKS * SHORE_LOOK_M.length);
  const town = Math.min(world.wallsAt(x, z) / TOWN_WALLS, 1);
  return { shore, town, forest: Math.max(1 - shore - town, 0) };
}
