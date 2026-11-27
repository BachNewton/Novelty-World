import * as THREE from "three";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Rapier } from "./rapier";

/**
 * Stand-in shapes for colliders: a few simple solids that approximate a
 * drawn model, as games collide, rather than the model's own triangles. A
 * triangle mesh catches a body on the edges between its triangles, makes
 * every bump and lip a step, and costs a query per triangle it comes near;
 * a box, a cylinder or a convex hull is met as one smooth face.
 *
 * They are fitted by one rule: a stand-in only has to be right where a body
 * touches it. Where the body stands, its top matches the drawn surface within
 * a tolerance; what is only bumped into may be rough; a gap the body could
 * pass through or stand in stays open and a narrower one is filled; and the
 * fewest shapes do it (`fitStandIns`). `judge` checks stand-ins against the
 * drawn model by the same rule, for a tool to run over every model of a pack.
 *
 * Shapes are measured once from a model's meshes in its own frame (each
 * mesh placed by its `matrixWorld`), then placed by a matrix that turns by
 * quarter turns and may mirror, so a box stays a box along the axes.
 */

export type Vec3 = readonly [number, number, number];

/** A box along the axes, from one corner to the other. */
export interface Box {
  kind: "box";
  min: Vec3;
  max: Vec3;
}

/** An upright cylinder: its axis's place on the ground, its radius, and its foot and top. */
export interface Cylinder {
  kind: "cylinder";
  x: number;
  z: number;
  radius: number;
  bottom: number;
  top: number;
}

/** The convex hull of some points, three numbers each. */
export interface Hull {
  kind: "hull";
  points: readonly number[];
}

export type Shape = Box | Cylinder | Hull;

/** A model's meshes, each placed in the model's frame by its `matrixWorld`. */
export type Meshes = readonly THREE.Mesh[];

export function box(min: Vec3, max: Vec3): Box {
  return { kind: "box", min, max };
}

/** The box round a model. */
export function boundsOf(meshes: Meshes): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox !== null) bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  return bounds;
}

export function boundsBox(meshes: Meshes): Box {
  const { min, max } = boundsOf(meshes);
  return box([min.x, min.y, min.z], [max.x, max.y, max.z]);
}

/** Every corner of a model's triangles, three numbers each. */
export function pointsOf(meshes: Meshes): number[] {
  const points: number[] = [];
  const corner = new THREE.Vector3();
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      corner.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      points.push(corner.x, corner.y, corner.z);
    }
  }
  return points;
}

export function hullOf(meshes: Meshes): Hull {
  return { kind: "hull", points: pointsOf(meshes) };
}

/**
 * An upright cylinder round a model, from its foot to its top: as wide as its
 * footprint on average across and along, or, given `foot`, as wide as the part
 * of it within that height of its foot (a tree's trunk, not its crown).
 */
export function cylinderOf(meshes: Meshes, foot?: number): Cylinder {
  const { min, max } = boundsOf(meshes);
  const x = (min.x + max.x) / 2;
  const z = (min.z + max.z) / 2;
  let radius = (max.x - min.x + max.z - min.z) / 4;
  if (foot !== undefined) {
    const points = pointsOf(meshes);
    radius = 0;
    for (let i = 0; i < points.length; i += 3) {
      if (points[i + 1] <= min.y + foot) radius = Math.max(radius, Math.hypot(points[i] - x, points[i + 2] - z));
    }
  }
  return { kind: "cylinder", x, z, radius, bottom: min.y, top: max.y };
}

/** The body stand-ins are fitted for: who walks through, over and onto them. */
export interface Walker {
  /** Half the width a gap needs to be walked through: the body's own, its skin and a margin. */
  passing: number;
  /** Half the width of the body itself: a surface it stands on is where its middle can be. */
  radius: number;
  /** How high a body stands: anything whose underside is higher is walked under. */
  height: number;
  /** The steepest slope it walks up. */
  maxSlope: number;
}

/** How a kind of piece is fitted. */
export interface Fitting {
  /** How far a stand-in's top may lie from the drawn surface where the body can stand on it. */
  tolerance: number;
  /** How far, near a drawn step of a piece that is climbed: a slope over steps lies up to a riser above the treads. */
  steps: number;
  /**
   * Whether it is climbed, as stairs and steps are: its standing surface may be
   * a slope over the drawn steps, and where it meets the ground at its foot the
   * slope runs down to it, so its first step is no lip.
   */
  climbed: boolean;
}

/**
 * A model seen from above on a grid: each column's highest and lowest point,
 * NaN where nothing is. Read by laying each triangle on the grid, so its cost
 * is the model's size, not a ray for each column against every triangle.
 */
export interface Grid {
  x0: number;
  z0: number;
  step: number;
  nx: number;
  nz: number;
  top: Float32Array;
  bottom: Float32Array;
  /** The model's foot: the lowest it reaches. */
  base: number;
  /** The model's points, three numbers each. */
  points: readonly number[];
}

/** A model's grid, `step` apart over its footprint. */
export function gridOf(meshes: Meshes, step: number, pad = 0): Grid {
  const bounds = boundsOf(meshes);
  bounds.min.x -= pad;
  bounds.min.z -= pad;
  bounds.max.x += pad;
  bounds.max.z += pad;
  const nx = Math.max(1, Math.ceil((bounds.max.x - bounds.min.x) / step - 1e-6));
  const nz = Math.max(1, Math.ceil((bounds.max.z - bounds.min.z) / step - 1e-6));
  const points = pointsOf(meshes);
  const grid: Grid = { x0: bounds.min.x, z0: bounds.min.z, step, nx, nz, top: new Float32Array(nx * nz).fill(NaN), bottom: new Float32Array(nx * nz).fill(NaN), base: bounds.min.y, points };
  const mark = (x: number, y: number, z: number): void => {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - grid.x0) / step)));
    const k = Math.min(nz - 1, Math.max(0, Math.floor((z - grid.z0) / step)));
    const at = k * nx + i;
    if (!(grid.top[at] >= y)) grid.top[at] = y;
    if (!(grid.bottom[at] <= y)) grid.bottom[at] = y;
  };
  const triangles = trianglesOf(meshes, points);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < triangles.length; t += 3) {
    a.fromArray(points, triangles[t] * 3);
    b.fromArray(points, triangles[t + 1] * 3);
    c.fromArray(points, triangles[t + 2] * 3);
    // Its edges, so a face standing upright still marks the columns it stands in.
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (step / 2)));
      for (let s = 0; s <= n; s++) {
        const [x, z] = [p.x + ((q.x - p.x) * s) / n, p.z + ((q.z - p.z) * s) / n];
        // A point on a line between columns belongs to neither: a face standing there is the side of something whose columns its top marks.
        if (onLine((x - grid.x0) / step) || onLine((z - grid.z0) / step)) continue;
        mark(x, p.y + ((q.y - p.y) * s) / n, z);
      }
    }
    // Its face, at the middle of every column it lies over.
    const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(area) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - grid.x0) / step));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - grid.x0) / step));
    const k0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - grid.z0) / step));
    const k1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - grid.z0) / step));
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        const x = grid.x0 + (i + 0.5) * step;
        const z = grid.z0 + (k + 0.5) * step;
        const u = ((b.x - x) * (c.z - z) - (c.x - x) * (b.z - z)) / area;
        const v = ((c.x - x) * (a.z - z) - (a.x - x) * (c.z - z)) / area;
        const w = 1 - u - v;
        if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
        mark(x, u * a.y + v * b.y + w * c.y, z);
      }
    }
  }
  return grid;
}

