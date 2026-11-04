import { nearFar, type ArtModel } from "../catalogue";
import { buildBench, buildBikeRack, buildBin, buildBollard, buildCafeSet, buildFlagpole, buildGrassTuft, buildGuardRail, buildGuardRailEnd, buildGuardRailReturn, buildHarbourCrane, buildLinden, buildMidsummerPole, buildParasol, buildPlanter, buildPlanterRound, buildReflectorPost, buildSailboat, buildSeedGrass, buildWildflowers, type Wildflower } from "./index";

const FLOWERS: Wildflower[] = ["daisy", "buttercup", "lupine", "fireweed", "cow-parsley"];

/** Every model the street gallery shows. */
export const artModels = (): ArtModel[] => [
  nearFar("guard rail", buildGuardRail()),
  nearFar("guard rail end", buildGuardRailEnd()),
  nearFar("guard rail return", buildGuardRailReturn()),
  nearFar("reflector post", buildReflectorPost()),
  nearFar("grass tuft", buildGrassTuft(3)),
  nearFar("grass tuft short", buildGrassTuft(9, 0.95)),
  nearFar("seed grass", buildSeedGrass(11)),
  ...FLOWERS.map((kind) => nearFar(`wildflowers ${kind}`, buildWildflowers(kind))),
  ...[3, 8, 14].map((seed) => nearFar(`linden ${seed}`, buildLinden(seed))),
  nearFar("bench", buildBench()),
  nearFar("bin", buildBin()),
  nearFar("bike rack", buildBikeRack()),
  nearFar("café set", buildCafeSet()),
  nearFar("parasol", buildParasol()),
  nearFar("planter", buildPlanter()),
  nearFar("planter round", buildPlanterRound()),
  nearFar("flagpole Finland", buildFlagpole("finland")),
  nearFar("flagpole Åland", buildFlagpole("aland")),
  nearFar("midsummer pole", buildMidsummerPole()),
  nearFar("bollard", buildBollard()),
  nearFar("harbour crane", buildHarbourCrane()),
  nearFar("sailboat", buildSailboat()),
];
