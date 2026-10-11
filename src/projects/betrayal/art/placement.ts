import type { Edge } from "../types";
import type { FloorPlan } from "./overlap";
import { BASE_RADIUS, COLOUR_RING, FLOOR_RINGS, INNER, type Stroke } from "./room";

/*
 * The placement solver: places every figure in a room on its free floor. A
 * room gives only its prime place, where the active explorer stands, and
 * any areas it keeps clear beyond its doorways and walking lanes.
 *
 * Figures are placed one at a time: the explorer stepping onto the prime
 * place, then everyone who stood here already, then the newcomers, the
 * large first, then people, then small ones. A figure keeps its place until
 * it moves, unless the explorer stepping onto the prime place crowds it
 * more than it stood crowded before: then it steps aside. A newcomer takes
 * the prime place while it is free, or else the best free place by a simple
 * score (open floor, near the group, off the lanes), among the places that
 * keep it apart from the figures already placed, as far apart as the room
 * allows. Past capacity it degrades in steps, never failing: rings overlap
 * (and figures may stand on the lanes); a large figure takes its crowded
 * pose; then figures stand partly behind each other (and in the keep-clear
 * areas) and the room shows a count badge. A cluster of objects on the
 * floor is placed the same way, as one more size class, but always keeps
 * its place and stays off the doorways, the lanes and the prime place.
 */

/** An object is a cluster of things lying on the floor (`play/things.ts`): it
 *  keeps its place always, and keeps off the doorways, the lanes and the prime place. */
export type SizeClass = "small" | "person" | "large" | "object";
export type Pose = "standing" | "crowded";

/** How crowded a figure stands: 0 apart (rings never touch), 1 rings
 *  overlap (bases apart), 2 partly behind another, 3 wherever is least bad. */
export type Crowding = 0 | 1 | 2 | 3;

export interface PlacingFigure {
  id: string;
  size: SizeClass;
  /** An object cluster's reach from its middle to its outermost plate's edge; one plate's when absent. */
  reach?: number;
}

export interface Placed {
  x: number;
  z: number;
  crowding: Crowding;
  pose: Pose;
}

export interface Placement {
  figures: Record<string, Placed>;
  /** The worst crowding in the room. */
  crowding: Crowding;
  /** How many figures the count badge shows, once figures stand behind each other. */
  badge: number | null;
}

export interface PlacementHints {
  /** Where the active explorer stands; null where the floor has none. */
  prime: readonly [x: number, z: number] | null;
  /** Where no figure stands until figures stand behind each other: the doorways, a signature prop's front. */
  keepClear: readonly Stroke[];
  /** Where figures walk: kept clear until rings overlap, and scored down after. */
  lanes: readonly Stroke[];
  /** The part of the floor figures stand on (one half of a barrier room); null for all of it. */
  within: ((x: number, z: number) => boolean) | null;
}

export const NO_HINTS: PlacementHints = { prime: null, keepClear: [], lanes: [], within: null };

export type PlacementFloor = Pick<FloorPlan, "size" | "clearance" | "reached" | "centre" | "cellAt">;

/** One room's floor (or one side of a barrier room) as the solver takes it. */
export interface PlacementRoom {
  floor: PlacementFloor;
  hints: PlacementHints;
}

/** Each room's floor in the house, for placing figures on it: a side for a barrier room, null for any other. */
export type RoomFloors = (room: string, side: Edge | null) => PlacementRoom;

/** How much floor a figure takes: its base (kept clear of furniture, and of
 *  other bases until they stand behind each other) and its outer mark (a
 *  colour ring, a swarm's spread, a big body's reach). */
export interface Footprint {
  base: number;
  outer: number;
  /** Objects keep off the doorways, the lanes and the prime place, however crowded the room. */
  object?: true;
}

/** The Spider's base plate, and the reach it keeps coiled. */
const LARGE: Record<Pose, Footprint> = { standing: { base: 1.15, outer: 1.15 }, crowded: { base: 0.75, outer: 0.75 } };
const PERSON: Footprint = { base: BASE_RADIUS, outer: COLOUR_RING.outer };
const SMALL: Footprint = { base: 0.3, outer: 0.35 };
/** The floor kept clear round a cluster of objects, past its plates, so the figures standing by don't hide it. */
const OBJECT_CLEAR = 0.15;
/** A cluster of objects on their plates, reaching `reach` from its middle. */
const objectPrint = (reach: number): Footprint => ({ base: reach, outer: reach + OBJECT_CLEAR, object: true });
/** The floor between two figures' outer marks when they stand apart: a ring's width. */
const APART_GAP = COLOUR_RING.outer - COLOUR_RING.inner;
/** The floor between two bases when the rings overlap: a base's own gap to its ring. */
const BASE_GAP = COLOUR_RING.inner - BASE_RADIUS;
/** How far two bases may pass under each other when figures stand partly behind each other, as a share of the two radii. */
const BEHIND = 0.5;