/** Whether a place measured in columns lies on the line between two. */
const onLine = (at: number): boolean => Math.abs(at - Math.round(at)) < 1e-4;

/** The corners of a model's triangles, by the index of each corner in `pointsOf`. */
function trianglesOf(meshes: Meshes, points: readonly number[]): number[] {
  const triangles: number[] = [];
  let first = 0;
  for (const mesh of meshes) {
    const index = mesh.geometry.index;
    const count = mesh.geometry.getAttribute("position").count;
    if (index === null) for (let i = 0; i < count; i++) triangles.push(first + i);
    else for (let i = 0; i < index.count; i++) triangles.push(first + index.getX(i));
    first += count;
  }
  if (first * 3 !== points.length) throw new Error("physics: a model's points and triangles disagree");
  return triangles;
}

/**
 * What a body makes of a grid's columns: those it stands in or passes
 * through, which stay open, and the solid rest. A column with nothing in it,
 * or only something above the body's height, is open where a body's width
 * fits: where a disc as wide as `passing` can stand wholly in open columns
 * with its middle over the model, or can reach. A narrower gap (a window's
 * sill, the slots between boards, the dips in a hedge's leaves) is filled. A
 * filled column takes the height of its highest neighbour.
 */
export interface Reading {
  grid: Grid;
  /** Open: walked through or under. */
  open: Uint8Array;
  /** Of the open, what has something above the body's height, walked under. */
  over: Uint8Array;
  /** Solid columns' tops, filled where a gap was filled. */
  top: Float32Array;
  /** Solid columns a body's middle can stand over: where its own width fits on the top. */
  stand: Uint8Array;
  /** Open columns within a bump of something solid: a stand-in may cover them, as a hedge's box covers the dips in its leaves. */
  near: Uint8Array;
  /** How far a stand-in's top may lie from each column's drawn top: the fitting's tolerance, or its steps' near a drawn step. */
  tol: Float32Array;
  walker: Walker;
}

export function readGrid(grid: Grid, walker: Walker, fitting: Fitting): Reading {
  const { nx, nz, step } = grid;
  const n = nx * nz;
  // Under a flight, nothing is walked: its stand-in is a slope down to the ground.
  const under = !fitting.climbed;
  const empty = new Uint8Array(n);
  for (let i = 0; i < n; i++) empty[i] = Number.isNaN(grid.top[i]) || (under && grid.bottom[i] - grid.base >= walker.height) ? 1 : 0;
  // Beyond the model is open: a gap that runs out of it is passed through.
  const isEmpty = (i: number, k: number): boolean => i < 0 || k < 0 || i >= nx || k >= nz || empty[k * nx + i] === 1;
  const reach = Math.ceil(walker.passing / step);
  const disc: [number, number][] = [];
  for (let dk = -reach; dk <= reach; dk++) for (let di = -reach; di <= reach; di++) if (Math.hypot(di, dk) * step <= walker.passing) disc.push([di, dk]);
  const fits = new Uint8Array(n);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) if (disc.every(([di, dk]) => isEmpty(i + di, k + dk))) fits[k * nx + i] = 1;
  const open = new Uint8Array(n);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      if (fits[k * nx + i] === 0) continue;
      for (const [di, dk] of disc) {
        const [ii, kk] = [i + di, k + dk];
        if (ii >= 0 && kk >= 0 && ii < nx && kk < nz) open[kk * nx + ii] = 1;
      }
    }
  }
  const over = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (open[i] === 1 && !Number.isNaN(grid.top[i])) over[i] = 1;
  // Filled columns take their highest neighbour's top, spread until every solid column has one.
  const top = new Float32Array(n);
  for (let i = 0; i < n; i++) top[i] = open[i] === 1 || empty[i] === 1 ? NaN : grid.top[i];
  for (let spread = true; spread; ) {
    spread = false;
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const at = k * nx + i;
        if (open[at] === 1 || !Number.isNaN(top[at])) continue;
        let high = NaN;
        for (const [di, dk] of NEIGHBOURS) {
          const [ii, kk] = [i + di, k + dk];
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
          const t = top[kk * nx + ii];
          if (!(t <= high)) high = Number.isNaN(high) || t > high ? t : high;
        }
        if (!Number.isNaN(high)) {
          top[at] = high;
          spread = true;
        }
      }
    }
  }
  // A column nothing solid ever reached (a filled gap wholly surrounded by open ground) stands at the foot.
  for (let i = 0; i < n; i++) if (open[i] === 0 && Number.isNaN(top[i])) top[i] = grid.base;
  // A column is stood over where the body's whole width rests on a surface round it: solid, and nowhere further from its top than a slope it
  // walks and a lip it rides. Not a rail's top beside a lower walk, nor a step's edge between treads; a tread too shallow for the body is
  // stood on as the slope over the flight is.
  const standReach = Math.ceil(walker.radius / step);
  const lip = lipOf(walker);
  const slope = Math.tan(walker.maxSlope);
  const stand = new Uint8Array(n);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      const own = top[k * nx + i];
      let all = open[k * nx + i] === 0;
      for (let dk = -standReach; dk <= standReach && all; dk++) {
        for (let di = -standReach; di <= standReach && all; di++) {
          const d = Math.hypot(di, dk) * step;
          if (d > walker.radius) continue;
          const [ii, kk] = [i + di, k + dk];
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz || open[kk * nx + ii] === 1 || Math.abs(top[kk * nx + ii] - own) > slope * d + lip) all = false;
        }
      }
      if (all) stand[k * nx + i] = 1;
    }
  }
  const bump = Math.ceil(BUMP / step);
  const near = new Uint8Array(n);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      if (open[k * nx + i] === 0) continue;
      for (let dk = -bump; dk <= bump && near[k * nx + i] === 0; dk++) {
        for (let di = -bump; di <= bump; di++) {
          const [ii, kk] = [i + di, k + dk];
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz || Math.hypot(di, dk) * step > BUMP) continue;
          if (open[kk * nx + ii] === 0) {
            near[k * nx + i] = 1;
            break;
          }
        }
      }
    }
  }
  // Near a drawn step of a climbed piece, the steps' tolerance: a slope over steps stands up to a riser above the treads.
  const tol = new Float32Array(n).fill(fitting.tolerance);
  if (fitting.climbed) {
    const lip = lipOf(walker);
    const reachSteps = Math.ceil(STEP_REACH / step);
    const tread = Math.ceil(TREAD / step);
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const at = k * nx + i;
        if (open[at] === 1) continue;
        // A step up, not a rail: past the riser the ground goes on at least as high for a tread, where past a rail it drops away.
        const stepped = NEIGHBOURS.some(([di, dk]) => {
          const [ii, kk] = [i + di, k + dk];
          if (ii < 0 || kk < 0 || ii >= nx || kk >= nz || open[kk * nx + ii] === 1) return false;
          const riser = top[kk * nx + ii];
          if (riser - top[at] <= lip) return false;
          for (let d = 1; d <= tread; d++) {
            const [iii, kkk] = [ii + di * d, kk + dk * d];
            if (iii < 0 || kkk < 0 || iii >= nx || kkk >= nz || open[kkk * nx + iii] === 1 || top[kkk * nx + iii] < riser - lip) return false;
          }
          return true;
        });
        if (!stepped) continue;
        for (let dk = -reachSteps; dk <= reachSteps; dk++) {
          for (let di = -reachSteps; di <= reachSteps; di++) {
            const [ii, kk] = [i + di, k + dk];
            if (ii >= 0 && kk >= 0 && ii < nx && kk < nz) tol[kk * nx + ii] = fitting.steps;
          }
        }
      }
    }
  }
  return { grid, open, over, top, stand, near, tol, walker };
}

