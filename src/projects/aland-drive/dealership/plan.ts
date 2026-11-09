import type { PlanOutline, PlanPoint, Solid } from "./interior";

/*
 * Geometry on a room's floor plan, x and z: what the walk collides with and what the rules check. Every shape is a
 * convex box or a circle or the floor's outline, so a point's way out of one is found exactly, with no search.
 */

/** A box on the plan: centre, half its size along its own axes, and its yaw (anticlockwise from above). */
export interface PlanBox {
  centre: PlanPoint;
  half: PlanPoint;
  yaw: number;
}

/** A point in a box's own axes. */
function intoBox({ centre, yaw }: PlanBox, x: number, z: number): [number, number] {
  const [dx, dz] = [x - centre[0], z - centre[1]];
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  // A yaw turns +x towards -z seen from above, so undoing it turns the other way.
  return [dx * c - dz * s, dx * s + dz * c];
}

function outOfBox({ centre, yaw }: PlanBox, u: number, v: number): [number, number] {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return [centre[0] + u * c + v * s, centre[1] - u * s + v * c];
}

/** The box's corners on the plan, in order round it. */
export function boxCorners(box: PlanBox): PlanPoint[] {
  const [hx, hz] = box.half;
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([u, v]) => outOfBox(box, u, v));
}

/** How far a point is from a box's edge, negative inside. */
export function boxDistance(box: PlanBox, x: number, z: number): number {
  const [u, v] = intoBox(box, x, z);
  const [ox, oz] = [Math.abs(u) - box.half[0], Math.abs(v) - box.half[1]];
  return Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) + Math.min(Math.max(ox, oz), 0);
}

/** A point pushed out of a box by `radius`, or left where it is if it's already that clear. */
function clearOfBox(box: PlanBox, x: number, z: number, radius: number): [number, number] {
  const [u, v] = intoBox(box, x, z);
  const [hx, hz] = [box.half[0] + radius, box.half[1] + radius];
  const [ox, oz] = [Math.abs(u) - box.half[0], Math.abs(v) - box.half[1]];
  if (ox > 0 && oz > 0) {
    // Off a corner: round the corner by the radius.
    const d = Math.hypot(ox, oz);
    if (d >= radius) return [x, z];
    const k = radius / d;
    return outOfBox(box, Math.sign(u) * (box.half[0] + ox * k), Math.sign(v) * (box.half[1] + oz * k));
  }
  if (Math.abs(u) >= hx || Math.abs(v) >= hz) return [x, z];
  // Inside the grown box: out by the nearer side.
  return hx - Math.abs(u) < hz - Math.abs(v) ? outOfBox(box, Math.sign(u || 1) * hx, v) : outOfBox(box, u, Math.sign(v || 1) * hz);
}

export const solidBox = (solid: Extract<Solid, { kind: "box" }>): PlanBox => ({ centre: solid.centre, half: solid.half, yaw: solid.yaw ?? 0 });

/** How far a point is from a solid's edge, negative inside. */
export function solidDistance(solid: Solid | PlanBox, x: number, z: number): number {
  if ("kind" in solid) return solid.kind === "round" ? Math.hypot(x - solid.centre[0], z - solid.centre[1]) - solid.radiusM : boxDistance(solidBox(solid), x, z);
  return boxDistance(solid, x, z);
}

function clearOfSolid(solid: Solid | PlanBox, x: number, z: number, radius: number): [number, number] {
  if ("kind" in solid && solid.kind === "round") {
    const [dx, dz] = [x - solid.centre[0], z - solid.centre[1]];
    const d = Math.hypot(dx, dz);
    const reach = solid.radiusM + radius;
    if (d >= reach) return [x, z];
    if (d === 0) return [solid.centre[0] + reach, solid.centre[1]];
    return [solid.centre[0] + (dx / d) * reach, solid.centre[1] + (dz / d) * reach];
  }
  return clearOfBox("kind" in solid ? solidBox(solid) : solid, x, z, radius);
}

/** Whether a point is inside an outline, by the even-odd rule. */
export function insideOutline(outline: PlanOutline, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The nearest point on a segment. */
function nearestOn([ax, az]: PlanPoint, [bx, bz]: PlanPoint, x: number, z: number): [number, number] {
  const [dx, dz] = [bx - ax, bz - az];
  const length2 = dx * dx + dz * dz;
  const t = length2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / length2));
  return [ax + t * dx, az + t * dz];
}

/** How far a point is from the outline's edge, negative outside it. */
export function outlineClearance(outline: PlanOutline, x: number, z: number): number {
  let nearest = Infinity;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [nx, nz] = nearestOn(outline[j], outline[i], x, z);
    nearest = Math.min(nearest, Math.hypot(x - nx, z - nz));
  }
  return insideOutline(outline, x, z) ? nearest : -nearest;
}

/** A point kept `radius` inside the outline, pushed in from every edge it's too near. */
function inOutline(outline: PlanOutline, x: number, z: number, radius: number): [number, number] {
  let [px, pz] = [x, z];
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [nx, nz] = nearestOn(outline[j], outline[i], px, pz);
    const [dx, dz] = [px - nx, pz - nz];
    const d = Math.hypot(dx, dz);
    const inside = insideOutline(outline, px, pz);
    if (inside && d >= radius) continue;
    // The edge's inward side: its normal towards the inside.
    const [ex, ez] = [outline[i][0] - outline[j][0], outline[i][1] - outline[j][1]];
    const length = Math.hypot(ex, ez);
    let [ix, iz] = [-ez / length, ex / length];
    if (!insideOutline(outline, nx + ix * 1e-3, nz + iz * 1e-3)) [ix, iz] = [-ix, -iz];
    [px, pz] = [nx + ix * radius, nz + iz * radius];
  }
  return [px, pz];
}

/** Where a body of `radius` ends up wanting to stand at `x`, `z`: inside the floor and clear of every solid. */
export function settle(floor: PlanOutline, solids: readonly (Solid | PlanBox)[], x: number, z: number, radius: number): [number, number] {
  let [px, pz] = [x, z];
  // Solids can stand close enough to push a body back and forth; a few rounds settle it in any corner a room has.
  for (let round = 0; round < 4; round++) {
    for (const solid of solids) [px, pz] = clearOfSolid(solid, px, pz, radius);
    [px, pz] = inOutline(floor, px, pz, radius);
  }
  return [px, pz];
}
