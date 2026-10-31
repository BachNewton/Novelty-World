import type { V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { TownPainted, townModel } from "./paint";
import PLAN from "./terminal-plan.json";

/*
 * Västerhamn's terminal: the enclosed walkways on legs, the boarding fingers at the berths and the two car decks, as
 * one model, for what NLS's solid ahvenanmaa_2022_13485 got wrong. That solid has the plan right and the section
 * wrong: it runs its walls to the ground, 470 m of them. So its plan, read against OSM and the 2025 photo, is
 * `terminal-plan.json`, which is also where the pipeline finds the decks' heights.
 *
 * The roads under the walkways are drivable and stay so: a leg's foot is moved along its bent until it's clear of
 * every motor road, and is dropped if it can't be. The terminal building itself is another solid and stays.
 */

/** The solid this replaces, to be dropped by `pipeline/buildings.py`. */
export const FALSE_SOLID = "ahvenanmaa_2022_13485";

export const TERMINAL_ORIGIN = { east: PLAN.origin[0], north: PLAN.origin[1] } as const;

type EastNorth = readonly [number, number];

const toLocal = ([east, north]: readonly number[]): readonly [number, number] => [east - TERMINAL_ORIGIN.east, TERMINAL_ORIGIN.north - north];

const TALL_M = 3.1;
const SILL_M = 1;
const HEAD_M = 2.55;
const BAY_M = 12.5;
const LEG_EVERY_BAYS = 2;
const LEG_M = 0.5;
const CAP_OVERHANG_M = 0.3;
/** A foot's ground: sunk, since the quay's height varies by half a metre and the sea plane hides the rest. */
const FOOT_Y_M = 0.6;
/** How far from a motor road's edge a leg must stand, for a car's width and its mirrors. */
export const LEG_ROAD_CLEAR_M = 1.2;
const FOOT_SEARCH_STEP_M = 0.75;
const FOOT_SEARCH_STEPS = 8;

const lerp = (a: number, b: number, share: number) => a + (b - a) * share;

function distanceToLine(x: number, z: number, line: readonly (readonly [number, number])[]) {
  let best = Infinity;
  for (let at = 0; at + 1 < line.length; at++) {
    const [[ax, az], [bx, bz]] = [line[at], line[at + 1]];
    const [dx, dz] = [bx - ax, bz - az];
    const share = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * share, z - az - dz * share));
  }
  return best;
}

const ROADS = PLAN.motorRoads.map(({ half, line }) => ({ half, line: line.map(toLocal) }));

/** How far a point in the model's plan is from the edge of the nearest motor road: negative is on it. */
export function clearOfRoads(x: number, z: number) {
  return Math.min(...ROADS.map(({ half, line }) => distanceToLine(x, z, line) - half));
}

/** A foot's place along its bent, moved outwards until it's off the roads, or nowhere if the bent gives no room. */
function footAt(x: number, z: number, outX: number, outZ: number): readonly [number, number] | null {
  for (let step = 0; step <= FOOT_SEARCH_STEPS; step++) {
    const [fx, fz] = [x + outX * step * FOOT_SEARCH_STEP_M, z + outZ * step * FOOT_SEARCH_STEP_M];
    if (clearOfRoads(fx, fz) >= LEG_ROAD_CLEAR_M) return [fx, fz];
  }
  return null;
}

interface Corner {
  left: readonly [number, number];
  right: readonly [number, number];
}

