import { buildBomarsundFort, buildNotvikstornet } from "./bomarsund";
import { buildChurch } from "./church";
import { buildFerry } from "./ferry";
import { buildKastelholm } from "./kastelholm";
import type { Landmark } from "./landmark";
import { buildPommern } from "./pommern";
import { buildTownHall } from "./town-hall";
import { buildVonKnorring } from "./von-knorring";
import { buildWaterTower } from "./water-tower";

export type { Landmark } from "./landmark";
export { placed, triangles } from "./landmark";

let built: Landmark[] | undefined;

/** Every landmark, built once. */
export function LANDMARKS(): Landmark[] {
  built ??= [buildWaterTower(), buildPommern(), buildChurch(), buildTownHall(), buildKastelholm(), buildBomarsundFort(), buildNotvikstornet(), buildVonKnorring(), buildFerry()];
  return built;
}
