import { nearFar, type ArtModel } from "../catalogue";
import { identityMaterials } from "../identity/material";
import { LIGHTHOUSES } from "./index";
import { buildTurbineRotor, buildTurbineTower, HUB_M } from "./turbine";

export const artModels = (): ArtModel[] => [
  ...Object.entries(LIGHTHOUSES).map(([id, { build }]) => nearFar(id, build(), identityMaterials)),
  nearFar("turbine", buildTurbineTower(), identityMaterials),
  // Built round its hub, so its ground is the hub's height below.
  { ...nearFar("turbine rotor", buildTurbineRotor(), identityMaterials), groundY: -HUB_M, onGround: false },
];