/** Both edges of a run at each of its points, mitred at the bends. */
function edgesOf(line: readonly (readonly [number, number])[], wide: number): Corner[] {
  return line.map(([x, z], at) => {
    const [px, pz] = line[Math.max(0, at - 1)];
    const [nx, nz] = line[Math.min(line.length - 1, at + 1)];
    const [inLength, outLength] = [Math.hypot(x - px, z - pz) || 1, Math.hypot(nx - x, nz - z) || 1];
    const [inX, inZ] = at === 0 ? [(nx - x) / outLength, (nz - z) / outLength] : [(x - px) / inLength, (z - pz) / inLength];
    const [outX, outZ] = at === line.length - 1 ? [inX, inZ] : [(nx - x) / outLength, (nz - z) / outLength];
    const [sideX, sideZ] = [-(inZ + outZ), inX + outX];
    const size = Math.hypot(sideX, sideZ) || 1;
    const [ux, uz] = [sideX / size, sideZ / size];
    const miter = (wide / 2) / Math.max(0.5, ux * -inZ + uz * inX);
    return { left: [x + ux * miter, z + uz * miter] as const, right: [x - ux * miter, z - uz * miter] as const };
  });
}

interface Bay {
  a: Corner;
  b: Corner;
  roofA: number;
  roofB: number;
}