/** How far a stand-in may stand out past what it stands for, where a body only bumps into it: the dips in a hedge's leaves, the sag of an arc between two hulls along it. */
const BUMP = 0.06;

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** How much higher two neighbouring lines of columns stand on average for a cut between them to be a natural seam: a rail beside a walk, a step's edge. */
const SEAM = 0.05;
/** How high above its foot a model's edge may stand and still run down to the ground beyond it, for a piece that is climbed. */
const FOOT = 0.25;
/** How much gentler than the steepest a body walks a slope run down to the ground at a climbed piece's foot is: well inside the limit, so it is never a wall by a rounding. */
const EASE = 0.8;
/** How far back from a drawn step's riser its tread may lie under a slope: about a tread. */
const STEP_REACH = 0.25;
/** How far the ground past a riser goes on at least as high for it to be a step, not a rail: wider than a rail, and no deeper than the kits' shallowest tread with the next step after it. */
const TREAD = 0.2;

/**
 * A model's stand-ins: the fewest boxes and wedges that keep every gap a
 * body passes through open and match every surface it stands on to within
 * the fitting's tolerance. Each patch of solid columns is tried as one box
 * at its highest top, then as one wedge on the plane through its tops; a patch
 * neither fits is cut in two, at its sharpest seam (a rail beside a walk, a
 * step's edge) or else across its middle, and each half tried again. What a
 * body only bumps into (a wall's face, a rail, a hedge's leaves) may be rough:
 * only where a body's middle can stand is the top held to the drawn one.
 * Whatever hangs above a body's height over a gap it walks through is boxed
 * on its own, so it stays walked under.
 */
export function fitStandIns(meshes: Meshes, walker: Walker, fitting: Fitting, step: number): Shape[] {
  // One hull of the whole model, where it keeps the rule: a roof, a rock, a bridge's arch.
  const whole = [hullOf(meshes)];
  if (!fitting.climbed && keeps(meshes, whole, walker, fitting, step)) return whole;
  const reading = readGrid(gridOf(meshes, step), walker, fitting);
  const { grid } = reading;
  const shapes: Shape[] = [];
  // What stands no higher than a lip the body rides over needs no shape: the ground holds it, and its drawn surface still lifts the feet.
  const lip = lipOf(walker);
  const solid = (at: number): boolean => reading.open[at] === 0 && reading.top[at] - grid.base > lip;
  const overhead = (into: Shape[]): void => {
    fitPatch(reading, walker, { ...fitting, tolerance: Infinity, steps: Infinity, climbed: false }, 0, 0, grid.nx - 1, grid.nz - 1, (at) => reading.over[at] === 1, true, into);
  };
  if (fitting.climbed) {
    // A climbed piece as its flights, each a slope across the whole piece, the higher of them where they meet, as an inner corner's two
    // flights do; whatever stands above them by more than a bump (a wall beside a ramp, a rail) is fitted on its own.
    const flights = flightsOf(reading, walker);
    if (flights.length > 0) {
      const under = shapesGrid(flights, grid);
      const tried: Shape[] = [...flights];
      fitPatch(reading, walker, fitting, 0, 0, grid.nx - 1, grid.nz - 1, (at) => solid(at) && !(reading.top[at] - under.top[at] <= BUMP), false, tried);
      overhead(tried);
      if (keeps(meshes, tried, walker, fitting, step)) return joined(tried);
    }
  }
  fitPatch(reading, walker, fitting, 0, 0, grid.nx - 1, grid.nz - 1, solid, false, shapes);
  overhead(shapes);
  return joined(shapes);
}

/** Shapes with their boxes of one height that touch joined. */
function joined(shapes: readonly Shape[]): Shape[] {
  const boxes = shapes.filter((s): s is Box => s.kind === "box");
  return [...mergeBoxes(boxes), ...shapes.filter((s) => s.kind !== "box")];
}

