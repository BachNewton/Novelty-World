import type { Place } from "../audio/model";
import type { World } from "./world";

/*
 * What's round the car, for what the driver hears, read from what the world
 * already holds. Canopy data lives only on the GPU, so forest is a stand-in:
 * whatever land is neither town nor shore. The shore is the sea's: a lake or a
 * pond lies above sea level, and has no waves or gulls to hear.
 */

const SHORE_LOOK_M = [70, 160];
const SHORE_LOOKS = 8;
/** Water whose drawn surface lies under this, metres, is the sea; Åland's lakes lie higher. */
const SEA_UNDER_M = 1;
/** Walls in a 120 m block that read as a full town: a dozen or so buildings. */
const TOWN_WALLS = 70;

/** What lies at a place: the sea, a lake (water above sea level) or land. */
function waterAt(world: World, x: number, z: number): "sea" | "lake" | null {
  if (!world.isWater(x, z)) return null;
  const stepM = world.manifest.heights.stepM;
  return world.waterLevel(Math.round(x / stepM), Math.round(z / stepM)) < SEA_UNDER_M ? "sea" : "lake";
}

export function placeAround(world: World, x: number, z: number): Place {
  let sea = 0;
  let lake = 0;
  let seaAt: Place["seaAt"];
  // Nearest first, so the sea a sound is placed over is the nearest the looks found.
  for (const reach of SHORE_LOOK_M) {
    for (let look = 0; look < SHORE_LOOKS; look++) {
      const angle = (look / SHORE_LOOKS) * 2 * Math.PI;
      const [lookX, lookZ] = [x + reach * Math.cos(angle), z + reach * Math.sin(angle)];
      const water = waterAt(world, lookX, lookZ);
      if (water === "sea") {
        sea++;
        seaAt ??= { x: lookX, z: lookZ };
      } else if (water === "lake") lake++;
    }
  }
  const looks = SHORE_LOOKS * SHORE_LOOK_M.length;
  const [shore, lakeShare] = [sea / looks, lake / looks];
  const town = Math.min(world.wallsAt(x, z) / TOWN_WALLS, 1);
  return { shore, lake: lakeShare, town, forest: Math.max(1 - shore - lakeShare - town, 0), seaAt };
}