/** Weights of the score: open floor counts up to `OPEN_CAP` metres of clearance. */
const OPEN_CAP = 1.0;
const COHESION = 0.3;
const ON_LANE = 0.35;
const IN_KEEP_CLEAR = 1.5;
/** Once figures crowd, how much a place counts for the room it leaves its nearest neighbour (as a share of the
 *  two bases), up to `SPREAD_CAP`: so a crowd spreads over the free floor instead of piling on the active explorer. */
const SPREAD = 0.5;
const SPREAD_CAP = 2;
/** Candidates are every other cell of the floor plan. */
const STEP = 2;

export function footprint(size: SizeClass, pose: Pose): Footprint {
  return size === "large" ? LARGE[pose] : size === "person" ? PERSON : size === "object" ? objectPrint(FLOOR_RINGS.plate.radius) : SMALL;
}

export function strokeDistance(x: number, z: number, { from, to }: Stroke): number {
  const [dx, dz] = [to[0] - from[0], to[1] - from[1]];
  const length = dx * dx + dz * dz;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - from[0]) * dx + (z - from[1]) * dz) / length));
  return Math.hypot(x - (from[0] + t * dx), z - (from[1] + t * dz));
}

const inStrokes = (x: number, z: number, strokes: readonly Stroke[]) => strokes.some((stroke) => strokeDistance(x, z, stroke) < stroke.radius);

interface Standing {
  id: string;
  x: number;
  z: number;
  print: Footprint;
}

/** The least crowding at which a figure of `print` may stand at (x, z) beside `others`. */
function crowdingAt(x: number, z: number, print: Footprint, others: readonly Standing[]): Crowding {
  let worst: Crowding = 0;
  for (const other of others) {
    const d = Math.hypot(x - other.x, z - other.z);
    const level: Crowding =
      d >= print.outer + other.print.outer + APART_GAP ? 0 : d >= print.base + other.print.base + BASE_GAP ? 1 : d >= BEHIND * (print.base + other.print.base) ? 2 : 3;
    if (level > worst) worst = level;
  }
  return worst;
}

/** How near the nearest other figure stands, as a share of the two bases: what "least bad" maximises. */
function roomAt(x: number, z: number, print: Footprint, others: readonly Standing[]): number {
  return Math.min(Infinity, ...others.map((other) => Math.hypot(x - other.x, z - other.z) / (print.base + other.print.base)));
}

interface Candidate {
  x: number;
  z: number;
  clearance: number;
}

/** Every place on the room's own floor (or the part of it figures stand on) a base reaches from the doors. */
function candidates(floor: PlacementFloor, within: PlacementHints["within"]): Candidate[] {
  const found: Candidate[] = [];
  for (let j = 0; j < floor.size; j += STEP) {
    for (let i = 0; i < floor.size; i += STEP) {
      const cell = j * floor.size + i;
      if (!floor.reached[cell]) continue;
      const [x, z] = floor.centre(cell);
      if (Math.abs(x) > INNER || Math.abs(z) > INNER || (within && !within(x, z))) continue;
      found.push({ x, z, clearance: floor.clearance[cell] });
    }
  }
  return found;
}

/** How clear of anything blocked a base stands at (x, z): none off the floor a base reaches. */
function clearanceAt(floor: PlacementFloor, x: number, z: number): number {
  const cell = floor.cellAt(x, z);
  return floor.reached[cell] ? floor.clearance[cell] : 0;
}

/** Places every figure in one room (or one half of a barrier room).
 *  `figures` lists them in turn order; `before` is where those that were
 *  here already stood; `stepping` is the explorer whose turn has just
 *  started, which steps onto the prime place. */
export function placeFigures(
  floor: PlacementFloor,
  hints: PlacementHints,
  figures: readonly PlacingFigure[],
  before: Readonly<Partial<Record<string, Placed>>> = {},
  stepping: string | null = null,
): Placement {
  if (figures.length === 0) return { figures: {}, crowding: 0, badge: null };
  const standing = solve(floor, hints, figures, before, stepping, "standing");
  if (!figures.some((figure) => figure.size === "large") || standing.crowding < 2) return standing;
  const crowded = solve(floor, hints, figures, before, stepping, "crowded");
  return behindCount(crowded) < behindCount(standing) ? crowded : standing;
}

const behindCount = (placement: Placement) => Object.values(placement.figures).filter((placed) => placed.crowding >= 2).length;

const SIZE_ORDER: Record<SizeClass, number> = { object: -1, large: 0, person: 1, small: 2 };