/**
 * A climbed piece's flights: one for each edge it climbs away from, its
 * profile going in (the lowest of the piece's tops across it, so where two
 * flights meet the other's steps don't raise it), laid across the piece's whole
 * width, and run down to the ground beyond the edge.
 */
function flightsOf(r: Reading, walker: Walker): Hull[] {
  const { grid } = r;
  const { nx, nz, step } = grid;
  const lip = lipOf(walker);
  const slope = Math.tan(walker.maxSlope);
  const inward = Math.ceil(STEP_REACH / step);
  const flights: Hull[] = [];
  // Each edge by the axis it climbs along and the way in from it.
  for (const [alongX, fromLow] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ] as const) {
    const length = alongX ? nx : nz;
    const width = alongX ? nz : nx;
    const at = (s: number, w: number): number => {
      const along = fromLow ? s : length - 1 - s;
      return alongX ? w * nx + along : along * nx + w;
    };
    // The profile going in: the lowest solid top across the piece at each step in.
    const profile: number[] = [];
    for (let s = 0; s < length; s++) {
      let low = Infinity;
      for (let w = 0; w < width; w++) if (r.open[at(s, w)] === 0) low = Math.min(low, r.top[at(s, w)]);
      profile.push(low);
    }
    const edge = profile[0];
    if (!Number.isFinite(edge) || edge - grid.base > FOOT || !(profile[Math.min(length - 1, inward)] - edge > lip)) continue;
    // A point at a distance in from the edge (negative: beyond it) and across, in the model's frame.
    const point = (d: number, w: number, y: number): number[] => {
      const along = fromLow ? d : length * step - d;
      return alongX ? [grid.x0 + along, y, grid.z0 + w] : [grid.x0 + w, y, grid.z0 + along];
    };
    const span = width * step;
    const points: number[] = [];
    for (const w of [0, span]) {
      points.push(...point(-(edge - grid.base) / (slope * EASE), w, grid.base), ...point(length * step, w, grid.base));
      for (let s = 0; s < length; s++) if (Number.isFinite(profile[s])) points.push(...point(s * step, w, profile[s]), ...point((s + 1) * step, w, profile[s]));
    }
    flights.push({ kind: "hull", points });
  }
  return flights;
}

/** Whether stand-ins keep the rule for a model: its surfaces matched where a body stands, its gaps open, and a climbed piece climbable. */
export function keeps(meshes: Meshes, shapes: readonly Shape[], walker: Walker, fitting: Fitting, step: number): boolean {
  const { excess, blocked, climbed } = judge(meshes, shapes, walker, fitting, step);
  return excess <= step && blocked === 0 && climbed !== false;
}

/** Fit the columns `belongs` picks within a patch of the grid, from column `i0`, `k0` to `i1`, `k1`, onto `shapes`. Overhead patches stand on their own undersides. */
function fitPatch(r: Reading, walker: Walker, fitting: Fitting, i0: number, k0: number, i1: number, k1: number, belongs: (at: number) => boolean, overhead: boolean, shapes: Shape[]): void {
  const { grid } = r;
  const { nx, step } = grid;
  // The box round what belongs in the patch.
  let [a0, b0, a1, b1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      if (!belongs(k * nx + i)) continue;
      a0 = Math.min(a0, i);
      a1 = Math.max(a1, i);
      b0 = Math.min(b0, k);
      b1 = Math.max(b1, k);
    }
  }
  if (a0 > a1) return;
  let high = -Infinity;
  let low = Infinity;
  let mixed = false;
  const buried: number[] = [];
  for (let k = b0; k <= b1; k++) {
    for (let i = a0; i <= a1; i++) {
      const at = k * nx + i;
      if (!belongs(at)) {
        if (r.open[at] === 1 && r.near[at] === 0) mixed = true;
        else if (r.open[at] === 0 && others(r, at)) buried.push(at);
        continue;
      }
      high = Math.max(high, overhead ? grid.top[at] : r.top[at]);
      low = Math.min(low, overhead ? grid.bottom[at] : grid.base);
    }
  }
  // Someone else's surface under a box at this patch's height (a flight beside a wall) is not to be buried.
  if (!overhead && buried.some((at) => high - r.top[at] > BUMP)) mixed = true;
  const x0 = grid.x0 + a0 * step;
  const x1 = grid.x0 + (a1 + 1) * step;
  const z0 = grid.z0 + b0 * step;
  const z1 = grid.z0 + (b1 + 1) * step;
  if (fitting.climbed && !overhead) {
    // A climbed patch is first the hull of its steps, run down to the ground at its foot: a flight's slope along its noses.
    const hull = hullOfPatch(r, walker, fitting, a0, b0, a1, b1, belongs);
    if (hull !== null) {
      shapes.push(hull);
      return;
    }
  }
  if (!mixed) {
    // One box, if the surface it stands for is level enough: its top the highest a body stands on, with a trim or a leaf standing a bump higher cut off.
    let standHigh = -Infinity;
    for (let k = b0; k <= b1; k++) for (let i = a0; i <= a1; i++) if (r.stand[k * nx + i] === 1) standHigh = Math.max(standHigh, r.top[k * nx + i]);
    const top = overhead || standHigh === -Infinity || high - standHigh > BUMP ? high : standHigh;
    // Level: over every top a body stands on by no more than its tolerance; and on a climbed piece, where every step is walked onto, over
    // every other by no more than a bump. Elsewhere what is only bumped into may be rough.
    let level = true;
    for (let k = b0; k <= b1 && level; k++) {
      for (let i = a0; i <= a1; i++) {
        const at = k * nx + i;
        if (!belongs(at)) continue;
        if (r.stand[at] === 1 ? top - r.top[at] > r.tol[at] : fitting.climbed && top - r.top[at] > Math.max(BUMP, r.tol[at])) level = false;
      }
    }
    if (overhead || level) {
      shapes.push(box([x0, low, z0], [x1, top, z1]));
      return;
    }
    // One wedge on the plane through its tops, if they lie on one.
    const wedge = wedgeOf(r, walker, fitting, a0, b0, a1, b1);
    if (wedge !== null) {
      shapes.push(wedge);
      return;
    }
  } else if (!overhead) {
    // One hull round what is solid, if it covers nothing a body walks through: a stretch of an arc.
    const hull = hullOver(r, fitting, a0, b0, a1, b1, belongs, high);
    if (hull !== null) {
      shapes.push(hull);
      return;
    }
  }
  if (!overhead) {
    // The hull of the model's own points over the patch: a roof's facets, a rock's face, a basin's rim.
    const hull = hullOfPatch(r, walker, fitting, a0, b0, a1, b1, belongs);
    if (hull !== null) {
      shapes.push(hull);
      return;
    }
  }
  if (a0 === a1 && b0 === b1) {
    shapes.push(box([x0, low, z0], [x1, high, z1]));
    return;
  }
  const [alongX, at] = cutOf(r, belongs, a0, b0, a1, b1);
  if (alongX) {
    fitPatch(r, walker, fitting, a0, b0, at, b1, belongs, overhead, shapes);
    fitPatch(r, walker, fitting, at + 1, b0, a1, b1, belongs, overhead, shapes);
  } else {
    fitPatch(r, walker, fitting, a0, b0, a1, at, belongs, overhead, shapes);
    fitPatch(r, walker, fitting, a0, at + 1, a1, b1, belongs, overhead, shapes);
  }
}

