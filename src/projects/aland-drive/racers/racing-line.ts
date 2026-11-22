import { RoadLine } from "../sim/road-net";
import { ROUTE_STEP_M, type RoutePlan } from "./route-plan";
import { standsAt, type StandingWalls } from "./walls";

/*
 * The line a racer drives (`ideas/traffic-and-racers.md`, "The driver"): the
 * corridor a route's laid road makes, its middle and its carriageway's edges
 * every few metres, bridged straight across the junction aprons where no
 * section is laid, and in it the minimum-curvature line, the textbook racing
 * line (outside, apex, outside). That line is the least-squares answer to a
 * banded linear system in the offset from the middle at every sample, with the
 * edges less a margin as bounds on each offset, solved by an active set: the
 * unbounded answer, then every offset over an edge held on it and the rest
 * solved again, until none moves. The laid middle itself is the line a
 * cautious driver keeps, and what the racing line is measured against. Both
 * are pure functions of the route and the road, so every page and every tool
 * draws the same line. The corridor is the carriageway less whatever stands in
 * it: a wall reaching into the road narrows it there, and where the road is
 * blocked outright the corridor goes round on the open ground beside it.
 */

export interface CorridorSample {
  x: number;
  y: number;
  z: number;
  /** The unit vector to the right of the corridor's own direction, in the ground plane. */
  rightX: number;
  rightZ: number;
  /** How far the carriageway reaches left and right of the middle. */
  leftM: number;
  rightM: number;
  /** How far the carriageway's left and right edges stand above the middle. */
  leftRiseM: number;
  rightRiseM: number;
  paved: boolean;
  /** Whether this stretch is bridged across a gap in the laid road rather than read from it. */
  bridged: boolean;
}

/** The narrow room a car has where the route runs on no laid road at all: a lane's worth either side of the line. */
const UNLAID_HALF_M = 1.5;
/** A racing line keeps this much of the carriageway's edge, beyond the car's own half width, for the body's lean and the tyres' slip. */
export const EDGE_MARGIN_M = 0.4;
/** A corridor keeps this clear of anything standing, and reads as in a sample's way whatever stands within this of it along the road. */
const WALL_CLEAR_M = 0.5;
const WALL_ALONG_M = ROUTE_STEP_M / 2 + 0.5;
/** The narrowest a corridor may be squeezed to between the road's edge and a wall; narrower, the road is blocked, and the corridor goes round within this of the middle, this wide. */
const NARROWEST_M = 3.4;
const OPEN_GROUND_M = 12;
/** A corridor carried on past the laid road's end stops this many samples short of anything standing in it. */
const RUN_ON_SHORT_OF = 3;
/** The way round a blocked stretch is reached over this many samples either side of it. */
const ROUND_TAPER = 6;
/** The active set is settled once no offset has moved further than this between rounds, or after this many rounds. */
const SETTLED_M = 0.01;
const MOST_ROUNDS = 60;

/**
 * The corridor's samples at `ROUTE_STEP_M` spacing, the laid middle where the road is laid and straight across the gaps,
 * clear of the walls given.
 */
