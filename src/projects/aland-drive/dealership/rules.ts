import { CARS } from "../art/cars/specs";
import type { CarSpec } from "../art/cars/build";
import type { CarId } from "../sim/cars";
import { MOST_LAMPS, type DealerInterior, type Spot } from "./interior";
import { boxCorners, insideOutline, outlineClearance, solidDistance, type PlanBox } from "./plan";
import { stockOf } from "./stock";

/*
 * The rules every room keeps (`dealership/CLAUDE.md`), as a list of what breaks them, and the plan of the cars as they
 * stand: what the walk collides with and what a player stands at to rev, sit in or take a car.
 */

/** Room the player needs between a car and anything else to walk past it. */
export const CLEARANCE_M = 0.1;

export function carSpec(id: CarId): CarSpec {
  const spec = CARS.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`no art for ${id}`);
  return spec;
}

/** A car's footprint on the plan where it stands, nose to tail and side to side. */
export function carBox(spec: CarSpec, { at, yaw }: Pick<Spot, "at" | "yaw">): PlanBox {
  const zs = spec.body.silhouette.map(({ z }) => z);
  const [nose, tail] = [Math.min(...zs), Math.max(...zs)];
  const middle = (nose + tail) / 2;
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return { centre: [at[0] + middle * s, at[2] + middle * c], half: [spec.shadowHalf[0], (tail - nose) / 2], yaw };
}

/** The furthest a car reaches from the middle of its spot, as it turns on a turntable. */
export function carReach(spec: CarSpec): number {
  const zs = spec.body.silhouette.map(({ z }) => Math.abs(z));
  return Math.hypot(Math.max(...zs), spec.shadowHalf[0]);
}

/** The cars standing in a room: its stock on its spots, in order, as many as it has spots for. */
export function carsOnSpots(interior: DealerInterior): { id: CarId; spot: Spot }[] {
  return stockOf(interior.stock)
    .slice(0, interior.spots.length)
    .map((id, index) => ({ id, spot: interior.spots[index] }));
}

/** What's wrong with a room, by the definition's rules: an empty list for a room that keeps them. */
export function brokenRules(interior: DealerInterior): string[] {
  const broken: string[] = [];
  const { floor, solids, spots, door, viewFrom, light, windows } = interior;
  const stock = stockOf(interior.stock);
  if (stock.length > spots.length) broken.push(`${stock.length} cars in stock and ${spots.length} spots`);
  if (light.lamps.length > MOST_LAMPS) broken.push(`${light.lamps.length} lamps, more than ${MOST_LAMPS}`);
  if (!insideOutline(floor, viewFrom[0], viewFrom[2])) broken.push("the view is taken from outside the floor");
  if (outlineClearance(floor, door.at[0], door.at[1]) < 0.3) broken.push("the door isn't inside the floor");
  for (const solid of solids) if (solidDistance(solid, door.at[0], door.at[1]) < 0.3) broken.push("the door is in a solid");
  windows.forEach(({ corners: [a, b, c, d] }, index) => {
    const normal = cross(sub(b, a), sub(c, a));
    if (Math.abs(dot(normal, sub(d, a))) > 1e-3 * Math.hypot(...normal)) broken.push(`window ${index} isn't flat`);
  });

  const cars = carsOnSpots(interior).map(({ id, spot }) => ({ id, spot, box: carBox(carSpec(id), spot) }));
  for (const { id, spot, box } of cars) {
    if (spot.turntable !== undefined) {
      const table = interior.turntables[spot.turntable];
      if (Math.hypot(table.centre[0] - spot.at[0], table.centre[2] - spot.at[2]) > 1e-6) broken.push(`${id}'s spot isn't on its turntable's centre`);
      const reach = carReach(carSpec(id)) + CLEARANCE_M;
      if (outlineClearance(floor, spot.at[0], spot.at[2]) < reach) broken.push(`${id} turns into the wall`);
      for (const solid of solids) if (solidDistance(solid, spot.at[0], spot.at[2]) < reach) broken.push(`${id} turns into a solid`);
    }
    for (const [x, z] of boxCorners(box)) if (outlineClearance(floor, x, z) < CLEARANCE_M) broken.push(`${id} stands through the wall`);
    for (const solid of solids) if (boxesMeet(box, solid, CLEARANCE_M)) broken.push(`${id} stands in a solid`);
    if (boxesMeet(box, { kind: "round", centre: door.at, radiusM: 0.3 }, CLEARANCE_M)) broken.push(`${id} stands in the door`);
  }
  cars.forEach((a, first) => {
    cars.forEach((b, second) => {
      if (second <= first) return;
      const turning = [a, b].find(({ spot }) => spot.turntable !== undefined);
      const other = turning === a ? b : a;
      const meet = turning ? boxCorners(other.box).some(([x, z]) => Math.hypot(x - turning.spot.at[0], z - turning.spot.at[2]) < carReach(carSpec(turning.id)) + CLEARANCE_M) : boxesMeet(a.box, b.box, CLEARANCE_M);
      if (meet) broken.push(`${a.id} and ${b.id} stand in each other`);
    });
  });
  return broken;
}

type Shape = PlanBox | Parameters<typeof solidDistance>[0];

/** Whether two shapes come within `gap` of each other, judged by each one's corners against the other. */
function boxesMeet(a: PlanBox, b: Shape, gap: number): boolean {
  if ("kind" in b && b.kind === "round") return solidDistance(a, b.centre[0], b.centre[1]) < b.radiusM + gap;
  const other: PlanBox = "kind" in b ? { centre: b.centre, half: b.half, yaw: b.yaw ?? 0 } : b;
  const edges = (box: PlanBox) => {
    const corners = boxCorners(box);
    // Each side's middle as well as its corners: two boxes crossed like a plus meet with no corner inside the other.
    return [...corners, ...corners.map(([x, z], index) => [(x + corners[(index + 1) % 4][0]) / 2, (z + corners[(index + 1) % 4][1]) / 2] as const)];
  };
  return edges(a).some(([x, z]) => solidDistance(other, x, z) < gap) || edges(other).some(([x, z]) => solidDistance(a, x, z) < gap);
}

type Vec = readonly [number, number, number];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