/**
 * A hull standing on the ground round the solid columns of a patch, at their
 * highest top: null where it would cover an open column a body walks through,
 * further than a bump from what is solid, or stand further than the tolerance
 * above a surface a body stands on.
 */
function hullOver(r: Reading, fitting: Fitting, a0: number, b0: number, a1: number, b1: number, belongs: (at: number) => boolean, high: number): Hull | null {
  const { grid } = r;
  const { nx, step } = grid;
  const corners: THREE.Vector2[] = [];
  for (let k = b0; k <= b1; k++) {
    for (let i = a0; i <= a1; i++) {
      const at = k * nx + i;
      if (!belongs(at)) continue;
      if (r.stand[at] === 1 && high - r.top[at] > r.tol[at]) return null;
      for (const [di, dk] of CORNERS) corners.push(new THREE.Vector2(grid.x0 + (i + di) * step, grid.z0 + (k + dk) * step));
    }
  }
  const outline = outlineOf(corners);
  for (let k = b0; k <= b1; k++) {
    for (let i = a0; i <= a1; i++) {
      const at = k * nx + i;
      if (belongs(at)) continue;
      if (r.open[at] === 0) {
        if (others(r, at) && high - r.top[at] > BUMP && inside(outline, grid.x0 + (i + 0.5) * step, grid.z0 + (k + 0.5) * step)) return null;
        continue;
      }
      if (r.near[at] === 1) continue;
      if (inside(outline, grid.x0 + (i + 0.5) * step, grid.z0 + (k + 0.5) * step)) return null;
    }
  }
  const points: number[] = [];
  for (const p of outline) points.push(p.x, grid.base, p.y, p.x, Math.max(high, grid.base + 0.01), p.y);
  return { kind: "hull", points };
}

const CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

/** The convex outline round points on the ground, anticlockwise (Andrew's monotone chain). */
function outlineOf(points: THREE.Vector2[]): THREE.Vector2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: THREE.Vector2[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Whether a point lies inside an anticlockwise convex outline. */
function inside(outline: readonly THREE.Vector2[], x: number, z: number): boolean {
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if ((b.x - a.x) * (z - a.y) - (b.y - a.y) * (x - a.x) < -1e-9) return false;
  }
  return outline.length >= 3;
}

/**
 * The hull of the model's own points over a patch, standing on the ground:
 * null where it lies further than the tolerance from a surface a body stands
 * on, misses something solid, stands more than a bump over something only
 * bumped into, or covers an open column a body walks through.
 */
function hullOfPatch(r: Reading, walker: Walker, fitting: Fitting, a0: number, b0: number, a1: number, b1: number, belongs: (at: number) => boolean): Hull | null {
  const { grid } = r;
  const { nx, step } = grid;
  const [x0, x1, z0, z1] = [grid.x0 + a0 * step, grid.x0 + (a1 + 1) * step, grid.z0 + b0 * step, grid.z0 + (b1 + 1) * step];
  // The tops of its own columns, at their corners: a face crossing the patch from beyond it has no corner in it.
  const points: number[] = [];
  for (let k = b0; k <= b1; k++) {
    for (let i = a0; i <= a1; i++) {
      if (!belongs(k * nx + i)) continue;
      for (const [di, dk] of CORNERS) points.push(grid.x0 + (i + di) * step, r.top[k * nx + i], grid.z0 + (k + dk) * step);
    }
  }
  for (const x of [x0, x1]) for (const z of [z0, z1]) points.push(x, grid.base, z);
  if (fitting.climbed) points.push(...footOf(r, walker, a0, b0, a1, b1));
  if (points.length < 15) return null;
  const hull: Hull = { kind: "hull", points };
  let columns: { top: Float32Array; bottom: Float32Array };
  try {
    columns = shapesGrid([hull], grid, a0, b0, a1, b1);
  } catch {
    // Flat, or in a line: no hull.
    return null;
  }
  for (let k = b0; k <= b1; k++) {
    for (let i = a0; i <= a1; i++) {
      const at = k * nx + i;
      const t = columns.top[at];
      const covers = !Number.isNaN(t) && columns.bottom[at] - grid.base < walker.height;
      if (!belongs(at)) {
        if (covers && r.open[at] === 1 && r.near[at] === 0) return null;
        if (covers && r.open[at] === 0 && others(r, at) && t - r.top[at] > BUMP) return null;
        continue;
      }
      if (Number.isNaN(t)) return null;
      if (r.stand[at] === 1 ? Math.abs(t - r.top[at]) > r.tol[at] : fitting.climbed && t - r.top[at] > Math.max(BUMP, r.tol[at])) return null;
    }
  }
  return hull;
}

/**
 * The ground beyond a climbed piece's low edges, where a patch meets them: a
 * hull taking these in runs its slope down to the ground, so the first step is
 * no lip. Each edge column low enough to step up onto from the ground puts a
 * point on the ground beyond it, as far out as the steepest slope needs.
 */
