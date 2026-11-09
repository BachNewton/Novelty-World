import { Mesh } from "three/webgpu";
import type { CarId } from "../../sim/cars";
import type { ArtModel } from "../catalogue";
import { buildExterior, EXTERIOR_IDS } from "./exteriors";
import { buildInterior, INTERIOR_IDS } from "./interiors";
import { dealerMaterial, geometryOf } from "./material";
import { standingCar } from "./standing-car";

/** Where a model swaps until the LOD check has measured it: `render/dealers.ts` reads what it measured. */
const KIT_SWAP_M = 300;
const KIT_CAR_SWAP_M = 100;
const REACH_M = 6000;
const CAR_REACH_M = 900;

/**
 * Every dealership the gallery shows, outside, as the game draws it near and far, and in; and each kind of car standing
 * on a forecourt, as its two details. Their cars' own art is `art/cars`'.
 */
export const artModels = (): ArtModel[] => {
  const exteriors = EXTERIOR_IDS.map((id): ArtModel => {
    const [near, far] = [geometryOf(buildExterior(id, "near").soup), geometryOf(buildExterior(id, "far").soup)];
    return {
      name: `exterior ${id}`,
      geometries: { near, far },
      drawn: { model: { near, far, swapM: KIT_SWAP_M, reachM: REACH_M }, place: (version, _swapM, { sun, hazed, season }) => [new Mesh(version === "near" ? near : far, dealerMaterial({ kind: "sun", sun, season }, hazed))] },
    };
  });
  const forecourt = [...new Set(EXTERIOR_IDS.flatMap((id) => buildExterior(id).slots.map(({ car }) => car)))].sort();
  const cars = forecourt.map((car: CarId): ArtModel => {
    // Only the geometry is measured: the pieces are made again for each drawing, in the light it's given.
    const [near, far] = (["hero", "far"] as const).map((detail) => standingCar(car, detail, { azimuthDeg: 215, elevationDeg: 40 }, (colour) => colour)[0].geometry);
    return {
      name: `forecourt ${car}`,
      // Its faces are the car's own, which `art/cars` checks part by part.
      geometries: {},
      drawn: { model: { near, far, swapM: KIT_CAR_SWAP_M, reachM: CAR_REACH_M }, place: (version, _swapM, { sun, hazed }) => standingCar(car, version === "near" ? "hero" : "far", sun, hazed) },
    };
  });
  const interiors = INTERIOR_IDS.map((id): ArtModel => ({ name: `interior ${id}`, geometries: { interior: geometryOf(buildInterior(id).soup) }, groundY: null }));
  return [...exteriors, ...cars, ...interiors];
};
