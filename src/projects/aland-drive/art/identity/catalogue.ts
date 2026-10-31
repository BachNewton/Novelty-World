import type { RoadsideModel } from "../roadside/models";
import { buildCableFerry, buildFerryCable, buildFishingHut, buildKummel, buildLighthouse, buildNetHeap, buildViewingTower, buildViewpointPlatform, buildWoodenDaymark } from "./harbour";
import { buildAppleCrates, buildAppleTree, buildBicycle, buildBonfireStack, buildCottage, buildCyclist, buildDeckChair, buildDryingNets, buildFarmStall, buildHarvestFlag, buildOpenFarmSign, buildOrchardLadder, buildPicnicTable, buildSauna, buildTouringRack, buildUpturnedBoat } from "./summer";

export interface Entry {
  name: string;
  /** Near triangles. Small repeated things 150; one-off buildings a little more; the two headline models 1,000. */
  limit: number;
  farLimit: number;
  model: RoadsideModel;
}

/** Every model the kit builds with its limits, for the budget test and the gallery. */
export function catalogue(): Entry[] {
  const small = (name: string, model: RoadsideModel): Entry => ({ name, limit: 150, farLimit: 24, model });
  const building = (name: string, model: RoadsideModel, limit: number): Entry => ({ name, limit, farLimit: 44, model });
  return [
    small("sauna", buildSauna()),
    small("drying nets", buildDryingNets()),
    small("upturned boat", buildUpturnedBoat("tar")),
    building("summer cottage", buildCottage(), 320),
    small("deck chair", buildDeckChair()),
    small("bonfire stack", buildBonfireStack()),
    building("farm stall", buildFarmStall(), 320),
    building("apple tree", buildAppleTree(1), 150),
    building("apple tree light", buildAppleTree(2, "light"), 150),
    small("orchard ladder", buildOrchardLadder()),
    small("apple crates", buildAppleCrates()),
    small("harvest flag", buildHarvestFlag()),
    small("open-farm sign", buildOpenFarmSign()),
    small("cyclist with bike", buildCyclist("with-bike")),
    small("cyclist standing", buildCyclist("standing", "shirt-red")),
    small("bicycle", buildBicycle()),
    small("touring rack", buildTouringRack()),
    small("picnic table", buildPicnicTable()),
    { name: "lighthouse", limit: 1000, farLimit: 70, model: buildLighthouse() },
    small("kummel", buildKummel()),
    small("wooden daymark", buildWoodenDaymark()),
    small("fishing hut", buildFishingHut()),
    small("net heap", buildNetHeap()),
    { name: "cable ferry", limit: 1000, farLimit: 60, model: buildCableFerry() },
    small("ferry cable", buildFerryCable()),
    building("viewing tower", buildViewingTower(), 500),
    building("viewpoint platform", buildViewpointPlatform(), 320),
  ];
}
