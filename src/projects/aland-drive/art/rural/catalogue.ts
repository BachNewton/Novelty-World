import type { RoadsideModel } from "../roadside/index";
import { buildBirch, buildBoathouse, buildBoulder, buildBush, buildHayBale, buildJettyHead, buildJettySection, buildJuniper, buildOutcrop, buildReedBed, buildRowingBoat, buildSailboat, buildSheep, buildShed, buildShoreSlab, buildStoneWall, buildTractor, buildWindmill, buildWrappedBale, ROCK_SEEDS } from "./index";

/** Every model the kit builds, with its near-triangle limit, for the budget test and the gallery's counts. */
export function catalogue(): { name: string; limit: number; farLimit: number; model: RoadsideModel }[] {
  const small = (name: string, model: RoadsideModel) => ({ name, limit: 150, farLimit: 24, model });
  return [
    { name: "windmill", limit: 800, farLimit: 60, model: buildWindmill() },
    { name: "boathouse red", limit: 400, farLimit: 30, model: buildBoathouse("red") },
    { name: "boathouse tarred", limit: 400, farLimit: 30, model: buildBoathouse("tarred") },
    { name: "tractor", limit: 400, farLimit: 44, model: buildTractor() },
    ...ROCK_SEEDS.map((seed) => small(`boulder ${seed}`, buildBoulder(seed))),
    ...ROCK_SEEDS.map((seed) => small(`outcrop ${seed}`, buildOutcrop(seed))),
    ...ROCK_SEEDS.map((seed) => small(`shore slab ${seed}`, buildShoreSlab(seed))),
    small("bush hazel", buildBush(1, "hazel")),
    small("bush sallow", buildBush(2, "sallow")),
    small("juniper column", buildJuniper(1, "column")),
    small("juniper spreading", buildJuniper(2, "spreading")),
    small("birch silver", buildBirch(1, "silver")),
    small("birch young", buildBirch(2, "young")),
    small("birch clump", buildBirch(3, "clump")),
    small("reed bed", buildReedBed(1)),
    small("stone wall", buildStoneWall(1)),
    small("shed red", buildShed("red")),
    small("shed grey", buildShed("grey")),
    small("woodshed", buildShed("woodshed")),
    small("jetty section", buildJettySection()),
    small("jetty head", buildJettyHead()),
    small("rowing boat", buildRowingBoat("white")),
    small("sailboat moored", buildSailboat("moored")),
    small("sailboat sailing", buildSailboat("sailing")),
    small("bale wrapped", buildWrappedBale()),
    small("bale hay", buildHayBale()),
    small("sheep grazing", buildSheep("grazing")),
    small("sheep standing", buildSheep("standing")),
  ];
}