export function corridorOf(plan: RoutePlan, walls?: StandingWalls): CorridorSample[] {
  const { samples } = plan;
  const centres: Centre[] = [];
  let lastLaid = -1;
  for (let index = 0; index < samples.length; index++) {
    const { laid } = samples[index];
    if (!laid) {
      centres.push({ x: NaN, y: NaN, z: NaN, leftM: 0, rightM: 0, leftRiseM: 0, rightRiseM: 0, paved: true, bridged: true });
      continue;
    }
    centres.push({ x: laid.x, y: laid.y, z: laid.z, leftM: laid.leftM, rightM: laid.rightM, leftRiseM: laid.leftRiseM, rightRiseM: laid.rightRiseM, paved: laid.paved, bridged: false });
    for (let gap = lastLaid + 1; gap < index; gap++) {
      if (lastLaid < 0) {
        // A leading gap, a route that starts on no laid road: the GPS line carried over to where the laid road begins.
        centres[gap] = { x: samples[gap].x + (laid.x - samples[index].x), y: laid.y, z: samples[gap].z + (laid.z - samples[index].z), leftM: UNLAID_HALF_M, rightM: UNLAID_HALF_M, leftRiseM: 0, rightRiseM: 0, paved: laid.paved, bridged: true };
        continue;
      }
      // Bridge the gap since the last laid sample: straight across it, as narrow as its narrower end.
      const before = centres[lastLaid];
      const share = (gap - lastLaid) / (index - lastLaid);
      centres[gap] = { x: before.x + share * (laid.x - before.x), y: before.y + share * (laid.y - before.y), z: before.z + share * (laid.z - before.z), leftM: Math.min(before.leftM, laid.leftM), rightM: Math.min(before.rightM, laid.rightM), leftRiseM: 0, rightRiseM: 0, paved: before.paved, bridged: true };
    }
    // Something standing in the straight way: the gap is bridged along the route's own line instead, which is the map's road, carried over to meet the laid road at both ends.
    if (walls && lastLaid >= 0 && index - lastLaid > 1 && standsAcrossGap(centres, lastLaid, index, walls)) {
      const [from, to] = [samples[lastLaid], samples[index]];
      const before = centres[lastLaid];
      for (let gap = lastLaid + 1; gap < index; gap++) {
        const share = (gap - lastLaid) / (index - lastLaid);
        centres[gap] = { ...centres[gap], x: samples[gap].x + (before.x - from.x) + share * (laid.x - to.x - (before.x - from.x)), z: samples[gap].z + (before.z - from.z) + share * (laid.z - to.z - (before.z - from.z)) };
      }
    }
    lastLaid = index;
  }
  if (lastLaid < 0) throw new Error("the route runs on no laid road at all");
  // A trailing gap, a route that ends on no laid road: the GPS line carried on from where the laid road ends.
  const last = centres[lastLaid];
  for (let gap = lastLaid + 1; gap < samples.length; gap++) centres[gap] = { x: samples[gap].x + (last.x - samples[lastLaid].x), y: last.y, z: samples[gap].z + (last.z - samples[lastLaid].z), leftM: UNLAID_HALF_M, rightM: UNLAID_HALF_M, leftRiseM: 0, rightRiseM: 0, paved: last.paved, bridged: true };
  // Resampled evenly along the middle, since the laid middles of evenly spaced GPS samples aren't evenly spaced themselves.
  const even = resample(centres, ROUTE_STEP_M);
  const corridor = even.map((sample, index) => {
    const before = even[Math.max(0, index - 1)];
    const after = even[Math.min(even.length - 1, index + 1)];
    const runX = after.x - before.x;
    const runZ = after.z - before.z;
    const run = Math.hypot(runX, runZ) || 1;
    // Right of the way (-sin, -cos) along (runX, runZ) is (-runZ, runX) normalised.
    return { ...sample, rightX: -runZ / run, rightZ: runX / run };
  });
  if (!walls) return corridor;
  // Past the laid road's end the corridor is only the route's line carried on, for a driver to aim at beyond the finish: it ends short of anything standing in it.
  const roadEnds = corridor.findLastIndex(({ bridged }) => !bridged);
  const standsIn = corridor.findIndex((sample, index) => index > roadEnds && standingAcross(sample, walls).some(([left, right]) => right > -sample.leftM && left < sample.rightM));
  return clearOfWalls(standsIn < 0 ? corridor : corridor.slice(0, Math.max(roadEnds + 1, standsIn - RUN_ON_SHORT_OF)), walls);
}

/**
 * The stretches across a sample that something standing takes up, each from its left end to its right, metres right
 * of the middle, with the room kept clear of it: every wall's own, and for a closed outline everything between its
 * walls here, since what it rings is solid too.
 */
