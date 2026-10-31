import { CARS } from "../cars/specs";
import { groundY, SAG_M, type CarSpec } from "../cars/build";
import type { CarState } from "../../sim/car-state";
import { buildExterior, EXTERIOR_IDS, type CarSlot, type Exterior, type ExteriorId } from "./exteriors";
import type { Interior, InteriorId } from "./interiors";

/*
 * Dealerships: three brands, three showrooms with interiors, a used lot and a tyre shop. Nothing here is wired into the
 * game. An exterior is a mesh for the world, `geometryOf(exterior.soup)` drawn with `dealerMaterial({ kind: "sun", sun })`
 * and put at one of `DEALER_SITES`. An interior is a scene of its own, loaded by `loadInterior` only on entering, drawn
 * with `dealerMaterial(interior.lighting)`.
 */

export { BRANDS, BRAND_IDS, type Brand, type BrandId } from "./brands";
export { buildExterior, EXTERIOR_IDS, type CarSlot, type Exterior, type ExteriorId };
export { dealerMaterial, geometryOf, type Lighting, type RoomLight } from "./material";
export type { CameraKind, FixedCamera, Interior, InteriorId, Turntable } from "./interiors";
export type { Soup } from "./shell";

/** Interiors stay out of the first download: this is the only way in. */
export async function loadInterior(id: InteriorId): Promise<Interior> {
  const { buildInterior } = await import("./interiors");
  return buildInterior(id);
}

export function carNamed(name: string): CarSpec {
  const spec = CARS.find((candidate) => candidate.name === name);
  if (spec === undefined) throw new Error(`no car called ${name}`);
  return spec;
}

/** A car standing still on a floor at `at`: what `createCarModel`'s `draw` takes. */
export function restingCar(spec: CarSpec, at: CarSlot["at"], yaw: number): CarState {
  const half = yaw / 2;
  return {
    position: [at[0], at[1] - groundY(spec.wheel.radiusM), at[2]],
    rotation: [0, Math.sin(half), 0, Math.cos(half)],
    velocity: [0, 0, 0],
    spin: [0, 0, 0],
    steer: 0,
    suspension: [SAG_M, SAG_M, SAG_M, SAG_M],
    roll: 0,
  };
}

export interface DealerSite {
  id: ExteriorId;
  /** Scene metres: east is +x, north is -z. */
  x: number;
  z: number;
  /** Turns the model's +z, its street side, towards the road. */
  yaw: number;
  place: string;
  road: string;
  why: string;
}

/**
 * Where each stands, from OSM's `shop=car`, `shop=car_repair`, `shop=tyres` and `amenity=fuel` nodes, moved on to the
 * game's grid. Real businesses stand at most of these, so a site names a place and a road, never a firm, and sits
 * on a plot the game's own building data may already hold: a placement has to hide the solid under it.
 */
export const DEALER_SITES: readonly DealerSite[] = [
  { id: "village-garage", x: 11025, z: -5851, yaw: -2.97, place: "Sund", road: "Sundsvägen, the main road east past Kastelholm", why: "a fuel node, 41 m off the road and 23 m clear of any building, so the yard fits" },
  { id: "town-dealer", x: -2129, z: 4391, yaw: 1.91, place: "Mariehamn's north edge", road: "Nya Godbyvägen, the main road into town", why: "the middle of the town's strip of car businesses, on the primary road" },
  { id: "waterfront-showroom", x: -3025, z: 6093, yaw: -2.21, place: "Mariehamn, Västerhamn side", road: "Sjöpromenaden", why: "open shore 19 m from the water with no building for 200 m; the back of the pier needs checking against the real shore" },
  { id: "used-lot", x: -1727, z: 2583, yaw: -0.38, place: "Mariehamn's north edge", road: "Dalvägen", why: "a shop=car node among the industrial plots" },
  { id: "tyre-shop", x: -1905, z: 2878, yaw: -0.07, place: "Mariehamn's north edge", road: "Michaelsvägen", why: "a shop=tyres node on the secondary road" },
];
