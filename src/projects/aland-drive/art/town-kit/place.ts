import type { Placement } from "../roadside/material";
import { CARS } from "../cars/specs";
import type { ParkedCar } from "../street/parked";
import type { LinePoint } from "../street/place";
import type { SignalPlacement } from "./material";

/*
 * Rules for what OSM doesn't map, with no renderer in them, so a tile's worker can run them. What's on OSM goes
 * through the street kit's `rowAlong` and plain placements.
 */

/** From a junction's centre, a road leaving it: a unit way on the ground. */
export interface JunctionArm {
  dx: number;
  dz: number;
}

export interface SignalLayout {
  /** How far back from the centre the stop line is. */
  backM: number;
  /** From the road's middle to the pole, to the right of the traffic coming in. */
  kerbM: number;
}

/**
 * A signalled junction's heads: one a road, to the right of its incoming traffic, facing it. Arms are paired by the way
 * they run, so two ends of one road share a start and a crossing road is half a cycle round.
 */
export function signalsAtJunction({ x, y, z }: LinePoint, arms: readonly JunctionArm[], { backM, kerbM }: SignalLayout): SignalPlacement[] {
  const first = arms.at(0);
  if (first === undefined) return [];
  return arms.map(({ dx, dz }) => {
    // Inbound traffic runs against the arm; its right, with north -z, is the arm's way turned a quarter one way.
    const [rightX, rightZ] = [dz, -dx];
    const sameRoad = Math.abs(dx * first.dx + dz * first.dz) > Math.SQRT1_2;
    return { x: x + dx * backM + rightX * kerbM, y, z: z + dz * backM + rightZ * kerbM, yaw: Math.atan2(dx, dz), phase: sameRoad ? 0 : 0.5 };
  });
}

/** Add-ons at a regular spacing along a wall's foot, up it by `heightM` and turned out of it, on the side given. For hanging lamps and window boxes. */
export function alongWall(from: LinePoint, to: LinePoint, { spacingM, heightM, outward }: { spacingM: number; heightM: number; outward: 1 | -1 }): Placement[] {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const count = Math.floor(length / spacingM);
  const [dx, dz] = [(to.x - from.x) / length, (to.z - from.z) / length];
  const [outX, outZ] = [-dz * outward, dx * outward];
  return Array.from({ length: count }, (_, index) => {
    const along = (index + 0.5) * (length / count);
    return { x: from.x + dx * along, y: from.y + (to.y - from.y) * (along / length) + heightM, z: from.z + dz * along, yaw: Math.atan2(outX, outZ) };
  });
}

/** Bicycles side by side from a spot, each square to the row and a little out of true, for a rack or a shop's front. */
export function bikeRow({ x, y, z }: LinePoint, { yaw, count, spacingM }: { yaw: number; count: number; spacingM: number }): Placement[] {
  const [alongX, alongZ] = [Math.cos(yaw), -Math.sin(yaw)];
  return Array.from({ length: count }, (_, index) => ({ x: x + alongX * index * spacingM, y, z: z + alongZ * index * spacingM, yaw: yaw + Math.PI / 2 + ((index * 7) % 5) * 0.012 }));
}

/** The cars kit's van, its far model joined and parked as any car is: a white one at a loading spot, for `placeParkedCars`. */
export function deliveryVan({ x, y, z }: LinePoint, yaw: number): ParkedCar {
  const car = CARS.findIndex(({ name }) => name === "Kobb");
  if (car < 0) throw new Error("the cars kit has no van");
  return { x, y, z, yaw, car, paint: "car-paint-white" };
}