function standingAcross(sample: CorridorSample, walls: StandingWalls): [number, number][] {
  const taken: [number, number][] = [];
  const solid = new Map<number, [number, number]>();
  for (const wall of walls.near(sample.x, sample.z, OPEN_GROUND_M + WALL_ALONG_M)) {
    if (!standsAt(wall, sample.y)) continue;
    const { fromX, fromZ, toX, toZ, outline, closed } = wall;
    // Each end along the road's way from the sample, which is the right's (z, -x), and across it.
    const along = (x: number, z: number) => (x - sample.x) * sample.rightZ - (z - sample.z) * sample.rightX;
    const across = (x: number, z: number) => (x - sample.x) * sample.rightX + (z - sample.z) * sample.rightZ;
    const [fromAlong, toAlong] = [along(fromX, fromZ), along(toX, toZ)];
    // The part of the wall within reach along the road.
    let [first, last] = [0, 1];
    if (fromAlong === toAlong) {
      if (Math.abs(fromAlong) > WALL_ALONG_M) continue;
    } else {
      const [enter, leave] = [(-WALL_ALONG_M - fromAlong) / (toAlong - fromAlong), (WALL_ALONG_M - fromAlong) / (toAlong - fromAlong)];
      first = Math.max(0, Math.min(enter, leave));
      last = Math.min(1, Math.max(enter, leave));
      if (first > last) continue;
    }
    const [fromAcross, toAcross] = [across(fromX, fromZ), across(toX, toZ)];
    const ends = [fromAcross + first * (toAcross - fromAcross), fromAcross + last * (toAcross - fromAcross)];
    const stretch: [number, number] = [Math.min(...ends) - WALL_CLEAR_M, Math.max(...ends) + WALL_CLEAR_M];
    if (!closed) {
      taken.push(stretch);
      continue;
    }
    const whole = solid.get(outline);
    if (whole) solid.set(outline, [Math.min(whole[0], stretch[0]), Math.max(whole[1], stretch[1])]);
    else solid.set(outline, stretch);
  }
  return [...taken, ...solid.values()];
}

/** Whether anything stands in the straight way across a gap in the laid road, between the two laid samples either side of it. */
function standsAcrossGap(centres: readonly Centre[], from: number, to: number, walls: StandingWalls): boolean {
  const runX = centres[to].x - centres[from].x;
  const runZ = centres[to].z - centres[from].z;
  const run = Math.hypot(runX, runZ) || 1;
  for (let gap = from + 1; gap < to; gap++) {
    const taken = standingAcross({ ...centres[gap], rightX: -runZ / run, rightZ: runX / run }, walls);
    if (taken.some(([left, right]) => right > -centres[gap].leftM && left < centres[gap].rightM)) return true;
  }
  return false;
}

/** The stretches of a reach across a sample left free by what's taken, left to right. */
function freeAcross(from: number, to: number, taken: readonly [number, number][]): [number, number][] {
  let free: [number, number][] = [[from, to]];
  for (const [left, right] of taken) free = free.flatMap(([low, high]): [number, number][] => (right <= low || left >= high ? [[low, high]] : [[low, left], [right, high]]).filter(([a, b]) => b > a) as [number, number][]);
  return free;
}

/**
 * A corridor clear of what stands in it. Where a wall reaches into the carriageway the corridor is the widest of the
 * road still free; where none of it is wide enough for a car, the road is blocked, and the corridor is free ground
 * beside it, as wide as a car needs, reached over a few samples either side. A blocked stretch is gone round on one
 * side from end to end, the side that takes it least far from the middle. A sample nothing stands in is as it was.
 */
