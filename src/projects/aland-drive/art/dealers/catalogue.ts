import { nearFar, type ArtModel } from "../catalogue";
import { buildExterior, EXTERIOR_IDS } from "./exteriors";
import { buildInterior, INTERIOR_IDS } from "./interiors";
import { geometryOf } from "./material";
import { buildYacht } from "./yacht/hull";
import { yachtInterior } from "./yacht/interior";
import { yachtMaterials } from "./yacht/material";

/** Every dealership the gallery shows, outside and in, and the yacht, whose hull is a boat. Their cars are `art/cars`'. */
export const artModels = (): ArtModel[] => [
  ...EXTERIOR_IDS.filter((id) => id !== "yacht").map((id) => ({ name: `exterior ${id}`, geometries: { exterior: geometryOf(buildExterior(id).soup) } })),
  ...INTERIOR_IDS.map((id) => ({ name: `interior ${id}`, geometries: { interior: geometryOf(buildInterior(id).soup) }, groundY: null })),
  nearFar("yacht", buildYacht(), yachtMaterials),
  { name: "interior yacht", geometries: { interior: geometryOf(yachtInterior().room) }, groundY: null },
  { name: "interior yacht turntable", geometries: { turntable: geometryOf(yachtInterior().turntables[0].soup) }, groundY: null },
];
