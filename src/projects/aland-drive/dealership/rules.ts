import { CARS } from "../art/cars/specs";
import type { CarSpec } from "../art/cars/build";
import type { CarId } from "../sim/cars";
import { MOST_LAMPS, type DealerInterior, type Solid, type Spot } from "./interior";
import { boxCorners, boxDistance, insideOutline, outlineClearance, solidDistance, type PlanBox } from "./plan";
import { stockOf } from "./stock";

/*
 * The rules every room keeps (`dealership/CLAUDE.md`), as a list of what breaks them, and the plan of the cars as they
 * stand: what the walk collides with and what a player stands at to rev, sit in or take a car.
 */

/** Room the player needs between a car and anything else to walk past it. */
export const CLEARANCE_M = 0.1;
/** The walking body: a circle this wide on the plan. */
export const BODY_RADIUS_M = 0.3;
/** Close enough to a car to rev, sit in or take it: its footprint's edge this near. */
export const AT_CAR_M = 1.2;
/** The plan is walked on a grid this fine to find where the door leads. */
const WALK_CELL_M = 0.1;

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

/** What a car on its spot is to walk round: its footprint, or on a turntable the circle it turns in. */
export function carSolid(spec: CarSpec, spot: Spot): PlanBox | Solid {
  return spot.turntable === undefined ? carBox(spec, spot) : { kind: "round", centre: [spot.at[0], spot.at[2]], radiusM: carReach(spec) };
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
  for (const id of carsOutOfReach(interior)) broken.push(`${id} can't be walked to from the door`);
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

/**
 * How far the body walks from the door to each place it can stand, on a grid over the plan, in metres; Infinity where
 * it can't get. Every solid and car stands in the way, as when walking.
 */
export function walkFromDoor(interior: DealerInterior): { distanceAt: (x: number, z: number) => number } {
  const solids = [...interior.solids, ...carsOnSpots(interior).map(({ id, spot }) => carSolid(carSpec(id), spot))];
  const xs = interior.floor.map(([x]) => x);
  const zs = interior.floor.map(([, z]) => z);
  const [x0, z0] = [Math.min(...xs), Math.min(...zs)];
  const columns = Math.ceil((Math.max(...xs) - x0) / WALK_CELL_M) + 1;
  const rows = Math.ceil((Math.max(...zs) - z0) / WALK_CELL_M) + 1;
  const free = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const [x, z] = [x0 + column * WALK_CELL_M, z0 + row * WALK_CELL_M];
      free[row * columns + column] = outlineClearance(interior.floor, x, z) >= BODY_RADIUS_M && solids.every((solid) => solidDistance(solid, x, z) >= BODY_RADIUS_M) ? 1 : 0;
    }
  }
  const steps = new Float64Array(columns * rows).fill(Infinity);
  const cellOf = (x: number, z: number) => Math.round((z - z0) / WALK_CELL_M) * columns + Math.round((x - x0) / WALK_CELL_M);
  const start = cellOf(...interior.door.at);
  const queue = [start];
  steps[start] = 0;
  // Breadth first, across and diagonally, so a cell's count is the fewest grid steps to it.
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const [column, row] = [cell % columns, Math.floor(cell / columns)];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const [c, r] = [column + dc, row + dr];
      if (c < 0 || r < 0 || c >= columns || r >= rows) continue;
      const next = r * columns + c;
      if (!free[next] || steps[next] !== Infinity) continue;
      steps[next] = steps[cell] + 1;
      queue.push(next);
    }
  }
  return {
    distanceAt: (x, z) => {
      const [column, row] = [Math.round((x - x0) / WALK_CELL_M), Math.round((z - z0) / WALK_CELL_M)];
      if (column < 0 || row < 0 || column >= columns || row >= rows) return Infinity;
      return steps[row * columns + column] * WALK_CELL_M;
    },
  };
}

/** The cars no place the body can walk to from the door is near enough to reach. */
export function carsOutOfReach(interior: DealerInterior): CarId[] {
  const { distanceAt } = walkFromDoor(interior);
  return carsOnSpots(interior)
    .filter(({ id, spot }) => {
      const solid = carSolid(carSpec(id), spot);
      const reach = (x: number, z: number) => ("kind" in solid ? solidDistance(solid, x, z) : boxDistance(solid, x, z));
      const [cx, cz] = [spot.at[0], spot.at[2]];
      const span = carReach(carSpec(id)) + AT_CAR_M;
      for (let x = cx - span; x <= cx + span; x += WALK_CELL_M) {
        for (let z = cz - span; z <= cz + span; z += WALK_CELL_M) {
          if (reach(x, z) < AT_CAR_M && distanceAt(x, z) < Infinity) return false;
        }
      }
      return true;
    })
    .map(({ id }) => id);
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