function baysOf(corners: readonly Corner[], line: readonly (readonly [number, number])[], [roofFrom, roofTo]: readonly number[], bayM: number): Bay[] {
  const lengths = line.slice(1).map((point, at) => Math.hypot(point[0] - line[at][0], point[1] - line[at][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const bays: Bay[] = [];
  let travelled = 0;
  lengths.forEach((length, segment) => {
    const count = Math.max(1, Math.round(length / bayM));
    const [from, to] = [corners[segment], corners[segment + 1]];
    const at = (bay: number): Corner => {
      const share = bay / count;
      return { left: [lerp(from.left[0], to.left[0], share), lerp(from.left[1], to.left[1], share)], right: [lerp(from.right[0], to.right[0], share), lerp(from.right[1], to.right[1], share)] };
    };
    for (let bay = 0; bay < count; bay++) {
      bays.push({ a: at(bay), b: at(bay + 1), roofA: lerp(roofFrom, roofTo, (travelled + (length * bay) / count) / total), roofB: lerp(roofFrom, roofTo, (travelled + (length * (bay + 1)) / count) / total) });
    }
    travelled += length;
  });
  return bays;
}

function unitBetween(from: readonly [number, number], to: readonly [number, number]): readonly [number, number] {
  const [dx, dz] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dz) || 1;
  return [dx / length, dz / length];
}

function sideFaces(into: TownPainted, a: readonly [number, number], b: readonly [number, number], roofA: number, roofB: number, shade: number, outward?: readonly [number, number]) {
  const [floorA, floorB] = [roofA - TALL_M, roofB - TALL_M];
  const p = (end: readonly [number, number], y: number): V3 => [end[0], y, end[1]];
  into
    .face([p(a, floorA), p(b, floorB), p(b, floorB + SILL_M), p(a, floorA + SILL_M)], "clad-pale", shade)
    .face([p(a, floorA + SILL_M), p(b, floorB + SILL_M), p(b, floorB + HEAD_M), p(a, floorA + HEAD_M)], "terminal-glass", shade)
    .face([p(a, floorA + HEAD_M), p(b, floorB + HEAD_M), p(b, roofB), p(a, roofA)], "clad-pale", shade * 1.03);
  if (outward === undefined) return;
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const length = Math.hypot(dx, dz) || 1;
  const [ux, uz] = [(dx / length) * 0.18, (dz / length) * 0.18];
  const [ox, oz] = [outward[0] * 0.02, outward[1] * 0.02];
  into.face([[a[0] - ux + ox, floorA + SILL_M, a[1] - uz + oz], [a[0] + ux + ox, floorA + SILL_M, a[1] + uz + oz], [a[0] + ux + ox, floorA + HEAD_M, a[1] + uz + oz], [a[0] - ux + ox, floorA + HEAD_M, a[1] - uz + oz]], "clad-grey", shade);
}

const flare = (edge: readonly [number, number], other: readonly [number, number], by: number) => {
  const [ux, uz] = unitBetween(other, edge);
  return [edge[0] + ux * by, edge[1] + uz * by] as const;
};

/** One bent: the legs of a run, framed into a crossbeam under its floor. Its feet are the terminal's only ground contact, so they're returned for the car to collide with. */
function bent(into: TownPainted, { left, right }: Corner, floor: number): EastNorth[] {
  const under = floor - 0.25;
  const [mx, mz] = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
  const half = Math.hypot(left[0] - right[0], left[1] - right[1]) / 2 || 1;
  const [ox, oz] = [(left[0] - mx) / half, (left[1] - mz) / half];
  into.beam([left[0], under, left[1]], [right[0], under, right[1]], 0.45, 0.5, "steel-leg", 0.85);
  const feet: EastNorth[] = [];
  for (const [end, way] of [[left, 1], [right, -1]] as const) {
    const foot = footAt(mx + (ox * way * half) * 0.95, mz + (oz * way * half) * 0.95, ox * way, oz * way);
    if (foot === null) continue;
    into.beam([foot[0], FOOT_Y_M, foot[1]], [end[0], under, end[1]], LEG_M, LEG_M, "steel-leg", 0.92);
    feet.push(foot);
  }
  return feet;
}

function walkway(near: TownPainted, far: TownPainted, line: readonly (readonly [number, number])[], wide: number, roof: readonly number[], legs: boolean, feet: EastNorth[]) {
  const corners = edgesOf(line, wide);
  const bays = baysOf(corners, line, roof, BAY_M);
  bays.forEach(({ a, b, roofA, roofB }, at) => {
    sideFaces(near, a.left, b.left, roofA, roofB, 1, unitBetween(a.right, a.left));
    sideFaces(near, a.right, b.right, roofA, roofB, 0.94, unitBetween(a.left, a.right));
    const eaves = (edge: readonly [number, number], other: readonly [number, number], y: number): V3 => {
      const [x, z] = flare(edge, other, CAP_OVERHANG_M);
      return [x, y, z];
    };
    near
      .face([eaves(a.left, a.right, roofA), eaves(b.left, b.right, roofB), eaves(b.right, b.left, roofB), eaves(a.right, a.left, roofA)], "clad-roof", 1.05)
      .face([[a.left[0], roofA - TALL_M, a.left[1]], [b.left[0], roofB - TALL_M, b.left[1]], [b.right[0], roofB - TALL_M, b.right[1]], [a.right[0], roofA - TALL_M, a.right[1]]], "clad-grey", 0.7);
    if (legs && at % LEG_EVERY_BAYS === 0) feet.push(...bent(near, a, roofA - TALL_M));
  });
  const [first, last] = [corners[0], corners[corners.length - 1]];
  const end = (corner: Corner, y: number) => {
    const [l, r] = [corner.left, corner.right];
    near.face([[l[0], y - TALL_M, l[1]], [r[0], y - TALL_M, r[1]], [r[0], y, r[1]], [l[0], y, l[1]]], "clad-pale", 0.92);
  };
  end(first, roof[0]);
  end(last, roof[1]);
  if (legs) feet.push(...bent(near, last, roof[1] - TALL_M));

  // Far off: the same run as a box with a band of glass, on a third of its legs.
  const coarse = baysOf(corners, line, roof, 1000);
  coarse.forEach(({ a, b, roofA, roofB }) => {
    for (const [from, to, shade] of [[a.left, b.left, 1], [a.right, b.right, 0.94]] as const) {
      sideFaces(far, from, to, roofA, roofB, shade);
    }
    far.face([[a.left[0], roofA, a.left[1]], [b.left[0], roofB, b.left[1]], [b.right[0], roofB, b.right[1]], [a.right[0], roofA, a.right[1]]], "clad-roof", 1.05);
    far.face([[a.left[0], roofA - TALL_M, a.left[1]], [b.left[0], roofB - TALL_M, b.left[1]], [b.right[0], roofB - TALL_M, b.right[1]], [a.right[0], roofA - TALL_M, a.right[1]]], "clad-grey", 0.7);
  });
  bays.forEach(({ a, roofA }, at) => {
    if (!legs || at % (LEG_EVERY_BAYS * 3) !== 1) return;
    const [mx, mz] = [(a.left[0] + a.right[0]) / 2, (a.left[1] + a.right[1]) / 2];
    far.beam([mx, FOOT_Y_M, mz], [mx, roofA - TALL_M, mz], wide * 0.75, 0.6, "steel-leg", 0.85);
  });
}

/** A boarding finger: a short box out from a walkway to where a ship's door comes, with a tower of stairs under its end. */
function finger(near: TownPainted, far: TownPainted, { from, to, wide, roof }: (typeof PLAN.stubs)[number], feet: EastNorth[]) {
  const line = [toLocal(from), toLocal(to)];
  const corners = edgesOf(line, wide);
  const [a, b] = corners;
  sideFaces(near, a.left, b.left, roof, roof, 1);
  sideFaces(near, a.right, b.right, roof, roof, 0.94);
  sideFaces(far, a.left, b.left, roof, roof, 1);
  sideFaces(far, a.right, b.right, roof, roof, 0.94);
  const lid = (into: TownPainted, y: number, part: "clad-roof" | "clad-grey", shade: number) => into.face([[a.left[0], y, a.left[1]], [b.left[0], y, b.left[1]], [b.right[0], y, b.right[1]], [a.right[0], y, a.right[1]]], part, shade);
  lid(near, roof, "clad-roof", 1.05);
  lid(near, roof - TALL_M, "clad-grey", 0.7);
  lid(far, roof, "clad-roof", 1.05);
  near.face([[b.left[0], roof - TALL_M, b.left[1]], [b.right[0], roof - TALL_M, b.right[1]], [b.right[0], roof, b.right[1]], [b.left[0], roof, b.left[1]]], "clad-grey", 0.9);
  feet.push(...bent(near, b, roof - TALL_M));
}

/** A car deck: a steel ribbon on bents up to where a ship's door comes, with a portal over the end that lifts the last span. */
function carDeck(near: TownPainted, far: TownPainted, { stations, wide }: (typeof PLAN.decks)[number], feet: EastNorth[]) {
  const line = stations.map(([east, north]) => toLocal([east, north]));
  const corners = edgesOf(line, wide);
  stations.forEach(([, , y], at) => {
    if (at + 1 >= stations.length) return;
    const nextY = stations[at + 1][2];
    const [a, b] = [corners[at], corners[at + 1]];
    const deck = (into: TownPainted) => into.face([[a.left[0], y, a.left[1]], [b.left[0], nextY, b.left[1]], [b.right[0], nextY, b.right[1]], [a.right[0], y, a.right[1]]], "ramp-deck", 1.05);
    deck(near);
    deck(far);
    for (const [from, to, shade] of [[a.left, b.left, 1], [a.right, b.right, 0.92]] as const) {
      const skirt = (into: TownPainted) => into.face([[from[0], y + 0.05, from[1]], [to[0], nextY + 0.05, to[1]], [to[0], nextY - 0.85, to[1]], [from[0], y - 0.85, from[1]]], "ramp-steel", shade);
      skirt(near);
      skirt(far);
      near.beam([from[0], y + 1.1, from[1]], [to[0], nextY + 1.1, to[1]], 0.08, 0.1, "ramp-rail", 1);
    }
    near.face([[a.left[0], y - 0.85, a.left[1]], [b.left[0], nextY - 0.85, b.left[1]], [b.right[0], nextY - 0.85, b.right[1]], [a.right[0], y - 0.85, a.right[1]]], "ramp-steel", 0.6);
    if (y > 3.5) {
      const under = y - 0.9;
      near.beam([a.left[0], under, a.left[1]], [a.right[0], under, a.right[1]], 0.5, 0.5, "ramp-steel", 0.85);
      for (const [edge, other] of [[a.left, a.right], [a.right, a.left]] as const) {
        const [outX, outZ] = unitBetween(other, edge);
        const foot = footAt(edge[0], edge[1], outX, outZ);
        if (foot === null) continue;
        near.beam([foot[0], FOOT_Y_M, foot[1]], [edge[0], under, edge[1]], LEG_M, LEG_M, "ramp-steel", 0.9);
        feet.push(foot);
      }
    }
  });
  const end = corners[corners.length - 1];
  const topY = stations[stations.length - 1][2];
  const portal = topY + 8.5;
  for (const edge of [end.left, end.right]) {
    near.beam([edge[0], FOOT_Y_M, edge[1]], [edge[0], portal, edge[1]], 0.8, 0.8, "ramp-rail", 0.95);
    far.beam([edge[0], FOOT_Y_M, edge[1]], [edge[0], portal, edge[1]], 1, 1, "ramp-rail", 0.95);
  }
  near.beam([end.left[0], portal, end.left[1]], [end.right[0], portal, end.right[1]], 1, 1, "ramp-rail", 0.9, 1.05);
  far.beam([end.left[0], portal, end.left[1]], [end.right[0], portal, end.right[1]], 1, 1, "ramp-rail", 0.9, 1.05);
  for (const edge of [end.left, end.right]) near.beam([edge[0], portal, edge[1]], [edge[0], topY + 1.1, edge[1]], 0.05, 0.05, "frame-dark");
}

/** The mooring dolphins and their catwalk off the south berths. */
function dolphins(near: TownPainted, far: TownPainted) {
  for (const { at, radius } of PLAN.dolphins) {
    const [x, z] = toLocal(at);
    near
      .tube([x, -0.5, z], [x, 2.3, z], radius, 8, { radiusTo: radius, shadeFrom: 0.8, cap: true, shadeTo: 1.05 }, "concrete");
    far.tube([x, -0.5, z], [x, 2.3, z], radius, 5, { cap: true, shadeFrom: 0.8, shadeTo: 1.05 }, "concrete");
  }
  const walk = PLAN.catwalk.map(toLocal);
  for (let at = 0; at + 1 < walk.length; at++) {
    const [[ax, az], [bx, bz]] = [walk[at], walk[at + 1]];
    near.beam([ax, 2.5, az], [bx, 2.5, bz], 1.3, 0.16, "steel-leg", 0.85, 1);
    far.beam([ax, 2.5, az], [bx, 2.5, bz], 1.3, 0.16, "steel-leg", 0.85, 1);
  }
}

function assembled() {
  const near = new TownPainted();
  const far = new TownPainted();
  const feet: EastNorth[] = [];
  for (const { line, wide, roof, stacked } of PLAN.walkways) walkway(near, far, line.map(toLocal), wide, roof, stacked !== true, feet);
  for (const stub of PLAN.stubs) finger(near, far, stub, feet);
  for (const deck of PLAN.decks) carDeck(near, far, deck, feet);
  dolphins(near, far);
  return { near, far, feet };
}

/** Near within 700 m, which is further than any end of it from its origin past the first bend. */
const SWAP_M = 700;
const REACH_M = 3000;

export function buildTerminal(): RoadsideModel {
  const { near, far } = assembled();
  return townModel(near, far, SWAP_M, REACH_M);
}

/** Where its legs stand, in the model's plan. A leg stops a car where a building would: square outlines of `TERMINAL_LEG_M` for the pipeline's walls. */
export function terminalFeet(): readonly EastNorth[] {
  return assembled().feet;
}

export const TERMINAL_LEG_M = LEG_M;

/** The car decks as the road pipeline needs them: which OSM ways each carries and the height to give them along its stations. */
export const TERMINAL_DECKS = PLAN.decks;