function solve(
  floor: PlacementFloor,
  hints: PlacementHints,
  figures: readonly PlacingFigure[],
  before: Readonly<Partial<Record<string, Placed>>>,
  stepping: string | null,
  largePose: Pose,
): Placement {
  const all = candidates(floor, hints.within);
  const maxClearance = Math.max(0, ...all.map((candidate) => candidate.clearance));
  const others: Standing[] = [];
  const poses = new Map<string, Pose>();
  let anchor: [number, number] | null = null;

  const poseOf = (figure: PlacingFigure): Pose => (figure.size === "large" ? largePose : "standing");
  const printOf = (figure: PlacingFigure) => (figure.size === "object" && figure.reach !== undefined ? objectPrint(figure.reach) : footprint(figure.size, poseOf(figure)));
  const fits = (print: Footprint, clearance: number) => clearance >= Math.min(print.base, maxClearance) - 1e-9;
  const put = (figure: PlacingFigure, x: number, z: number) => {
    others.push({ id: figure.id, x, z, print: printOf(figure) });
    poses.set(figure.id, poseOf(figure));
    if (figure.size !== "object") anchor ??= [x, z];
  };
  /** Valid at `level` or better: on reached floor clear for its base, in the part of the floor figures stand on,
   *  off the lanes until rings overlap, and out of the keep-clear areas until figures stand behind each other. */
  const allowed = (x: number, z: number, print: Footprint, level: Crowding) =>
    fits(print, clearanceAt(floor, x, z)) &&
    (hints.within === null || hints.within(x, z)) &&
    ((level >= 1 && !print.object) || !inStrokes(x, z, hints.lanes)) &&
    ((level >= 2 && !print.object) || !inStrokes(x, z, hints.keepClear)) &&
    (!print.object || hints.prime === null || Math.hypot(x - hints.prime[0], z - hints.prime[1]) >= print.outer + PERSON.outer) &&
    crowdingAt(x, z, print, others) <= level;
  const score = (candidate: Candidate) => {
    const [ax, az] = anchor ?? [0, 0];
    return (
      Math.min(candidate.clearance, OPEN_CAP) -
      COHESION * Math.hypot(candidate.x - ax, candidate.z - az) -
      (inStrokes(candidate.x, candidate.z, hints.lanes) ? ON_LANE : 0) -
      (inStrokes(candidate.x, candidate.z, hints.keepClear) ? IN_KEEP_CLEAR : 0)
    );
  };
  /** The best place for a figure: `toward` (the prime place, for the explorer stepping onto it) or the floor
   *  nearest it, or else the best free floor, at the least crowding the room allows. */
  const best = (print: Footprint, toward: readonly [number, number] | null): [number, number] => {
    for (const level of [0, 1, 2] as const) {
      if (toward && allowed(toward[0], toward[1], print, level)) return [toward[0], toward[1]];
      let found: Candidate | null = null;
      let top = -Infinity;
      for (const candidate of all) {
        if (!allowed(candidate.x, candidate.z, print, level)) continue;
        const value = toward
          ? -Math.hypot(candidate.x - toward[0], candidate.z - toward[1])
          : score(candidate) + (level > 0 ? SPREAD * Math.min(roomAt(candidate.x, candidate.z, print, others), SPREAD_CAP) : 0);
        if (value > top) [found, top] = [candidate, value];
      }
      if (found) return [found.x, found.z];
    }
    let found: Candidate = all[0];
    let top = -Infinity;
    for (const candidate of all) {
      if (!fits(print, candidate.clearance)) continue;
      const value = roomAt(candidate.x, candidate.z, print, others) + 0.1 * score(candidate);
      if (value > top) [found, top] = [candidate, value];
    }
    return [found.x, found.z];
  };

  const ordered = figures
    .map((figure, i) => ({ figure, i }))
    .sort((a, b) => SIZE_ORDER[a.figure.size] - SIZE_ORDER[b.figure.size] || a.i - b.i)
    .map(({ figure }) => figure);
  // The explorer whose turn has started steps onto the prime place, or as near it as the room allows.
  const stepper = hints.prime === null ? undefined : figures.find((figure) => figure.id === stepping);
  if (stepper) put(stepper, ...best(printOf(stepper), hints.prime));
  // Whoever stood here keeps their place, unless the stepper crowds them more than they stood crowded before.
  const arriving: PlacingFigure[] = [];
  for (const figure of ordered) {
    if (figure === stepper) continue;
    const was = before[figure.id];
    if (was && (!stepper || figure.size === "object" || crowdingAt(was.x, was.z, printOf(figure), [others[0]]) <= was.crowding)) put(figure, was.x, was.z);
    else arriving.push(figure);
  }
  // The rest take the prime place while it is free, or else the best free floor.
  for (const figure of arriving) {
    const print = printOf(figure);
    const prime = hints.prime;
    put(figure, ...(prime && figure.size !== "object" && allowed(prime[0], prime[1], print, 0) ? [prime[0], prime[1]] as [number, number] : best(print, null)));
  }

  const result: Record<string, Placed> = {};
  for (const { id, x, z, print } of others) {
    result[id] = { x, z, pose: poses.get(id) ?? "standing", crowding: crowdingAt(x, z, print, others.filter((other) => other.id !== id)) };
  }
  const crowding = Math.max(0, ...Object.values(result).map((at) => at.crowding)) as Crowding;
  return { figures: result, crowding, badge: crowding >= 2 ? figures.filter((figure) => figure.size !== "object").length : null };
}