function clearOfWalls(corridor: CorridorSample[], walls: StandingWalls): CorridorSample[] {
  /** How far each sample's middle has moved right to go round. */
  const moved = new Float64Array(corridor.length);
  const cleared = [...corridor];
  /** For each blocked sample, the way round on its left and on its right, each as wide as a car needs, or null where there is none. */
  const round = new Map<number, { left: [number, number] | null; right: [number, number] | null }>();
  const take = (index: number, [low, high]: [number, number], aside: boolean) => {
    const sample = corridor[index];
    // A way that still holds the middle keeps it; one that doesn't takes its own middle.
    if (low <= 0 && high >= 0 && !aside) {
      cleared[index] = { ...sample, leftM: -low, rightM: high };
      return;
    }
    const shift = (low + high) / 2;
    moved[index] = shift;
    cleared[index] = { ...sample, x: sample.x + shift * sample.rightX, z: sample.z + shift * sample.rightZ, leftM: (high - low) / 2, rightM: (high - low) / 2, leftRiseM: 0, rightRiseM: 0, bridged: sample.bridged || aside, paved: aside ? false : sample.paved };
  };
  corridor.forEach((sample, index) => {
    const taken = standingAcross(sample, walls);
    if (taken.length === 0) return;
    const way = freeAcross(-sample.leftM, sample.rightM, taken).reduce<[number, number] | null>((best, each) => (!best || each[1] - each[0] > best[1] - best[0] ? each : best), null);
    if (way && way[1] - way[0] >= NARROWEST_M) {
      take(index, way, false);
      return;
    }
    // In each stretch of free ground wide enough, the way as wide as a car needs that lies nearest the middle; then the nearest of those on each side.
    const ways = freeAcross(-OPEN_GROUND_M, OPEN_GROUND_M, taken)
      .filter(([low, high]) => high - low >= NARROWEST_M)
      .map(([low, high]): [number, number] => {
        const middle = Math.max(low + NARROWEST_M / 2, Math.min(high - NARROWEST_M / 2, 0));
        return [middle - NARROWEST_M / 2, middle + NARROWEST_M / 2];
      });
    const nearest = (side: -1 | 1) => ways.filter(([low, high]) => side * (low + high) >= 0).reduce<[number, number] | null>((best, each) => (!best || Math.abs(each[0] + each[1]) < Math.abs(best[0] + best[1]) ? each : best), null);
    round.set(index, { left: nearest(-1), right: nearest(1) });
  });
  // Each run of blocked samples goes round on one side: the side whose furthest way round is nearest the middle.
  for (let index = 0; index < corridor.length; index++) {
    if (!round.has(index)) continue;
    let end = index;
    while (round.has(end + 1)) end++;
    const furthest = (side: "left" | "right") => {
      let most = 0;
      for (let at = index; at <= end; at++) {
        const way = round.get(at)?.[side];
        if (!way) return Infinity;
        most = Math.max(most, Math.abs((way[0] + way[1]) / 2));
      }
      return most;
    };
    const side = furthest("left") < furthest("right") ? "left" : "right";
    if (furthest(side) < Infinity) {
      for (let at = index; at <= end; at++) {
        const way = round.get(at)?.[side];
        if (way) take(at, way, true);
      }
    }
    index = end;
  }
  // The way round is reached from the road over a few samples: each one near a moved middle may run as far over on that side as its share of the move.
  for (let index = 0; index < corridor.length; index++) {
    if (moved[index] === 0) continue;
    for (let near = Math.max(0, index - ROUND_TAPER); near <= Math.min(corridor.length - 1, index + ROUND_TAPER); near++) {
      if (moved[near] !== 0) continue;
      const reach = Math.abs(moved[index]) * (1 - Math.abs(near - index) / (ROUND_TAPER + 1)) + NARROWEST_M / 2;
      if (moved[index] > 0) cleared[near] = { ...cleared[near], rightM: Math.max(cleared[near].rightM, reach) };
      else cleared[near] = { ...cleared[near], leftM: Math.max(cleared[near].leftM, reach) };
    }
  }
  return cleared;
}

type Centre = Omit<CorridorSample, "rightX" | "rightZ">;

/** The polyline walked at an even step, each point carrying the nearer original's widths. */
function resample(centres: Centre[], stepM: number): Centre[] {
  const out: Centre[] = [{ ...centres[0] }];
  let owed = stepM;
  for (let index = 1; index < centres.length; index++) {
    const from = centres[index - 1];
    const to = centres[index];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    let at = owed;
    while (at <= length) {
      const share = at / length;
      const nearer = share < 0.5 ? from : to;
      out.push({ ...nearer, x: from.x + share * (to.x - from.x), y: from.y + share * (to.y - from.y), z: from.z + share * (to.z - from.z) });
      at += stepM;
    }
    owed = at - length;
  }
  const last = centres[centres.length - 1];
  const end = out[out.length - 1];
  if (Math.hypot(last.x - end.x, last.z - end.z) > stepM / 2) out.push({ ...last });
  return out;
}

/** The road's height a way right of its middle: the carriageway is a plane from the middle to each edge, and level past it. */
function surfaceY({ y, leftM, rightM, leftRiseM, rightRiseM }: CorridorSample, offsetM: number): number {
  if (offsetM < 0) return leftM > 0 ? y + Math.min(1, -offsetM / leftM) * leftRiseM : y;
  return rightM > 0 ? y + Math.min(1, offsetM / rightM) * rightRiseM : y;
}

