import { CARS } from "../cars/specs";
import { groundY, type CarSpec } from "../cars/build";
import { LAMPS_OFF, type CarState } from "../../sim/car-state";
import type { CarId } from "../../sim/cars";
import { buildExterior, EXTERIOR_IDS, type CarSlot, type Exterior, type ExteriorId, type Rectangle } from "./exteriors";
import type { Interior, InteriorId } from "./interiors";

/*
 * The places that sell cars (`ideas/cars.md`, "Dealers"): the town dealer, the premium showroom, the village garage and
 * the used lot, with the tyre shop as part of the street. An exterior stands in the world at its site (`sites.ts`),
 * drawn by `render/dealers.ts` with `dealerMaterial` in the world's light. An interior is a scene of its own, loaded by
 * `loadInterior` only on entering, drawn with `dealerMaterial(interior.lighting)`.
 */

export { BRANDS, BRAND_IDS, brandOf, type Brand, type BrandId } from "./brands";
export { buildExterior, EXTERIOR_IDS, type CarSlot, type Exterior, type ExteriorId, type Rectangle };
export { dealerMaterial, geometryOf, type Lighting, type Outdoors, type RoomLight } from "./material";
export type { CameraKind, FixedCamera, Interior, InteriorId, Turntable } from "./interiors";
export type { Soup, Version } from "./shell";
export { DEALER_SITES, onSite, siteOf, type DealerSite } from "./sites";
export { SELLER_IDS, SELLER_MAKERS, stockOf, type SellerId } from "./stock";

/** Interiors stay out of the first download: this is the only way in. */
export async function loadInterior(id: InteriorId): Promise<Interior> {
  const { buildInterior } = await import("./interiors");
  return buildInterior(id);
}

export function carSpecOf(id: CarId): CarSpec {
  const spec = CARS.find((candidate) => candidate.id === id);
  if (spec === undefined) throw new Error(`no art for the car ${id}`);
  return spec;
}

/** A car standing still on a floor at `at`: what `createCarModel`'s `draw` takes. */
export function restingCar(spec: CarSpec, at: CarSlot["at"], yaw: number): CarState {
  const half = yaw / 2;
  return {
    position: [at[0], at[1] - groundY(spec), at[2]],
    rotation: [0, Math.sin(half), 0, Math.cos(half)],
    velocity: [0, 0, 0],
    spin: [0, 0, 0],
    steer: 0,
    car: spec.id ?? "skerry-gt",
    suspension: [spec.ride.sagM, spec.ride.sagM, spec.ride.sagM, spec.ride.sagM],
    roll: [0, 0, 0, 0],
    lamps: LAMPS_OFF,
  };
}