function footOf(r: Reading, walker: Walker, a0: number, b0: number, a1: number, b1: number): number[] {
  const { grid } = r;
  const { nx, nz, step } = grid;
  const points: number[] = [];
  const out = (t: number): number => (t - grid.base) / (Math.tan(walker.maxSlope) * EASE);
  const inward = Math.ceil(STEP_REACH / step);
  const lip = lipOf(walker);
  const edge = (i: number, k: number, dx: number, dz: number): void => {
    const t = r.top[k * nx + i];
    if (r.open[k * nx + i] === 1 || t - grid.base > FOOT) return;
    // Only an edge the piece climbs away from: its tops rise going in.
    const [ii, kk] = [Math.min(nx - 1, Math.max(0, i - dx * inward)), Math.min(nz - 1, Math.max(0, k - dz * inward))];
    if (!(r.top[kk * nx + ii] - t > lip)) return;
    const x = grid.x0 + (i + 0.5 + dx / 2) * step + dx * out(t);
    const z = grid.z0 + (k + 0.5 + dz / 2) * step + dz * out(t);
    points.push(x, grid.base, z);
  };
  for (let k = b0; k <= b1; k++) {
    if (a0 === 0) edge(0, k, -1, 0);
    if (a1 === nx - 1) edge(nx - 1, k, 1, 0);
  }
  for (let i = a0; i <= a1; i++) {
    if (b0 === 0) edge(i, 0, 0, -1);
    if (b1 === nz - 1) edge(i, nz - 1, 0, 1);
  }
  return points;
}

/** Whether a solid column left out of a fit is someone else's surface, standing above a lip: what another shape stands for. */
function others(r: Reading, at: number): boolean {
  return r.top[at] - r.grid.base > lipOf(r.walker);
}

/** Where to cut a patch: between the two neighbouring lines of columns whose tops differ most, if any differ by a seam, or else across the middle of its longer side. Says whether the cut runs between columns along x, and after which. */
function cutOf(r: Reading, belongs: (at: number) => boolean, a0: number, b0: number, a1: number, b1: number): [boolean, number] {
  const { nx } = r.grid;
  let best: [boolean, number, number] = [a1 - a0 >= b1 - b0, -1, 0];
  const score = (alongX: boolean, line: number): number => {
    let sum = 0;
    let n = 0;
    const [from, to] = alongX ? [b0, b1] : [a0, a1];
    for (let j = from; j <= to; j++) {
      const [p, q] = alongX ? [j * nx + line, j * nx + line + 1] : [line * nx + j, (line + 1) * nx + j];
      if (!belongs(p) || !belongs(q)) continue;
      sum += Math.abs(r.top[p] - r.top[q]);
      n++;
    }
    return n === 0 ? 0 : sum / n;
  };
  for (let i = a0; i < a1; i++) {
    const s = score(true, i);
    if (s > best[2]) best = [true, i, s];
  }
  for (let k = b0; k < b1; k++) {
    const s = score(false, k);
    if (s > best[2]) best = [false, k, s];
  }
  if (best[2] >= SEAM) return [best[0], best[1]];
  const alongX = a1 - a0 >= b1 - b0;
  return [alongX, alongX ? Math.floor((a0 + a1) / 2) : Math.floor((b0 + b1) / 2)];
}

/**
 * A wedge standing on the ground under a patch, its top on the plane that
 * best fits the patch's tops, raised to lie over every one: null where it lies
 * further than the tolerance from the drawn tops where a body stands, or slopes
 * too steeply to stand on. A climbed piece's patch at the piece's edge, low
 * enough to be stepped up onto from the ground, runs its plane down to the
 * ground beyond that edge.
 */
function wedgeOf(r: Reading, walker: Walker, fitting: Fitting, a0: number, b0: number, a1: number, b1: number): Hull | null {
  const { grid } = r;
  const { nx, nz, step } = grid;
  // The plane is fitted to where a body stands, or to every top where it stands nowhere.
  const samples: [number, number, number, number][] = [];
  for (let k = b0; k <= b1; k++) {
    for (let i = a0; i <= a1; i++) {
      const at = k * nx + i;
      if (r.open[at] === 0) samples.push([grid.x0 + (i + 0.5) * step, grid.z0 + (k + 0.5) * step, r.top[at], at]);
    }
  }
  const standing = samples.filter(([, , , at]) => r.stand[at] === 1);
  const fitted: [number, number, number][] = (standing.length >= 3 ? standing : samples).map(([x, z, t]) => [x, z, t]);
  if (fitting.climbed) {
    // The ground beyond the piece's low edges, so a flight's first step is no lip.
    const edge = (i: number, k: number, x: number, z: number): void => {
      const t = r.top[k * nx + i];
      if (t - grid.base <= FOOT) fitted.push([x, z, grid.base]);
    };
    for (let k = b0; k <= b1; k++) {
      const z = grid.z0 + (k + 0.5) * step;
      if (a0 === 0) edge(0, k, grid.x0 - step / 2, z);
      if (a1 === nx - 1) edge(nx - 1, k, grid.x0 + (nx + 0.5) * step, z);
    }
    for (let i = a0; i <= a1; i++) {
      const x = grid.x0 + (i + 0.5) * step;
      if (b0 === 0) edge(i, 0, x, grid.z0 - step / 2);
      if (b1 === nz - 1) edge(i, nz - 1, x, grid.z0 + (nz + 0.5) * step);
    }
  }
  const plane = planeOf(fitted);
  if (plane === null || !plane.every(Number.isFinite)) return null;
  const [p, q, c] = plane;
  if (Math.hypot(p, q) > Math.tan(walker.maxSlope)) return null;
  // Raised to lie over every top a body stands on, and every other but a bump.
  let lift = 0;
  for (const [x, z, t, at] of samples) lift = Math.max(lift, t - (p * x + q * z + c) - (r.stand[at] === 1 ? 0 : BUMP));
  // On a climbed piece, nowhere over what is walked onto by more than a bump.
  if (fitting.climbed) for (const [x, z, t, at] of samples) if (r.stand[at] === 0 && p * x + q * z + c + lift - t > Math.max(BUMP, r.tol[at])) return null;
  let error = 0;
  for (let k = b0; k <= b1; k++) {
    for (let i = a0; i <= a1; i++) {
      if (r.stand[k * nx + i] === 0) continue;
      const [x, z, t] = [grid.x0 + (i + 0.5) * step, grid.z0 + (k + 0.5) * step, r.top[k * nx + i]];
      error = Math.max(error, p * x + q * z + c + lift - t - r.tol[k * nx + i]);
    }
  }
  if (error > 0) return null;
  // Its corners: the patch's, or beyond the piece's edge where the plane runs down to the ground.
  let [x0, x1, z0, z1] = [grid.x0 + a0 * step, grid.x0 + (a1 + 1) * step, grid.z0 + b0 * step, grid.z0 + (b1 + 1) * step];
  if (fitting.climbed) {
    // Run out along the way it climbs, no further than the steepest slope from the highest foot would need.
    const groundAt = (x: number, z: number): number => p * x + q * z + c + lift - grid.base;
    const most = FOOT / Math.tan(walker.maxSlope);
    const out = (height: number, slope: number): number => Math.min(most, Math.max(0, height / slope));
    const steep = Math.max(Math.abs(p), Math.abs(q));
    if (a0 === 0 && p > 0 && p === steep) x0 -= out(groundAt(x0, (z0 + z1) / 2), p);
    if (a1 === nx - 1 && p < 0 && -p === steep) x1 += out(groundAt(x1, (z0 + z1) / 2), -p);
    if (b0 === 0 && q > 0 && q === steep) z0 -= out(groundAt((x0 + x1) / 2, z0), q);
    if (b1 === nz - 1 && q < 0 && -q === steep) z1 += out(groundAt((x0 + x1) / 2, z1), -q);
  }
  const points: number[] = [];
  for (const x of [x0, x1]) {
    for (const z of [z0, z1]) points.push(x, grid.base, z, x, Math.max(grid.base + 0.01, p * x + q * z + c + lift), z);
  }
  return { kind: "hull", points };
}

