import { nearFar, type ArtModel } from "../catalogue";
import { buildBench, buildBikeRack, buildBin, buildBollard, buildCafeSet, buildFlagpole, buildGrassTuft, buildGuardRail, buildGuardRailEnd, buildGuardRailReturn, buildHarbourCrane, buildLinden, buildMidsummerPole, buildParasol, buildPlanter, buildPlanterRound, buildReflectorPost, buildSailboat, buildSeedGrass, buildWildflowers, type Wildflower } from "./index";
import { streetMaterials } from "./material";

const FLOWERS: Wildflower[] = ["daisy", "buttercup", "lupine", "fireweed", "cow-parsley"];

/** Every model the street gallery shows. */
export const artModels = (): ArtModel[] => [
  { ...nearFar("guard rail", buildGuardRail(), streetMaterials), laid: {} },
  nearFar("guard rail end", buildGuardRailEnd(), streetMaterials),
  nearFar("guard rail return", buildGuardRailReturn(), streetMaterials),
  nearFar("reflector post", buildReflectorPost(), streetMaterials),
  nearFar("grass tuft", buildGrassTuft(3), streetMaterials),
  nearFar("grass tuft short", buildGrassTuft(9, 0.95), streetMaterials),
  nearFar("seed grass", buildSeedGrass(11), streetMaterials),
  ...FLOWERS.map((kind) => nearFar(`wildflowers ${kind}`, buildWildflowers(kind), streetMaterials)),
  ...[3, 8, 14].map((seed) => nearFar(`linden ${seed}`, buildLinden(seed), streetMaterials)),
  nearFar("bench", buildBench(), streetMaterials),
  nearFar("bin", buildBin(), streetMaterials),
  nearFar("bike rack", buildBikeRack(), streetMaterials),
  nearFar("café set", buildCafeSet(), streetMaterials),
  nearFar("parasol", buildParasol(), streetMaterials),
  nearFar("planter", buildPlanter(), streetMaterials),
  nearFar("planter round", buildPlanterRound(), streetMaterials),
  nearFar("flagpole Finland", buildFlagpole("finland"), streetMaterials),
  nearFar("flagpole Åland", buildFlagpole("aland"), streetMaterials),
  nearFar("midsummer pole", buildMidsummerPole(), streetMaterials),
  nearFar("bollard", buildBollard(), streetMaterials),
  nearFar("harbour crane", buildHarbourCrane(), streetMaterials),
  nearFar("sailboat", buildSailboat(), streetMaterials),
];
