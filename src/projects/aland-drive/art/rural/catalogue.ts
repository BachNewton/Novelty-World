import { nearFar, type ArtModel } from "../catalogue";
import type { RoadsideModel } from "../roadside/index";
import { buildBirch, buildBoathouse, buildBoulder, buildBush, buildCow, buildHayBale, buildJettyHead, buildJettySection, buildJuniper, buildPierSection, buildPontoonSection, buildOutcrop, buildReedBed, buildRowingBoat, buildSailboat, buildSheep, buildShed, buildShoreSlab, buildStoneWall, buildTractor, buildWindmill, buildWrappedBale, JETTY_SECTION, PIER_SECTION, PONTOON_SECTION, ROCK_SEEDS, STONE_WALL_M, STONE_WALL_OVERLAP_M } from "./index";

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
    small("pier section", buildPierSection()),
    small("pontoon section", buildPontoonSection()),
    small("rowing boat", buildRowingBoat("white")),
    small("sailboat moored", buildSailboat("moored")),
    small("sailboat sailing", buildSailboat("sailing")),
    small("bale wrapped", buildWrappedBale()),
    small("bale hay", buildHayBale()),
    ...(["grazing", "standing"] as const).map((pose) => ({ name: `sheep ${pose}`, limit: 200, farLimit: 24, model: buildSheep(pose) })),
    ...(["grazing", "standing", "lying"] as const).map((pose) => ({ name: `cow ${pose}`, limit: 380, farLimit: 32, model: buildCow(pose) })),
  ];
}

// The walls' sections each run on past both ends, so one starts its own length less both overlaps after the last.
const LAID: Record<string, ArtModel["laid"]> = {
  "stone wall": { alongM: (STONE_WALL_M * STONE_WALL_M) / (STONE_WALL_M + 2 * STONE_WALL_OVERLAP_M), flips: true },
  "jetty section": { alongM: JETTY_SECTION.lengthM },
  "pier section": { alongM: PIER_SECTION.lengthM },
  "pontoon section": { alongM: PONTOON_SECTION.lengthM },
};

export const artModels = (): ArtModel[] => catalogue().map(({ name, model }) => ({ ...nearFar(name, model), laid: LAID[name] }));
