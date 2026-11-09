import { RoadLine } from "../sim/road-net";
import { ROUTE_STEP_M, type RoutePlan } from "./route-plan";

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
 * draws the same line.
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
  paved: boolean;
  /** Whether this stretch is bridged across a gap in the laid road rather than read from it. */
  bridged: boolean;
}

/** The narrow room a car has where the route runs on no laid road at all: a lane's worth either side of the line. */
const UNLAID_HALF_M = 1.5;
/** A racing line keeps this much of the carriageway's edge, beyond the car's own half width, for the body's lean and the tyres' slip. */
export const EDGE_MARGIN_M = 0.4;
/** The active set is settled once no offset has moved further than this between rounds, or after this many rounds. */
const SETTLED_M = 0.01;
const MOST_ROUNDS = 60;

/** The corridor's samples at `ROUTE_STEP_M` spacing, the laid middle where the road is laid and straight across the gaps. */
export function corridorOf(plan: RoutePlan): CorridorSample[] {
  const { samples } = plan;
  const centres: Centre[] = [];
  let lastLaid = -1;
  for (let index = 0; index < samples.length; index++) {
    const { laid } = samples[index];
    if (!laid) {
      centres.push({ x: NaN, y: NaN, z: NaN, leftM: 0, rightM: 0, paved: true, bridged: true });
      continue;
    }
    centres.push({ x: laid.x, y: laid.y, z: laid.z, leftM: laid.leftM, rightM: laid.rightM, paved: laid.paved, bridged: false });
    for (let gap = lastLaid + 1; gap < index; gap++) {
      if (lastLaid < 0) {
        // A leading gap, a route that starts on no laid road: the GPS line carried over to where the laid road begins.
        centres[gap] = { x: samples[gap].x + (laid.x - samples[index].x), y: laid.y, z: samples[gap].z + (laid.z - samples[index].z), leftM: UNLAID_HALF_M, rightM: UNLAID_HALF_M, paved: laid.paved, bridged: true };
        continue;
      }
      // Bridge the gap since the last laid sample: straight across it, as narrow as its narrower end.
      const before = centres[lastLaid];
      const share = (gap - lastLaid) / (index - lastLaid);
      centres[gap] = { x: before.x + share * (laid.x - before.x), y: before.y + share * (laid.y - before.y), z: before.z + share * (laid.z - before.z), leftM: Math.min(before.leftM, laid.leftM), rightM: Math.min(before.rightM, laid.rightM), paved: before.paved, bridged: true };
    }
    lastLaid = index;
  }
  if (lastLaid < 0) throw new Error("the route runs on no laid road at all");
  // A trailing gap, a route that ends on no laid road: the GPS line carried on from where the laid road ends.
  const last = centres[lastLaid];
  for (let gap = lastLaid + 1; gap < samples.length; gap++) centres[gap] = { x: samples[gap].x + (last.x - samples[lastLaid].x), y: last.y, z: samples[gap].z + (last.z - samples[lastLaid].z), leftM: UNLAID_HALF_M, rightM: UNLAID_HALF_M, paved: last.paved, bridged: true };
  // Resampled evenly along the middle, since the laid middles of evenly spaced GPS samples aren't evenly spaced themselves.
  const even = resample(centres, ROUTE_STEP_M);
  return even.map((sample, index) => {
    const before = even[Math.max(0, index - 1)];
    const after = even[Math.min(even.length - 1, index + 1)];
    const runX = after.x - before.x;
    const runZ = after.z - before.z;
    const run = Math.hypot(runX, runZ) || 1;
    // Right of the way (-sin, -cos) along (runX, runZ) is (-runZ, runX) normalised.
    return { ...sample, rightX: -runZ / run, rightZ: runX / run };
  });
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

const lineOf = (corridor: readonly CorridorSample[], offsets: ArrayLike<number>) => new RoadLine(Float32Array.from(corridor.flatMap((sample, index) => [sample.x + offsets[index] * sample.rightX, sample.y, sample.z + offsets[index] * sample.rightZ])));

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

/** A corridor's geometry seen from a line at the given offsets from its middle. */
export function geometryOf(corridor: readonly CorridorSample[], offsets: ArrayLike<number>, stepM = ROUTE_STEP_M): LineGeometry {
  const count = corridor.length;
  return { stepM, middleM: Float64Array.from({ length: count }, (_, at) => -offsets[at]), leftM: Float64Array.from(corridor, ({ leftM }) => leftM), rightM: Float64Array.from(corridor, ({ rightM }) => rightM) };
}