/** The plane y = p·x + q·z + c that best fits some points (x, z, y), by least squares; null where they don't fix one. */
function planeOf(points: readonly (readonly [number, number, number])[]): [number, number, number] | null {
  let [sx, sz, sy, sxx, szz, sxz, sxy, szy] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const [x, z, y] of points) {
    sx += x;
    sz += z;
    sy += y;
    sxx += x * x;
    szz += z * z;
    sxz += x * z;
    sxy += x * y;
    szy += z * y;
  }
  const n = points.length;
  const m = new THREE.Matrix3().set(sxx, sxz, sx, sxz, szz, sz, sx, sz, n);
  if (Math.abs(m.determinant()) < 1e-12) {
    // All in a line or a point: level, at their highest.
    return [0, 0, Math.max(...points.map(([, , y]) => y))];
  }
  const v = new THREE.Vector3(sxy, szy, sy).applyMatrix3(m.invert());
  return [v.x, v.y, v.z];
}

/** What a body finds in stand-ins against the model they stand for. */
export interface Judgement {
  /** The furthest a stand-in's top lies from the drawn surface where a body stands on it, above or below. */
  surface: number;
  /** The furthest it lies beyond what it may there: 0 where every surface is within its tolerance. */
  excess: number;
  /** Columns a body passes through in the drawn model that the stand-ins block. */
  blocked: number;
  /** For a piece that is climbed: whether its top is reached from its foot without a slope too steep or a lip too high. */
  climbed: boolean | null;
}

/** How high a lip a body's round foot rides over without stepping. */
export function lipOf(walker: Walker): number {
  return walker.radius * (1 - Math.cos(walker.maxSlope));
}

/** Judge a model's stand-ins by what a body finds: surfaces where it stands, gaps it passes, and, for a piece that is climbed, whether it can be. */
export function judge(meshes: Meshes, shapes: readonly Shape[], walker: Walker, fitting: Fitting, step: number): Judgement {
  // Round the model, the ground a climbed piece's slope runs out onto.
  const pad = fitting.climbed ? Math.ceil(FOOT / (Math.tan(walker.maxSlope) * EASE) / step) + 1 : 0;
  const drawn = readGrid(gridOf(meshes, step, pad * step), walker, fitting);
  const { grid } = drawn;
  const { nx, nz } = grid;
  /** Whether a column is the model's own, not the ground round it a climbed piece's slope runs out onto. */
  const own = (at: number): boolean => {
    const [i, k] = [at % nx, Math.floor(at / nx)];
    return i >= pad && k >= pad && i < nx - pad && k < nz - pad;
  };
  const standIn = shapesGrid(shapes, grid);
  let surface = 0;
  let excess = 0;
  let blocked = 0;
  for (let at = 0; at < nx * nz; at++) {
    if (!own(at)) continue;
    if (drawn.open[at] === 1) {
      if (drawn.near[at] === 0 && !Number.isNaN(standIn.top[at]) && standIn.bottom[at] - grid.base < walker.height) blocked++;
      continue;
    }
    if (drawn.stand[at] === 1 && !Number.isNaN(standIn.top[at])) {
      const off = Math.abs(standIn.top[at] - drawn.top[at]);
      surface = Math.max(surface, off);
      excess = Math.max(excess, off - drawn.tol[at]);
    }
  }
  let climbed: boolean | null = null;
  // A climbed piece with no edge low enough to step up onto from the ground (a bridge's middle span) is climbed from its neighbours, not judged alone.
  let foot = false;
  for (let k = pad; k < nz - pad; k++) {
    for (let i = pad; i < nx - pad; i++) {
      const at = k * nx + i;
      const edge = i === pad || k === pad || i === nx - pad - 1 || k === nz - pad - 1;
      if (edge && drawn.open[at] === 0 && drawn.top[at] - grid.base <= FOOT) foot = true;
    }
  }
  if (fitting.climbed && foot) {
    // From every edge column low enough to step onto from the ground, walk to the highest standing column.
    const rise = Math.tan(walker.maxSlope) * grid.step + lipOf(walker);
    const height = (at: number): number => (Number.isNaN(standIn.top[at]) ? grid.base : standIn.top[at]);
    const reached = new Uint8Array(nx * nz);
    const queue: number[] = [];
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const at = k * nx + i;
        if ((i === 0 || k === 0 || i === nx - 1 || k === nz - 1) && height(at) - grid.base <= rise) {
          reached[at] = 1;
          queue.push(at);
        }
      }
    }
    while (queue.length > 0) {
      const at = queue.pop() as number;
      const [i, k] = [at % nx, Math.floor(at / nx)];
      for (const [di, dk] of NEIGHBOURS) {
        const [ii, kk] = [i + di, k + dk];
        if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
        const next = kk * nx + ii;
        if (reached[next] === 1 || Math.abs(height(next) - height(at)) > rise) continue;
        reached[next] = 1;
        queue.push(next);
      }
    }
    let highest = -Infinity;
    let made = -Infinity;
    for (let at = 0; at < nx * nz; at++) {
      if (drawn.stand[at] === 0) continue;
      highest = Math.max(highest, drawn.top[at]);
      if (reached[at] === 1) made = Math.max(made, height(at));
    }
    climbed = made >= highest - 0.15;
  }
  return { surface, excess, blocked, climbed };
}