const lineOf = (corridor: readonly CorridorSample[], offsets: ArrayLike<number>) => new RoadLine(Float32Array.from(corridor.flatMap((sample, index) => [sample.x + offsets[index] * sample.rightX, surfaceY(sample, offsets[index]), sample.z + offsets[index] * sample.rightZ])));

/** The laid middle, bridged across the gaps: the line down the middle of the road. */
export function middleLine(corridor: readonly CorridorSample[]): RoadLine {
  return lineOf(corridor, new Float64Array(corridor.length));
}

/**
 * The minimum-curvature line through the corridor for a car of a half width: the offset from the middle at every sample,
 * with the carriageway's edges less the car's half width and a margin as its bounds, and the line it makes.
 */
export function racingLine(corridor: readonly CorridorSample[], carHalfWidthM: number): { line: RoadLine; offsets: Float64Array } {
  const keep = carHalfWidthM + EDGE_MARGIN_M;
  const low = Float64Array.from(corridor, ({ leftM }) => -Math.max(0, leftM - keep));
  const high = Float64Array.from(corridor, ({ rightM }) => Math.max(0, rightM - keep));
  const offsets = minimumCurvature(corridor, low, high);
  return { line: lineOf(corridor, offsets), offsets };
}

/**
 * The offsets that minimise the sum over the line of its second differences squared, within the bounds, the ends held on
 * the middle. The sum is a quadratic in the offsets whose normal matrix has five diagonals, so each round is one banded
 * Cholesky solve for the free offsets, with the held ones moved to the right-hand side.
 */
function minimumCurvature(corridor: readonly CorridorSample[], low: Float64Array, high: Float64Array): Float64Array {
  const count = corridor.length;
  const offsets = new Float64Array(count);
  if (count < 5) return offsets;
  // Each second difference q_k = sum over i of c_{k,i} r_i d_i + q0_k, with c = 1, -2, 1 at k-1, k, k+1.
  const rx = Float64Array.from(corridor, ({ rightX }) => rightX);
  const rz = Float64Array.from(corridor, ({ rightZ }) => rightZ);
  const q0x = new Float64Array(count);
  const q0z = new Float64Array(count);
  for (let k = 1; k < count - 1; k++) {
    q0x[k] = corridor[k - 1].x - 2 * corridor[k].x + corridor[k + 1].x;
    q0z[k] = corridor[k - 1].z - 2 * corridor[k].z + corridor[k + 1].z;
  }
  const coefficient = (k: number, i: number) => (i === k ? -2 : i === k - 1 || i === k + 1 ? 1 : 0);
  // The normal matrix's diagonals: M[i][i], M[i][i+1], M[i][i+2], and the gradient at zero offset.
  const d0 = new Float64Array(count);
  const d1 = new Float64Array(count);
  const d2 = new Float64Array(count);
  const b = new Float64Array(count);
  for (let k = 1; k < count - 1; k++) {
    for (let i = k - 1; i <= k + 1; i++) {
      const ci = coefficient(k, i);
      b[i] -= ci * (rx[i] * q0x[k] + rz[i] * q0z[k]);
      for (let j = i; j <= k + 1; j++) {
        const value = ci * coefficient(k, j) * (rx[i] * rx[j] + rz[i] * rz[j]);
        if (j === i) d0[i] += value;
        else if (j === i + 1) d1[i] += value;
        else d2[i] += value;
      }
    }
  }
  const held = new Uint8Array(count);
  held[0] = held[count - 1] = 1;
  const valueAt = (i: number, j: number) => (j === i ? d0[i] : j === i + 1 ? d1[i] : j === i + 2 ? d2[i] : j === i - 1 ? d1[j] : d2[j]);
  for (let round = 0; round < MOST_ROUNDS; round++) {
    // The free offsets, solved with the held ones on the right-hand side.
    const free: number[] = [];
    for (let i = 0; i < count; i++) if (!held[i]) free.push(i);
    const rhs = new Float64Array(free.length);
    free.forEach((i, at) => {
      let value = b[i];
      for (let j = Math.max(0, i - 2); j <= Math.min(count - 1, i + 2); j++) if (held[j] && j !== i) value -= valueAt(i, j) * offsets[j];
      rhs[at] = value;
    });
    const solved = bandedSolve(free, rhs, valueAt);
    let moved = 0;
    free.forEach((i, at) => {
      moved = Math.max(moved, Math.abs(solved[at] - offsets[i]));
      offsets[i] = solved[at];
    });
    // Hold every free offset over an edge on it; let go of every held one the slope pulls back inside.
    let changed = false;
    for (const i of free) {
      if (offsets[i] < low[i] || offsets[i] > high[i]) {
        offsets[i] = Math.max(low[i], Math.min(high[i], offsets[i]));
        held[i] = 1;
        changed = true;
      }
    }
    for (let i = 1; i < count - 1; i++) {
      if (!held[i]) continue;
      let slope = -b[i];
      for (let j = Math.max(0, i - 2); j <= Math.min(count - 1, i + 2); j++) slope += valueAt(i, j) * offsets[j];
      // At the low edge a downhill slope points inside, and at the high edge an uphill one.
      if ((offsets[i] <= low[i] && slope < -1e-9 && high[i] > low[i]) || (offsets[i] >= high[i] && slope > 1e-9 && high[i] > low[i])) {
        held[i] = 0;
        changed = true;
      }
    }
    if (!changed && moved < SETTLED_M) break;
  }
  return offsets;
}

