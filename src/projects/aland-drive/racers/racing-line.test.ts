import { describe, expect, it } from "vitest";
import { curvatureOf, EDGE_MARGIN_M, middleLine, racingLine, type CorridorSample } from "./racing-line";
import { ROUTE_STEP_M } from "./route-plan";

/*
 * The racing line through a made-up corridor: a straight into a right-angle
 * bend of 30 m radius and out along another straight, 4.5 m either side of the
 * middle. The line must stay inside the edges less the car's room, and take the
 * bend wider than the middle does, which is the whole point of it.
 */

const HALF_WIDTH_M = 4.5;
const CAR_HALF_M = 0.9;
const BEND_RADIUS_M = 30;

/** The corners of a straight south, a quarter circle to the left and a straight east. */
function bend(): [number, number][] {
  const corners: [number, number][] = [[0, 0]];
  // The arc's centre is east of the straight's end by its radius: from (0, 300) round to (30, 330).
  for (let step = 0; step <= 12; step++) {
    const angle = (step / 12) * (Math.PI / 2);
    corners.push([BEND_RADIUS_M - BEND_RADIUS_M * Math.cos(angle), 300 + BEND_RADIUS_M * Math.sin(angle)]);
  }
  corners.push([330, 330]);
  return corners;
}

/** A corridor along a polyline of corners, sampled every `ROUTE_STEP_M`, each sample's right vector from its neighbours. */
function corridorAlong(corners: [number, number][], halfWidthM = HALF_WIDTH_M): CorridorSample[] {
  const centres: { x: number; z: number }[] = [];
  for (let leg = 0; leg + 1 < corners.length; leg++) {
    const [fromX, fromZ] = corners[leg];
    const [toX, toZ] = corners[leg + 1];
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    for (let along = 0; along < length; along += ROUTE_STEP_M) centres.push({ x: fromX + ((toX - fromX) * along) / length, z: fromZ + ((toZ - fromZ) * along) / length });
  }
  return centres.map(({ x, z }, index) => {
    const before = centres[Math.max(0, index - 1)];
    const after = centres[Math.min(centres.length - 1, index + 1)];
    const run = Math.hypot(after.x - before.x, after.z - before.z) || 1;
    return { x, y: 0, z, rightX: -(after.z - before.z) / run, rightZ: (after.x - before.x) / run, leftM: halfWidthM, rightM: halfWidthM, paved: true, bridged: false };
  });
}

describe("the racing line", () => {
  // South 300 m, a quarter circle to the left, then east 300 m (east is +x; the way south is +z).
  const corridor = corridorAlong(bend());

  it("stays inside the carriageway's edges less the car's room, and starts and ends on the middle", () => {
    const { offsets } = racingLine(corridor, CAR_HALF_M);
    const room = HALF_WIDTH_M - CAR_HALF_M - EDGE_MARGIN_M;
    for (const offset of offsets) expect(Math.abs(offset)).toBeLessThanOrEqual(room + 1e-9);
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBe(0);
  });

  it("takes the bend wider than the middle: outside in, apex at the inside, outside out", () => {
    const { line, offsets } = racingLine(corridor, CAR_HALF_M);
    const middle = middleLine(corridor);
    const peak = (curvature: Float64Array) => Math.max(...curvature);
    expect(peak(curvatureOf(line, ROUTE_STEP_M))).toBeLessThan(peak(curvatureOf(middle, ROUTE_STEP_M)) * 0.8);
    // The bend turns left, so the line is right of the middle going in, left of it at the apex, and right of it going out.
    const apex = Math.round((300 + (Math.PI / 4) * BEND_RADIUS_M) / ROUTE_STEP_M);
    expect(offsets[apex - 20]).toBeGreaterThan(0);
    expect(offsets[apex]).toBeLessThan(0);
    expect(offsets[apex + 20]).toBeGreaterThan(0);
  });

  it("is the middle itself where there is no room: a corridor a car's width wide", () => {
    const narrow = corridorAlong(
      [
        [0, 0],
        [0, 200],
        [200, 200],
      ],
      CAR_HALF_M + EDGE_MARGIN_M,
    );
    const { offsets } = racingLine(narrow, CAR_HALF_M);
    for (const offset of offsets) expect(Math.abs(offset)).toBe(0);
  });
});
