import { nearFar, type ArtModel } from "../catalogue";
import { buildFountain, buildHedge } from "./models";

/** Every model the town ground gallery stands on its surface. */
export const artModels = (): ArtModel[] => [nearFar("hedge", buildHedge()), nearFar("fountain", buildFountain())];