/** Stand-ins laid on a model's grid: each column's top and the underside below it, read from each shape's own form. */
function shapesGrid(shapes: readonly Shape[], grid: Grid, i0 = 0, k0 = 0, i1 = grid.nx - 1, k1 = grid.nz - 1): { top: Float32Array; bottom: Float32Array } {
  const spans = shapes.map((shape) => spanOf(shape));
  const n = grid.nx * grid.nz;
  const top = new Float32Array(n).fill(NaN);
  const bottom = new Float32Array(n).fill(NaN);
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      const x = grid.x0 + (i + 0.5) * grid.step;
      const z = grid.z0 + (k + 0.5) * grid.step;
      for (const span of spans) {
        const got = span(x, z);
        if (got === null) continue;
        const at = k * grid.nx + i;
        if (!(top[at] >= got[1])) top[at] = got[1];
        if (!(bottom[at] <= got[0])) bottom[at] = got[0];
      }
    }
  }
  return { top, bottom };
}

/** Where a shape stands on a vertical line through a point on the ground: its underside and its top there, or null where it doesn't. */
function spanOf(shape: Shape): (x: number, z: number) => [number, number] | null {
  if (shape.kind === "box") {
    const [x0, y0, z0] = shape.min;
    const [x1, y1, z1] = shape.max;
    return (x, z) => (x >= x0 && x <= x1 && z >= z0 && z <= z1 ? [y0, y1] : null);
  }
  if (shape.kind === "cylinder") return (x, z) => (Math.hypot(x - shape.x, z - shape.z) <= shape.radius ? [shape.bottom, shape.top] : null);
  // A hull: under every face that looks up, over every face that looks down, and inside every face that looks out sideways.
  const seen = new Set<string>();
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < shape.points.length; i += 3) {
    const key = `${Math.round(shape.points[i] * 1e4)},${Math.round(shape.points[i + 1] * 1e4)},${Math.round(shape.points[i + 2] * 1e4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(new THREE.Vector3(shape.points[i], shape.points[i + 1], shape.points[i + 2]));
  }
  const faces = new ConvexHull().setFromPoints(points).faces.map((face) => [face.normal.x, face.normal.y, face.normal.z, face.constant] as const);
  if (faces.length < 4) throw new Error("physics: a stand-in hull has no volume");
  return (x, z) => {
    let low = -Infinity;
    let high = Infinity;
    for (const [nx, ny, nz, c] of faces) {
      const across = c - nx * x - nz * z;
      if (ny > 1e-6) high = Math.min(high, across / ny);
      else if (ny < -1e-6) low = Math.max(low, across / ny);
      else if (across < -1e-6) return null;
    }
    return low <= high ? [low, high] : null;
  };
}

/** A ring of `count` hulls round an upright axis, from one radius out to another: a basin's rim. */
export function ring(x: number, z: number, inner: number, outer: number, bottom: number, top: number, count: number): Hull[] {
  return Array.from({ length: count }, (_, n): Hull => {
    const points: number[] = [];
    for (const a of [(n / count) * Math.PI * 2, ((n + 1) / count) * Math.PI * 2]) {
      for (const r of [inner, outer]) for (const y of [bottom, top]) points.push(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
    }
    return { kind: "hull", points };
  });
}

/** A shape where a matrix puts it, the matrix turning by quarter turns only, so a box stays along the axes. */
export function placeShape(shape: Shape, matrix: THREE.Matrix4): Shape {
  const v = new THREE.Vector3();
  if (shape.kind === "cylinder") {
    v.set(shape.x, 0, shape.z).applyMatrix4(matrix);
    const y = matrix.elements[13];
    return { ...shape, x: v.x, z: v.z, bottom: shape.bottom + y, top: shape.top + y };
  }
  if (shape.kind === "hull") {
    const points: number[] = [];
    for (let i = 0; i < shape.points.length; i += 3) {
      v.set(shape.points[i], shape.points[i + 1], shape.points[i + 2]).applyMatrix4(matrix);
      points.push(v.x, v.y, v.z);
    }
    return { kind: "hull", points };
  }
  const placed = new THREE.Box3(new THREE.Vector3(...shape.min), new THREE.Vector3(...shape.max)).applyMatrix4(matrix);
  return box([placed.min.x, placed.min.y, placed.min.z], [placed.max.x, placed.max.y, placed.max.z]);
}

/**
 * Boxes joined where two of the same height share a whole face, again and
 * again, so a run of paving or a row of wall pieces is one box: nothing
 * between them for a body sliding along to catch on.
 */
export function mergeBoxes(boxes: readonly Box[]): Box[] {
  const merged = [...boxes];
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-4;
  for (let joined = true; joined; ) {
    joined = false;
    for (let i = 0; i < merged.length && !joined; i++) {
      for (let j = i + 1; j < merged.length && !joined; j++) {
        const a = merged[i];
        const b = merged[j];
        if (!near(a.min[1], b.min[1]) || !near(a.max[1], b.max[1])) continue;
        const alongX = near(a.min[2], b.min[2]) && near(a.max[2], b.max[2]) && (near(a.max[0], b.min[0]) || near(b.max[0], a.min[0]));
        const alongZ = near(a.min[0], b.min[0]) && near(a.max[0], b.max[0]) && (near(a.max[2], b.min[2]) || near(b.max[2], a.min[2]));
        if (!alongX && !alongZ) continue;
        merged[i] = box([Math.min(a.min[0], b.min[0]), a.min[1], Math.min(a.min[2], b.min[2])], [Math.max(a.max[0], b.max[0]), a.max[1], Math.max(a.max[2], b.max[2])]);
        merged.splice(j, 1);
        joined = true;
      }
    }
  }
  return merged;
}

/** A shape as a collider's description. Fails loudly on a hull with no volume, which would be no collider at all. */
export function shapeDesc(rapier: Rapier, shape: Shape): RAPIER.ColliderDesc {
  if (shape.kind === "box") {
    const [x0, y0, z0] = shape.min;
    const [x1, y1, z1] = shape.max;
    return rapier.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2).setTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
  if (shape.kind === "cylinder") {
    return rapier.ColliderDesc.cylinder((shape.top - shape.bottom) / 2, shape.radius).setTranslation(shape.x, (shape.bottom + shape.top) / 2, shape.z);
  }
  const desc = rapier.ColliderDesc.convexHull(Float32Array.from(shape.points));
  if (desc === null) throw new Error("physics: a stand-in hull has no volume");
  return desc;
}
