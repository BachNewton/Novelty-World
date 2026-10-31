import { describe, expect, it } from "vitest";
import { buildBusShelter, buildFarmFence, buildFarmFencePost, buildMailbox, buildPine, buildPowerPole, buildSignPlate, buildSignPost, buildStreetLamp, buildTownFence, buildTownFencePost, buildWireSpan, type RoadsideModel } from "./index";

const ROADSIDE_LIMIT = 150;
const FAR_LIMIT = 24;

const triangles = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

// The art direction's own limit: an object placed by the hundred mustn't creep past it as it's worked on.
describe("roadside triangle budgets", () => {
  const kit: Record<string, RoadsideModel> = {
    lamp: buildStreetLamp(),
    pole: buildPowerPole(),
    wire: buildWireSpan(),
    post: buildSignPost(),
    plate: buildSignPlate("round", 0.64),
    farm: buildFarmFence(),
    farmPost: buildFarmFencePost(),
    town: buildTownFence(),
    townPost: buildTownFencePost(),
    mailbox: buildMailbox(),
    shelter: buildBusShelter(),
    pine: buildPine(),
  };

  it.each(Object.entries(kit))("%s stays within its budget", (_, model) => {
    expect(triangles(model.near)).toBeLessThan(ROADSIDE_LIMIT);
    expect(triangles(model.far)).toBeLessThanOrEqual(FAR_LIMIT);
  });
});
