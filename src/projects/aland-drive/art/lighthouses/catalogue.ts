import { nearFar, type ArtModel } from "../catalogue";
import { identityMaterials } from "../identity/material";
import { LIGHTHOUSES } from "./index";

export const artModels = (): ArtModel[] => Object.entries(LIGHTHOUSES).map(([id, { build }]) => nearFar(id, build(), identityMaterials));
