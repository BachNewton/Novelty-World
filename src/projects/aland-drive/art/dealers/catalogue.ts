import type { ArtModel } from "../catalogue";
import { buildExterior, EXTERIOR_IDS } from "./exteriors";
import { buildInterior, INTERIOR_IDS } from "./interiors";
import { geometryOf } from "./material";
import { yachtInterior } from "./yacht/interior";

/** Every dealership the gallery shows, outside and in. Their cars are `art/cars`'. */
export const artModels = (): ArtModel[] => [
  ...EXTERIOR_IDS.map((id) => ({ name: `exterior ${id}`, geometries: { exterior: geometryOf(buildExterior(id).soup) } })),
  ...INTERIOR_IDS.map((id) => ({ name: `interior ${id}`, geometries: { interior: geometryOf(buildInterior(id).soup) }, groundY: null })),
  { name: "interior yacht", geometries: { interior: geometryOf(yachtInterior().room) }, groundY: null },
  { name: "interior yacht turntable", geometries: { turntable: geometryOf(yachtInterior().turntables[0].soup) }, groundY: null },
];
