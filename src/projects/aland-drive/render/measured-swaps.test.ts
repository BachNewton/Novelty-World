import { describe, expect, test } from "vitest";
import { isMeasured } from "../art/lod-swaps";
import type { RoadsideModel } from "../art/roadside/index";
import { graniteModels } from "./granite";
import { reedClumps } from "./reeds";
import { shrubKinds } from "./shrubs";
import { vergeKinds } from "./verge";

// A planting draws its models at a size of its own and swaps each at its measured swap times that size, so a model the
// LOD check hasn't measured would swap where its kit's number, made for the game's size, scaled again, puts it.
describe("every model a planting draws has a measured swap", () => {
  const { outcrops, stones } = graniteModels();
  const plantings: Record<string, RoadsideModel[]> = {
    verge: vergeKinds().map(({ model }) => model),
    shrubs: shrubKinds().map(({ model }) => model),
    reeds: reedClumps(),
    outcrops,
    stones,
  };
  test.each(Object.entries(plantings))("%s", (_, models) => {
    expect(models.map(isMeasured)).toEqual(models.map(() => true));
  });
});