/**
 * Solves the system over the free offsets, whose matrix is the normal matrix's rows and columns at `free`, by banded
 * Cholesky: free offsets within two of each other couple, further ones never do, so the band never widens.
 */
function bandedSolve(free: readonly number[], rhs: Float64Array, valueAt: (i: number, j: number) => number): Float64Array {
  const n = free.length;
  // The band in free indices: entries at most two originals apart, so at most two free positions apart.
  const l0 = new Float64Array(n);
  const l1 = new Float64Array(n);
  const l2 = new Float64Array(n);
  const entry = (a: number, c: number) => (Math.abs(free[a] - free[c]) <= 2 ? valueAt(Math.min(free[a], free[c]), Math.max(free[a], free[c])) : 0);
  for (let i = 0; i < n; i++) {
    const a1 = i >= 1 ? l1[i - 1] : 0;
    const a2 = i >= 2 ? l2[i - 2] : 0;
    const diagonal = entry(i, i) - a1 * a1 - a2 * a2;
    l0[i] = Math.sqrt(Math.max(diagonal, 1e-12));
    if (i + 1 < n) l1[i] = (entry(i, i + 1) - (i >= 1 ? l1[i - 1] * l2[i - 1] : 0)) / l0[i];
    if (i + 2 < n) l2[i] = entry(i, i + 2) / l0[i];
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = (rhs[i] - (i >= 1 ? l1[i - 1] * y[i - 1] : 0) - (i >= 2 ? l2[i - 2] * y[i - 2] : 0)) / l0[i];
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) x[i] = (y[i] - (i + 1 < n ? l1[i] * x[i + 1] : 0) - (i + 2 < n ? l2[i] * x[i + 2] : 0)) / l0[i];
  return x;
}

/**
 * How sharply the road crests along a line sampled at an even step, in radians a metre, positive over a crest and
 * negative in a dip, smoothed over a stretch: a car over a crest at speed goes light, which the speed plan allows for.
 */
export function crestOf(line: RoadLine, stepM: number, smoothSamples = 4): Float64Array {
  const count = Math.max(2, Math.floor(line.length / stepM) + 1);
  const heights = new Float64Array(count);
  for (let at = 0; at < count; at++) heights[at] = line.at(at * stepM).y;
  const raw = new Float64Array(count);
  // The slope's change over two steps, as a turn: downwards over a crest.
  for (let at = 1; at < count - 1; at++) raw[at] = -(heights[at - 1] - 2 * heights[at] + heights[at + 1]) / (stepM * stepM);
  const smooth = new Float64Array(count);
  for (let at = 0; at < count; at++) {
    let sum = 0;
    let n = 0;
    for (let near = Math.max(0, at - smoothSamples); near <= Math.min(count - 1, at + smoothSamples); near++) {
      sum += raw[near];
      n++;
    }
    smooth[at] = sum / n;
  }
  return smooth;
}

/** A sampled reading smoothed over a few samples either side. */
function smoothed(raw: Float64Array, smoothSamples: number): Float64Array {
  const count = raw.length;
  const smooth = new Float64Array(count);
  for (let at = 0; at < count; at++) {
    let sum = 0;
    let n = 0;
    for (let near = Math.max(0, at - smoothSamples); near <= Math.min(count - 1, at + smoothSamples); near++) {
      sum += raw[near];
      n++;
    }
    smooth[at] = sum / n;
  }
  return smooth;
}

/**
 * The curvature along a line sampled at an even step, in radians a metre, signed (above zero turning right) and smoothed
 * over a few samples: racecraft reads which way a bend goes from it, and the speed plan its size.
 */
export function signedCurvatureOf(line: RoadLine, stepM: number, smoothSamples = 2): Float64Array {
  const count = Math.max(2, Math.floor(line.length / stepM) + 1);
  const headings = new Float64Array(count);
  for (let at = 0; at < count; at++) headings[at] = line.at(at * stepM).heading;
  const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const raw = new Float64Array(count);
  // A heading runs anticlockwise, so a turn to the right is a fall in it.
  for (let at = 1; at < count - 1; at++) raw[at] = -turn(headings[at - 1], headings[at + 1]) / (2 * stepM);
  return smoothed(raw, smoothSamples);
}

/** The curvature along a line sampled at an even step, in radians a metre, smoothed over a few samples: the speed plan's input. */
export function curvatureOf(line: RoadLine, stepM: number, smoothSamples = 2): Float64Array {
  return signedCurvatureOf(line, stepM, smoothSamples).map((bend) => Math.abs(bend));
}

/** The room a line has to each side at every sample, for racecraft: where the laid middle stands right of the line, and the carriageway's reach from that middle. */
export interface LineGeometry {
  stepM: number;
  middleM: Float64Array;
  leftM: Float64Array;
  rightM: Float64Array;
}

/** A line drawn through a corridor, with the road's surface and its room to each side at any distance along it. */
export interface DrawnLine {
  line: RoadLine;
  pavedAt: (alongM: number) => boolean;
  geometry: LineGeometry;
}

/**
 * The line at the given offsets from a corridor's middle, with the road's surface and room read along the line itself.
 * The line has a point at every sample of the corridor, but it is shorter than the middle round the inside of a bend and
 * longer round the outside, so a distance along it is not that distance along the corridor: over a few kilometres the
 * two part by tens of metres, and a change of surface or a narrow place read by the corridor's own step stood that far
 * from where the car meets it. Where the corridor is bridged across a gap in the laid road, a junction's apron for the
 * most part, its width is a guess that was good enough to draw the line through, and no carriageway to move about on:
 * there the road reaches no way from the middle, so a racer keeps to its line.
 */
export function lineThrough(corridor: readonly CorridorSample[], offsets: ArrayLike<number>, stepM = ROUTE_STEP_M): DrawnLine {
  const line = lineOf(corridor, offsets);
  // The corridor's sample nearest each even step along the line.
  const samples = new Uint32Array(Math.round(line.length / stepM) + 1);
  for (let step = 0, sample = 0; step < samples.length; step++) {
    const along = step * stepM;
    while (sample + 1 < corridor.length && Math.abs(line.lengths[sample + 1] - along) <= Math.abs(line.lengths[sample] - along)) sample++;
    samples[step] = sample;
  }
  const sampleAt = (alongM: number) => corridor[samples[Math.max(0, Math.min(samples.length - 1, Math.round(alongM / stepM)))]];
  return {
    line,
    pavedAt: (alongM) => sampleAt(alongM).paved,
    geometry: {
      stepM,
      middleM: Float64Array.from(samples, (sample) => -offsets[sample]),
      leftM: Float64Array.from(samples, (sample) => (corridor[sample].bridged ? 0 : corridor[sample].leftM)),
      rightM: Float64Array.from(samples, (sample) => (corridor[sample].bridged ? 0 : corridor[sample].rightM)),
    },
  };
}
