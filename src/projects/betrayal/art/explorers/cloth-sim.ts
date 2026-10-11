import * as THREE from "three";
import { deforming, reshaped } from "../forms";
import { paletteHex, type PaletteKey } from "../palette";
import type { Leg } from "./figure";
import { pageSearch } from "../page-search";

/*
 * Cloth that really moves: simulated, rather than worked out from the clock
 * as `heavyCloth` is. It hangs from an anchor (a figure's hips, a shoulder, a
 * hat) and swings as the anchor moves and turns, lags when it stops, is
 * pushed aside by the legs and lifted by the wind. It is a net
 * (`clothNet`): points joined by distance constraints, solved by
 * position-based dynamics, its top pinned to the anchor; a sheet (a skirt,
 * a cape) or a single strand (a ribbon, a pigtail).
 *
 * It runs in world space on fixed steps (`STEP`) of the stage's clock, so a
 * run is the same at any frame rate: a frame takes as many whole steps as its
 * clock has passed, with the anchor and the legs moved between the last frame's
 * pose and this one's. A frozen clock takes no steps, so a frozen screenshot
 * shows the same cloth however many frames are drawn. A clock that jumps (a
 * screenshot tool freezing it somewhere new, a tab waking) starts the cloth
 * again from rest and warms it a fixed number of steps (`WARM`) in the pose it
 * has now, so where it lands depends only on that pose.
 *
 * The legs are capsules, and push cloth one way only: out from the axis it
 * hangs round (or out along its outward side, for a sheet), so a point can
 * never be pushed through to a leg's far side. However hard a step is (a run,
 * a sharp turn), no point moves further in one than `MOST` past where the
 * anchor carries it, nor strays further than its `swing` from where it hangs,
 * so the cloth can't explode. A miniature turns far more sharply than a person
 * (a corner at a run is about 4 g), so cloth feels only a share of the
 * anchor's starts, stops and turns (`inertia`).
 *
 * A net's mesh is rebuilt from its points each frame (`clothSheet`), its
 * colours fixed on its surface.
 */

/** A simulation step, in seconds. */
export const STEP = 1 / 120;
/** How many steps cloth warms from rest when its clock jumps. */
export const WARM = 90;
/** The longest gap between two frames, in seconds, that the cloth steps through rather than starting again. */
const GAP = 0.25;
/** The furthest a point moves in a step, past where its anchor carries it, in metres: 3 m/s at `STEP`. */
const MOST = 0.025;
/** How many times a step's constraints and collisions are solved. */
const ITERATIONS = 6;
const GRAVITY = new THREE.Vector3(0, -9.81, 0);

/** A leg, or any limb cloth can't pass through: a segment and its radius, in the world. */
export interface Capsule {
  a: THREE.Vector3;
  b: THREE.Vector3;
  radius: number;
}

/** What cloth hangs in at one moment, in the world. */
export interface ClothMoment {
  /** The frame the cloth hangs from. */
  anchor: THREE.Matrix4;
  capsules: Capsule[];
  /** The wind's velocity, in metres a second. */
  wind: THREE.Vector3;
  /** The height cloth can't fall through, or null. */
  floor: number | null;
}

export function clothMoment(capsules: number): ClothMoment {
  return {
    anchor: new THREE.Matrix4(),
    capsules: Array.from({ length: capsules }, () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      radius: 0,
    })),
    wind: new THREE.Vector3(),
    floor: null,
  };
}

function copyMoment(from: ClothMoment, to: ClothMoment) {
  to.anchor.copy(from.anchor);
  to.wind.copy(from.wind);
  to.floor = from.floor;
  if (from.capsules.length !== to.capsules.length) throw new Error("A cloth's legs can't change in number");
  from.capsules.forEach((capsule, i) => {
    to.capsules[i].a.copy(capsule.a);
    to.capsules[i].b.copy(capsule.b);
    to.capsules[i].radius = capsule.radius;
  });
}

/** Work counted, for the cost of a piece of cloth. */
export interface ClothWork {
  steps: number;
  /** Points moved by the integrator. */
  points: number;
  /** Distance constraints solved. */
  constraints: number;
  /** Collision tests, a point or an edge against a leg. */
  collisions: number;
  /** Mesh vertices rebuilt. */
  vertices: number;
}

const noWork = (): ClothWork => ({
  steps: 0,
  points: 0,
  constraints: 0,
  collisions: 0,
  vertices: 0,
});

/** A simulation of cloth hung from an anchor. */
export interface ClothBody {
  /** Puts the cloth at rest, as it hangs at `at`. */
  reset: (at: ClothMoment) => void;
  /** Moves the cloth on one step, `from` one moment `to` the next. */
  step: (from: ClothMoment, to: ClothMoment) => void;
  /** Clears the legs as they are `at` a moment between steps (the frame's own), moving no cloth on. */
  fit: (at: ClothMoment) => void;
  /** Carries the cloth rigidly `by` a move of its anchor (from where its last step left it to the frame's own moment). */
  carry: (by: THREE.Matrix4) => void;
  /** The points as they stand, in the world: x, y, z a point. */
  readonly points: Float64Array;
  readonly work: ClothWork;
}

/** How cloth moves between where it is and where it hangs. */
export interface ClothFeel {
  /** How fast it swings back to how it hangs, in swings a second: a stiff panel's spring, or a net's starch. */
  frequency: number;
  /** How quickly, per second, it is brought to move as the place it hangs from moves: high, and the cloth barely
   *  lags; low, and it swings long after a start, a stop or a turn. */
  follow: number;
  /** How much of the anchor's starts, stops and turns the cloth feels, from 0 (it rides the anchor rigidly) to 1
   *  (all of them, as loose cloth would): a miniature's turns are far sharper than a person's. */
  inertia: number;
  /** How much of a spin on the spot (a twirl) the cloth feels, from 0 to 1, where it isn't travelling: a turn on the
   *  spot is slow and meant to be seen, a corner at a run is sharp, so the two are felt differently. Without it, a
   *  spin is felt as `inertia` says. */
  spin?: number;
  /** The furthest the cloth's hem strays from where it hangs, in metres; nearer the anchor, proportionally less. */
  swing: number;
  /** How hard the air (and the wind) drags it, per second. */
  drag: number;
  /** How far the cloth's inside lies inside its points at its hem, in metres: legs keep that much clear of a point. */
  room: number;
  /** The same where it hangs from the anchor (a waistband sits close), growing evenly down to `room` at the hem. */
  roomAtTop: number;
}

/** Points of cloth in the world, each with its velocity and where it hangs in the anchor's frame. */
function pointSet(rest: Float64Array, pinned: (i: number) => boolean) {
  const count = rest.length / 3;
  return {
    count,
    rest: Float64Array.from(rest),
    at: new Float64Array(rest.length),
    before: new Float64Array(rest.length),
    velocity: new Float64Array(rest.length),
    /** 0 for a point pinned to the anchor, 1 for one free. */
    free: Float64Array.from({ length: count }, (_, i) => (pinned(i) ? 0 : 1)),
  };
}
type Points = ReturnType<typeof pointSet>;

const scratch = {
  m: new THREE.Matrix4(),
  carry: new THREE.Matrix4(),
  v: new THREE.Vector3(),
  w: new THREE.Vector3(),
  u: new THREE.Vector3(),
  q0: new THREE.Quaternion(),
  q1: new THREE.Quaternion(),
};

function hangAt(points: Points, anchor: THREE.Matrix4) {
  const e = anchor.elements;
  const { rest, at, before, velocity } = points;
  for (let i = 0; i < points.count; i++) {
    const x = rest[i * 3];
    const y = rest[i * 3 + 1];
    const z = rest[i * 3 + 2];
    at[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    at[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    at[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  before.set(at);
  velocity.fill(0);
}

/** How fast, in radians a second, the anchor spins as cloth's pleats begin to open, and fully. */
const SPINNING = { from: 1.5, to: 4 };
/** How fast, in metres a second, the anchor travels below which it counts as turning on the spot, fully by the first. */
const ON_THE_SPOT = { still: 0.15, moving: 0.8 };

/** How the anchor moves from one moment to the next: how fast it travels, how fast it spins (radians a second), and
 *  how far it is from travelling (1 turning on the spot, 0 on the move). */
function anchorMotion(from: ClothMoment, to: ClothMoment) {
  const f = from.anchor.elements;
  const t = to.anchor.elements;
  const speed = Math.hypot(t[12] - f[12], t[13] - f[13], t[14] - f[14]) / STEP;
  scratch.q0.setFromRotationMatrix(from.anchor);
  scratch.q1.setFromRotationMatrix(to.anchor);
  const spin = scratch.q0.angleTo(scratch.q1) / STEP;
  return { speed, spin, still: 1 - THREE.MathUtils.smoothstep(speed, ON_THE_SPOT.still, ON_THE_SPOT.moving) };
}

/**
 * One step of the points' motion, before constraints. Each free point is
 * first carried by the anchor's move as far as the cloth doesn't feel it
 * (`inertia`), so a start, a stop or a sharp turn swings the cloth by only
 * that share of what it would swing loose; then it is pulled towards where it
 * hangs (`frequency`), brought to move as the rest of that move would carry it
 * (`follow`), dragged by the air towards the wind, and pulled down by
 * `gravity`. No point moves further than `MOST` past where the anchor carries
 * it. Pinned points go where they hang. A point's velocity is kept without
 * the share it was carried, so it is only the cloth's own swing.
 */
function integrate(points: Points, from: ClothMoment, to: ClothMoment, feel: ClothFeel, gravity: number, work: ClothWork) {
  const dt = STEP;
  const k = (feel.frequency * Math.PI * 2) ** 2;
  const c = feel.follow;
  const felt = feel.inertia;
  // A spin on the spot is felt as `spin` says; travelling, every turn as `inertia` does.
  const turning = feel.inertia + ((feel.spin ?? feel.inertia) - feel.inertia) * anchorMotion(from, to).still;
  const f = from.anchor.elements;
  const t = to.anchor.elements;
  // How far the anchor travels this step: the part of its move every point rides alike, apart from its turn.
  const mx = t[12] - f[12];
  const my = t[13] - f[13];
  const mz = t[14] - f[14];
  // What the anchor's move from one moment to the next does to a point that rides it.
  const carry = scratch.carry.copy(to.anchor).multiply(scratch.m.copy(from.anchor).invert()).elements;
  const { rest, at, before, velocity, free } = points;
  const wind = to.wind;
  for (let i = 0; i < points.count; i++) {
    const j = i * 3;
    const rx = rest[j];
    const ry = rest[j + 1];
    const rz = rest[j + 2];
    const hx = t[0] * rx + t[4] * ry + t[8] * rz + t[12];
    const hy = t[1] * rx + t[5] * ry + t[9] * rz + t[13];
    const hz = t[2] * rx + t[6] * ry + t[10] * rz + t[14];
    if (free[i] === 0) {
      before[j] = at[j] = hx;
      before[j + 1] = at[j + 1] = hy;
      before[j + 2] = at[j + 2] = hz;
      continue;
    }
    const px = at[j];
    const py = at[j + 1];
    const pz = at[j + 2];
    const cx = carry[0] * px + carry[4] * py + carry[8] * pz + carry[12];
    const cy = carry[1] * px + carry[5] * py + carry[9] * pz + carry[13];
    const cz = carry[2] * px + carry[6] * py + carry[10] * pz + carry[14];
    // Carried the share of the anchor's travel and of its turn it doesn't feel, which never counts as its own velocity.
    const ax = mx * (1 - felt) + (cx - px - mx) * (1 - turning);
    const ay = my * (1 - felt) + (cy - py - my) * (1 - turning);
    const az = mz * (1 - felt) + (cz - pz - mz) * (1 - turning);
    before[j] = at[j] = px + ax;
    before[j + 1] = at[j + 1] = py + ay;
    before[j + 2] = at[j + 2] = pz + az;
    // The share of its hanging place's velocity left for the cloth to make up itself: of the travel, and of the turn.
    const hvx = (mx * felt + (hx - (f[0] * rx + f[4] * ry + f[8] * rz + f[12]) - mx) * turning) / dt;
    const hvy = (my * felt + (hy - (f[1] * rx + f[5] * ry + f[9] * rz + f[13]) - my) * turning) / dt;
    const hvz = (mz * felt + (hz - (f[2] * rx + f[6] * ry + f[10] * rz + f[14]) - mz) * turning) / dt;
    const vx = velocity[j];
    const vy = velocity[j + 1];
    const vz = velocity[j + 2];
    // The air drags on how fast the cloth really moves: its own swing, and the share it was carried.
    // The air moves a heavy part (a weighted hem) less: `free` is how light it is, from 1 down.
    const drag = feel.drag * free[i];
    velocity[j] = vx + dt * (k * (hx - at[j]) + c * (hvx - vx) + drag * (wind.x - vx - ax / dt));
    velocity[j + 1] = vy + dt * (k * (hy - at[j + 1]) + c * (hvy - vy) + drag * (wind.y - vy - ay / dt) + gravity * GRAVITY.y);
    velocity[j + 2] = vz + dt * (k * (hz - at[j + 2]) + c * (hvz - vz) + drag * (wind.z - vz - az / dt));
    const dx = at[j] + velocity[j] * dt - cx;
    const dy = at[j + 1] + velocity[j + 1] * dt - cy;
    const dz = at[j + 2] + velocity[j + 2] * dt - cz;
    const far = Math.hypot(dx, dy, dz);
    const kept = far > MOST ? MOST / far : 1;
    at[j] = cx + dx * kept;
    at[j + 1] = cy + dy * kept;
    at[j + 2] = cz + dz * kept;
  }
  work.points += points.count;
}

/** Holds each free point within `swing` of where it hangs, scaled by how far down the cloth it is (`depth`, 0 to 1). */
function holdNear(points: Points, anchor: THREE.Matrix4, swing: number, depth: Float64Array) {
  const t = anchor.elements;
  const { rest, at, free } = points;
  for (let i = 0; i < points.count; i++) {
    if (free[i] === 0) continue;
    const j = i * 3;
    const rx = rest[j];
    const ry = rest[j + 1];
    const rz = rest[j + 2];
    const hx = t[0] * rx + t[4] * ry + t[8] * rz + t[12];
    const hy = t[1] * rx + t[5] * ry + t[9] * rz + t[13];
    const hz = t[2] * rx + t[6] * ry + t[10] * rz + t[14];
    const dx = at[j] - hx;
    const dy = at[j + 1] - hy;
    const dz = at[j + 2] - hz;
    const far = Math.hypot(dx, dy, dz);
    const most = swing * depth[i];
    if (far <= most) continue;
    at[j] = hx + (dx * most) / far;
    at[j + 1] = hy + (dy * most) / far;
    at[j + 2] = hz + (dz * most) / far;
  }
}

/** Moves the points, and turns their velocities, rigidly `by` a move. */
function carryPoints(points: Points, by: THREE.Matrix4) {
  const e = by.elements;
  const { at, velocity } = points;
  for (let k = 0; k < points.count; k++) {
    const j = k * 3;
    const x = at[j];
    const y = at[j + 1];
    const z = at[j + 2];
    at[j] = e[0] * x + e[4] * y + e[8] * z + e[12];
    at[j + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    at[j + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    const vx = velocity[j];
    const vy = velocity[j + 1];
    const vz = velocity[j + 2];
    velocity[j] = e[0] * vx + e[4] * vy + e[8] * vz;
    velocity[j + 1] = e[1] * vx + e[5] * vy + e[9] * vz;
    velocity[j + 2] = e[2] * vx + e[6] * vy + e[10] * vz;
  }
}

/** After the constraints have moved the points, their velocity is how far they went this step. */
function settleVelocity(points: Points) {
  const { at, before, velocity } = points;
  for (let i = 0; i < at.length; i++) velocity[i] = (at[i] - before[i]) / STEP;
}

/** The point on a capsule's axis nearest (x, y, z), into `out`. */
function nearestOnAxis(capsule: Capsule, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  const { a, b } = capsule;
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const ez = b.z - a.z;
  const long = ex * ex + ey * ey + ez * ez;
  const u = long === 0 ? 0 : THREE.MathUtils.clamp(((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / long, 0, 1);
  return out.set(a.x + ex * u, a.y + ey * u, a.z + ez * u);
}

export interface NetShape {
  /** The points as they hang, in the anchor's frame, a row at a time from the top: x, y, z a point. */
  rest: Float64Array;
  /** Points in a row; 1 for a single strand. */
  around: number;
  /** Rows, from the top, which is pinned to the anchor. */
  down: number;
  /** Whether a row closes on itself (a skirt) or ends (a cape). */
  closed: boolean;
  /** Which way, across a row and down it, the cloth's outside faces: 1 for (along the row) × (down), −1 for the other. */
  outward: 1 | -1;
  /** Whether it hangs round the anchor's vertical axis with the legs inside it (a skirt, a robe): then a leg pushes it
   *  straight out from the axis, and its top can stretch out over a leg right under it. */
  round?: boolean;
  /** Whether its pinned top row gives to a leg right under it (a waistband over a raised thigh), or never moves. */
  waistband?: boolean;
}

/** How a net hangs: its feel, and how much its weight pulls it down (0 for cloth whose starch holds its shape). */
export interface NetFeel extends ClothFeel {
  weight: number;
  /** How much longer its rows may grow at the hem (less towards the top) as pleats or gathers open, while it spins on
   *  the spot: a twirling skirt flies out because its folds open. 0 for cloth with none. */
  pleats?: number;
  /** How stiffly it bends, from 0 (it ripples) to 1 (it folds in broad folds only). */
  bend: number;
  /** How much heavier its hem is than its top: 0 for an even cloth, 2 for a hem three times its top's weight (a
   *  weighted robe, a dress's turned-up hem), which hangs it straight and holds it against the air. */
  hem: number;
}

/** A fabric: how a garment's cloth moves, apart from how much room it leaves its legs, which is the garment's. */
export type Fabric = Omit<NetFeel, "room" | "roomAtTop">;

/** The fabrics garments are made of. */
export const FABRICS = {
  /** A child's cotton dress of middling weight, pleated: it sways with her, flies out when she twirls, and settles. */
  cottonDress: { frequency: 1.2, follow: 4, inertia: 0.35, spin: 1, pleats: 0.35, drag: 0.45, swing: 0.1, bend: 0.5, hem: 1, weight: 1 },
  /** A heavy wool robe to the floor, its hem weighted: it swings slowly in broad folds, never flaps, and settles
   *  quickly; a spin still swings it round, slowly and with weight. */
  heavyWool: { frequency: 1, follow: 7, inertia: 0.25, spin: 0.7, pleats: 0.08, drag: 0.2, swing: 0.08, bend: 0.85, hem: 2.5, weight: 1 },
  /** A spirit's gauze: light, loose and slow, lifted by every breath of air. */
  gauze: { frequency: 0.7, follow: 2, inertia: 0.5, spin: 1, drag: 1.2, swing: 0.18, bend: 0.2, hem: 0, weight: 0.6 },
} satisfies Record<string, Fabric>;

/**
 * A net of points joined by distance constraints across and down (and, two
 * apart, against bending), solved by position-based dynamics, its top row
 * pinned to the anchor and the rest pulled, as starch pulls a petticoat,
 * towards how it hangs. A leg pushes the cloth out along its outward side,
 * at the points and along each row between them; a strand (one point a row)
 * is pushed straight off the leg.
 */
export interface Net extends ClothBody {
  /** Hangs the net in a new shape (as `NetShape.rest` gives it), its lengths with it: a skirt deepening as she walks. */
  reshape: (rest: Float64Array) => void;
}

export function clothNet(shape: NetShape, feel: NetFeel): Net {
  const { around, down, closed } = shape;
  const index = (i: number, j: number) => j * around + ((i + around) % around);
  const points = pointSet(shape.rest, (i) => i < around);
  // A heavier hem: each free point is lighter towards the top, which its constraints and the air both feel.
  for (let k = around; k < points.count; k++) points.free[k] = 1 / (1 + feel.hem * (Math.floor(k / around) / Math.max(1, down - 1)) ** 2);
  const constraints: {
    a: number;
    b: number;
    length: number;
    stiffness: number;
    /** How much longer it may grow as the cloth's pleats open (a share of its length, all of it open). */
    opens: number;
  }[] = [];
  const apart = (a: number, b: number) => {
    const r = points.rest;
    return Math.hypot(r[a * 3] - r[b * 3], r[a * 3 + 1] - r[b * 3 + 1], r[a * 3 + 2] - r[b * 3 + 2]);
  };
  const join = (a: number, b: number, stiffness: number, opens = 0) => constraints.push({ a, b, length: apart(a, b), stiffness, opens });
  for (let j = 0; j < down; j++) {
    // Pleats open across a row, most at the hem.
    const opens = (feel.pleats ?? 0) * (j / Math.max(1, down - 1));
    for (let i = 0; i < around; i++) {
      if (j + 1 < down) join(index(i, j), index(i, j + 1), 1);
      if (j + 2 < down) join(index(i, j), index(i, j + 2), feel.bend);
      if (around > 1 && (closed || i + 1 < around)) join(index(i, j), index(i + 1, j), 1, opens);
      if (around > 2 && (closed || i + 2 < around)) join(index(i, j), index(i + 2, j), feel.bend, opens);
    }
  }
  // Each point is tethered to the pinned point at the top of its column, never further from it than it hangs, so
  // however hard the cloth is yanked it never stretches out long.
  const tethers = Array.from({ length: points.count - around }, (_, n) => {
    const k = n + around;
    const top = k % around;
    return { k, top, length: apart(k, top) };
  });
  const netDepth = Float64Array.from({ length: points.count }, (_, k) => Math.floor(k / around) / Math.max(1, down - 1));
  const work = noWork();
  const normals = new Float64Array(points.at.length);
  const near = new THREE.Vector3();

  /** The cloth's outward side at each point, from its neighbours across and down, in the frame `positions` are in (unnormalised for a strand). */
  const sides = (positions: Float64Array, out: Float64Array) => {
    const p = (k: number, axis: number) => positions[k * 3 + axis];
    for (let j = 0; j < down; j++) {
      for (let i = 0; i < around; i++) {
        const k = index(i, j);
        const [left, right] = closed ? [index(i - 1, j), index(i + 1, j)] : [index(Math.max(0, i - 1), j), index(Math.min(around - 1, i + 1), j)];
        const up = index(i, Math.max(0, j - 1));
        const below = index(i, Math.min(down - 1, j + 1));
        const ax = p(right, 0) - p(left, 0);
        const ay = p(right, 1) - p(left, 1);
        const az = p(right, 2) - p(left, 2);
        const dx = p(below, 0) - p(up, 0);
        const dy = p(below, 1) - p(up, 1);
        const dz = p(below, 2) - p(up, 2);
        let [nx, ny, nz] = [ay * dz - az * dy, az * dx - ax * dz, ax * dy - ay * dx];
        const long = Math.hypot(nx, ny, nz) || 1;
        [nx, ny, nz] = [(nx / long) * shape.outward, (ny / long) * shape.outward, (nz / long) * shape.outward];
        out[k * 3] = nx;
        out[k * 3 + 1] = ny;
        out[k * 3 + 2] = nz;
      }
    }
  };

  /** Pushes the stretch of cloth between points `a` and `b` (the same point for a strand), at its part nearest a leg, out of the leg. */
  const pushOut = (a: number, b: number, capsule: Capsule) => {
    work.collisions++;
    const at = points.at;
    const ax = at[a * 3];
    const ay = at[a * 3 + 1];
    const az = at[a * 3 + 2];
    const bx = at[b * 3];
    const by = at[b * 3 + 1];
    const bz = at[b * 3 + 2];
    // The leg's axis nearest the stretch, found from its middle, then the stretch's point nearest that.
    nearestOnAxis(capsule, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, near);
    const ex = bx - ax;
    const ey = by - ay;
    const ez = bz - az;
    const long = ex * ex + ey * ey + ez * ez;
    const u = long === 0 ? 0 : THREE.MathUtils.clamp(((near.x - ax) * ex + (near.y - ay) * ey + (near.z - az) * ez) / long, 0, 1);
    const qx = ax + ex * u;
    const qy = ay + ey * u;
    const qz = az + ez * u;
    nearestOnAxis(capsule, qx, qy, qz, near);
    const ox = qx - near.x;
    const oy = qy - near.y;
    const oz = qz - near.z;
    const clear = capsule.radius + feel.room;
    let [nx, ny, nz] = [0, 0, 0];
    let depth: number;
    if (around === 1) {
      // A strand has no outside: it leaves the leg the nearest way.
      const off = Math.hypot(ox, oy, oz);
      if (off >= clear || off === 0) return;
      [nx, ny, nz, depth] = [ox / off, oy / off, oz / off, clear - off];
    } else {
      [nx, ny, nz] = [
        normals[a * 3] * (1 - u) + normals[b * 3] * u,
        normals[a * 3 + 1] * (1 - u) + normals[b * 3 + 1] * u,
        normals[a * 3 + 2] * (1 - u) + normals[b * 3 + 2] * u,
      ];
      const n = Math.hypot(nx, ny, nz) || 1;
      [nx, ny, nz] = [nx / n, ny / n, nz / n];
      const out = ox * nx + oy * ny + oz * nz;
      const across = Math.hypot(ox - out * nx, oy - out * ny, oz - out * nz);
      if (across >= clear) return;
      const half = Math.sqrt(clear * clear - across * across);
      // Only a leg the cloth touches pushes it: one wholly past its outside, along it, doesn't.
      if (out >= half || out <= -half) return;
      depth = half - out;
    }
    const [wa, wb] = a === b ? [1, 0] : [(1 - u) * points.free[a], u * points.free[b]];
    const share = wa * wa + wb * wb;
    if (share === 0) return;
    const s = depth / share;
    for (const [k, w] of [
      [a, wa],
      [b, wb],
    ] as const) {
      if (w === 0) continue;
      // Touched right by a pinned point, a free one can't lever the cloth clear: it moves no further than the leg is wide.
      const move = Math.min(w * s, clear);
      at[k * 3] += nx * move;
      at[k * 3 + 1] += ny * move;
      at[k * 3 + 2] += nz * move;
    }
  };

  const legs: Capsule[] = [];
  const bounds = new Float64Array(64);
  const nearest = new THREE.Vector3();
  // Where the cloth is tested against the legs: each point, halfway to the next round its row, halfway to the one
  // below, and the middle of the four, each with the points it lies between.
  const samples: { corners: number[]; weights: number[]; row: number }[] = [];
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < around; i++) {
      const a = index(i, j);
      const b = index(i + 1, j);
      const [c, d] = j + 1 < down ? [index(i, j + 1), index(i + 1, j + 1)] : [a, b];
      for (const [across, downward] of [
        [0, 0],
        [0.5, 0],
        [0, 0.5],
        [0.5, 0.5],
      ]) {
        if (downward > 0 && c === a) continue;
        samples.push({
          corners: [a, b, c, d],
          weights: [(1 - across) * (1 - downward), across * (1 - downward), (1 - across) * downward, across * downward],
          row: j,
        });
      }
    }
  }
  const [into, localPoints, pushes] = [new THREE.Matrix4(), new Float64Array(points.at.length), new Float64Array(points.count)];
  /**
   * Pushes the cloth hung round the anchor's axis straight out from it,
   * wherever a leg inside reaches it: at each point and halfway between
   * each point and the next round its row. The top row too (it is pinned
   * again next step), so a waistband stretches over a raised thigh. The
   * bottom row is pushed by a leg coming up from below as it comes.
   */
  const clearRound = (moment: ClothMoment) => {
    into.copy(moment.anchor).invert();
    moment.capsules.forEach((capsule, n) => {
      legs[n] ??= { a: new THREE.Vector3(), b: new THREE.Vector3(), radius: 0 };
      legs[n].a.copy(capsule.a).applyMatrix4(into);
      legs[n].b.copy(capsule.b).applyMatrix4(into);
      legs[n].radius = capsule.radius;
    });
    legs.length = moment.capsules.length;
    const at = points.at;
    const e = into.elements;
    for (let k = 0; k < points.count; k++) {
      const x = at[k * 3];
      const y = at[k * 3 + 1];
      const z = at[k * 3 + 2];
      localPoints[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      localPoints[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      localPoints[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    pushes.fill(0);
    // Each leg's middle and how far from it the leg reaches, so a part of the cloth nowhere near it skips it.
    legs.forEach((leg, n) => {
      bounds[n * 4] = (leg.a.x + leg.b.x) / 2;
      bounds[n * 4 + 1] = (leg.a.y + leg.b.y) / 2;
      bounds[n * 4 + 2] = (leg.a.z + leg.b.z) / 2;
      bounds[n * 4 + 3] = leg.a.distanceTo(leg.b) / 2 + leg.radius + feel.room;
    });
    for (const { corners, weights, row } of samples) {
      const room = feel.roomAtTop + (feel.room - feel.roomAtTop) * netDepth[row * around];
      let px = 0;
      let py = 0;
      let pz = 0;
      for (let n = 0; n < 4; n++) {
        px += localPoints[corners[n] * 3] * weights[n];
        py += localPoints[corners[n] * 3 + 1] * weights[n];
        pz += localPoints[corners[n] * 3 + 2] * weights[n];
      }
      const r = Math.hypot(px, pz) || 1;
      const ex = px / r;
      const ez = pz / r;
      let push = 0;
      for (let n = 0; n < legs.length; n++) {
        const leg = legs[n];
        if (Math.hypot(px - bounds[n * 4], py - bounds[n * 4 + 1], pz - bounds[n * 4 + 2]) > bounds[n * 4 + 3]) continue;
        const reach = leg.radius + room;
        // The leg where it comes nearest this part of the cloth, and its two ends: a foot pointing out from the
        // axis reaches further out at its toe than where it is nearest.
        nearestOnAxis(leg, px, py, pz, nearest);
        for (let end = 0; end < 3; end++) {
          const sphere = end === 0 ? nearest : end === 1 ? leg.a : leg.b;
          work.collisions++;
          const along = (sphere.x - px) * -ez + (sphere.z - pz) * ex;
          const below = py - sphere.y;
          // A leg below the hem (a heel kicked up) pushes it only as far as it reaches the hem's edge, and fades in
          // as it starts to touch, so the hem never jumps out to meet a leg already outside it.
          const share = row === down - 1 && below > 0 ? 1 - THREE.MathUtils.smoothstep(below, reach * 0.8, reach) : 1;
          const across = Math.hypot(along, below);
          if (share === 0 || across >= reach) continue;
          push = Math.max(push, share * (sphere.x * ex + sphere.z * ez + Math.sqrt(reach * reach - across * across) - r));
        }
      }
      if (push <= 0) continue;
      // Between points, each of them goes out as far, so the cloth between them clears the leg; a pinned point (the
      // waistband) gives only to a leg on its own row, and the free points below go out far enough for both.
      let free = 0;
      for (let n = 0; n < 4; n++) if (points.free[corners[n]] > 0) free += weights[n];
      const offRow = weights[2] + weights[3] > 0;
      for (let n = 0; n < 4; n++) {
        if (weights[n] === 0) continue;
        const pinned = points.free[corners[n]] === 0;
        if (pinned && ((offRow && free > 0) || !shape.waistband)) continue;
        pushes[corners[n]] = Math.max(pushes[corners[n]], pinned || !offRow || free >= 1 ? push : Math.min(push / free, push * 2));
      }
    }
    const t = moment.anchor.elements;
    for (let k = 0; k < points.count; k++) {
      const push = pushes[k];
      if (push === 0) continue;
      const r = Math.hypot(localPoints[k * 3], localPoints[k * 3 + 2]) || 1;
      const ex = localPoints[k * 3] / r;
      const ez = localPoints[k * 3 + 2] / r;
      at[k * 3] += (t[0] * ex + t[8] * ez) * push;
      at[k * 3 + 1] += (t[1] * ex + t[9] * ez) * push;
      at[k * 3 + 2] += (t[2] * ex + t[10] * ez) * push;
    }
  };

  const clear = (moment: ClothMoment) => {
    if (shape.round) {
      clearRound(moment);
      return;
    }
    for (const capsule of moment.capsules) {
      for (let j = 1; j < down; j++) {
        for (let i = 0; i < around; i++) {
          // Down from the row above, and along the row.
          pushOut(index(i, j - 1), index(i, j), capsule);
          if (around > 1 && (closed || i + 1 < around)) pushOut(index(i, j), index(i + 1, j), capsule);
        }
      }
    }
  };

  /** How far its pleats are open this step: only while it spins on the spot. */
  let opened = 0;
  const solve = (moment: ClothMoment) => {
    const { at, free } = points;
    sides(at, normals);
    const clearAll = () => {
      clear(moment);
      if (moment.floor !== null) {
        for (let k = around; k < points.count; k++) at[k * 3 + 1] = Math.max(at[k * 3 + 1], moment.floor + feel.room);
      }
    };
    // Each pass pushes the cloth off the legs first, and lets its constraints carry the push along it after, so the
    // cloth moves aside as a whole rather than bulging where it is pushed; a last push makes sure no leg is left inside.
    for (let pass = 0; pass < ITERATIONS; pass++) {
      // Pushed off the legs every other pass, which is all the constraints need to carry a push along.
      if (pass % 2 === 0) clearAll();
      // Held near where it hangs before its constraints, so a hem held back never stretches to stay in reach.
      holdNear(points, moment.anchor, feel.swing * (1 + opened), netDepth);
      for (const { a, b, length, stiffness, opens } of constraints) {
        const share = free[a] + free[b];
        if (share === 0) continue;
        const dx = at[b * 3] - at[a * 3];
        const dy = at[b * 3 + 1] - at[a * 3 + 1];
        const dz = at[b * 3 + 2] - at[a * 3 + 2];
        const long = Math.hypot(dx, dy, dz) || 1;
        // Open pleats let it grow up to their length, freely, and no further.
        const most = length * (1 + opens * opened);
        const to = long > most ? most : long > length ? long : length;
        if (to === long) continue;
        const s = (stiffness * (long - to)) / long / share;
        at[a * 3] += dx * s * free[a];
        at[a * 3 + 1] += dy * s * free[a];
        at[a * 3 + 2] += dz * s * free[a];
        at[b * 3] -= dx * s * free[b];
        at[b * 3 + 1] -= dy * s * free[b];
        at[b * 3 + 2] -= dz * s * free[b];
      }
      for (const { k, top, length } of tethers) {
        const dx = at[k * 3] - at[top * 3];
        const dy = at[k * 3 + 1] - at[top * 3 + 1];
        const dz = at[k * 3 + 2] - at[top * 3 + 2];
        const long = Math.hypot(dx, dy, dz);
        if (long <= length) continue;
        const s = length / long;
        at[k * 3] = at[top * 3] + dx * s;
        at[k * 3 + 1] = at[top * 3 + 1] + dy * s;
        at[k * 3 + 2] = at[top * 3 + 2] + dz * s;
      }
      work.constraints += constraints.length + tethers.length;
    }
    clearAll();
  };

  return {
    points: points.at,
    work,
    reset: (at) => hangAt(points, at.anchor),
    step: (from, to) => {
      work.steps++;
      const motion = anchorMotion(from, to);
      opened = motion.still * THREE.MathUtils.smoothstep(motion.spin, SPINNING.from, SPINNING.to);
      integrate(points, from, to, feel, feel.weight, work);
      solve(to);
      settleVelocity(points);
    },
    carry: (by) => carryPoints(points, by),
    fit: (at) => {
      sides(points.at, normals);
      clear(at);
    },
    reshape: (rest) => {
      points.rest.set(rest);
      for (const constraint of constraints) constraint.length = apart(constraint.a, constraint.b);
      for (const tether of tethers) tether.length = apart(tether.k, tether.top);
    },
  };
}

/** How a net's cloth is drawn: the mesh rebuilt from its points each frame. */
export interface SheetLook {
  /** Samples round a row, and down from the top row to the bottom, the mesh is drawn with. */
  across: number;
  down: number;
  /** How far the cloth's inside lies in from its outside. */
  thickness: number;
  /** How far in from the net its outside lies, `u` round it (0 to 1) and `v` down it (0 to 1): a pleat's fold, an
   *  underskirt's tier. */
  inset: (u: number, v: number) => number;
  /** The cloth's colour, outside or in. */
  colour: (u: number, v: number, inside: boolean) => PaletteKey;
}

/** Catmull-Rom weights for a share `f` of the way between the second and third of four points. */
function catmullRom(f: number): [number, number, number, number] {
  const f2 = f * f;
  const f3 = f * f * f;
  return [(-f3 + 2 * f2 - f) / 2, (3 * f3 - 5 * f2 + 2) / 2, (-3 * f3 + 4 * f2 + f) / 2, (f3 - f2) / 2];
}

/**
 * A net's cloth as a mesh, rebuilt from its points each frame: a smooth
 * surface through them (Catmull-Rom across and down), its outside folded in
 * where `look.inset` says, a cloth's thickness to its inside, and a rim
 * along its bottom edge. Its colours are its own and never move on it, so
 * its look stays on its surface as it moves.
 */
/** The geometries of simulated cloth's sheets: surfaces with no solid inside them, which the clipping check, comparing
 *  rigid parts, leaves out. How a sheet keeps out of the legs is the simulation's own to test (`cloth-trial.slow.test.ts`). */
const sheets = new WeakSet<THREE.BufferGeometry>();

/** Whether a geometry is a simulated cloth's sheet. */
export function isClothSheet(geometry: THREE.BufferGeometry): boolean {
  return sheets.has(geometry);
}

export function clothSheet(body: ClothBody, shape: Pick<NetShape, "around" | "down" | "closed" | "outward">, look: SheetLook) {
  const { around, down, closed } = shape;
  const A = look.across;
  const D = look.down;
  // Where each sample lies among the net's points: its four columns and four rows, and their weights.
  const columns = Array.from({ length: A }, (_, a) => {
    const at = closed ? (a / A) * around : (a / (A - 1)) * (around - 1);
    const i = Math.min(Math.floor(at), closed ? around - 1 : around - 2);
    const ids = [i - 1, i, i + 1, i + 2].map((c) => (closed ? (c + around) % around : THREE.MathUtils.clamp(c, 0, around - 1)));
    return { ids, weights: catmullRom(at - i) };
  });
  const rows = Array.from({ length: D }, (_, d) => {
    const at = (d / (D - 1)) * (down - 1);
    const j = Math.min(Math.floor(at), down - 2);
    return {
      ids: [j - 1, j, j + 1, j + 2].map((r) => THREE.MathUtils.clamp(r, 0, down - 1)),
      weights: catmullRom(at - j),
    };
  });
  const u = (a: number) => (closed ? a / A : a / (A - 1));
  const v = (d: number) => d / (D - 1);

  // The outside, the inside, then the rim along the bottom: its outside edge and its inside edge again, facing down.
  const grid = A * D;
  const count = grid * 2 + A * 2;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const paint = (vertex: number, key: PaletteKey) => {
    const { r, g, b } = new THREE.Color(paletteHex(key));
    colours.set([r, g, b], vertex * 3);
  };
  for (let d = 0; d < D; d++) {
    for (let a = 0; a < A; a++) {
      paint(d * A + a, look.colour(u(a), v(d), false));
      paint(grid + d * A + a, look.colour(u(a), v(d), true));
    }
  }
  for (let a = 0; a < A; a++) {
    paint(grid * 2 + a, look.colour(u(a), 1, false));
    paint(grid * 2 + A + a, look.colour(u(a), 1, true));
  }
  const index: number[] = [];
  const quad = (p: number, q: number, r: number, t: number) => index.push(p, q, r, p, r, t);
  const spans = closed ? A : A - 1;
  for (let d = 0; d + 1 < D; d++) {
    for (let a = 0; a < spans; a++) {
      const here = a;
      const next = (a + 1) % A;
      // Wound so the outside faces out along the net's outward side, the inside the other way.
      quad(d * A + here, d * A + next, (d + 1) * A + next, (d + 1) * A + here);
      quad(grid + d * A + here, grid + (d + 1) * A + here, grid + (d + 1) * A + next, grid + d * A + next);
    }
  }
  for (let a = 0; a < spans; a++) {
    const here = a;
    const next = (a + 1) % A;
    quad(grid * 2 + here, grid * 2 + next, grid * 2 + A + next, grid * 2 + A + here);
  }
  const geometry = deforming(new THREE.BufferGeometry());
  sheets.add(geometry);
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const normal = new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("normal", normal);
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(shape.outward === 1 ? index : index.reverse());

  const local = new Float64Array(around * down * 3);
  const surface = new Float64Array(grid * 3);
  const column = new Float64Array(4 * 3);
  const insets = Float64Array.from({ length: grid }, (_, k) => look.inset(u(k % A), v(Math.floor(k / A))));
  return {
    geometry,
    /** Rebuilds the mesh from the net's points as they stand, `intoAnchor` taking the world into the anchor's frame. */
    follow: (intoAnchor: THREE.Matrix4) => {
      const e = intoAnchor.elements;
      const at = body.points;
      for (let k = 0; k < around * down; k++) {
        const x = at[k * 3];
        const y = at[k * 3 + 1];
        const z = at[k * 3 + 2];
        local[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        local[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        local[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      }
      for (let d = 0; d < D; d++) {
        const row = rows[d];
        for (let a = 0; a < A; a++) {
          const col = columns[a];
          column.fill(0);
          for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
              const w = row.weights[r];
              const k = row.ids[r] * around + col.ids[c];
              column[c * 3] += w * local[k * 3];
              column[c * 3 + 1] += w * local[k * 3 + 1];
              column[c * 3 + 2] += w * local[k * 3 + 2];
            }
          }
          const s = (d * A + a) * 3;
          surface[s] = surface[s + 1] = surface[s + 2] = 0;
          for (let c = 0; c < 4; c++) {
            surface[s] += col.weights[c] * column[c * 3];
            surface[s + 1] += col.weights[c] * column[c * 3 + 1];
            surface[s + 2] += col.weights[c] * column[c * 3 + 2];
          }
        }
      }
      /** Writes a vertex's position and normal. */
      const put = (vertex: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
        positions[vertex * 3] = x;
        positions[vertex * 3 + 1] = y;
        positions[vertex * 3 + 2] = z;
        normals[vertex * 3] = nx;
        normals[vertex * 3 + 1] = ny;
        normals[vertex * 3 + 2] = nz;
      };
      const thick = look.thickness;
      for (let d = 0; d < D; d++) {
        const up = Math.max(0, d - 1) * A;
        const below = Math.min(D - 1, d + 1) * A;
        for (let a = 0; a < A; a++) {
          const left = d * A + (closed ? (a + A - 1) % A : Math.max(0, a - 1));
          const right = d * A + (closed ? (a + 1) % A : Math.min(A - 1, a + 1));
          const ax = surface[right * 3] - surface[left * 3];
          const ay = surface[right * 3 + 1] - surface[left * 3 + 1];
          const az = surface[right * 3 + 2] - surface[left * 3 + 2];
          const dx = surface[(below + a) * 3] - surface[(up + a) * 3];
          const dy = surface[(below + a) * 3 + 1] - surface[(up + a) * 3 + 1];
          const dz = surface[(below + a) * 3 + 2] - surface[(up + a) * 3 + 2];
          const cx = ay * dz - az * dy;
          const cy = az * dx - ax * dz;
          const cz = ax * dy - ay * dx;
          const long = (Math.hypot(cx, cy, cz) || 1) * shape.outward;
          const nx = cx / long;
          const ny = cy / long;
          const nz = cz / long;
          const k = d * A + a;
          const inset = insets[k];
          const ox = surface[k * 3] - nx * inset;
          const oy = surface[k * 3 + 1] - ny * inset;
          const oz = surface[k * 3 + 2] - nz * inset;
          put(k, ox, oy, oz, nx, ny, nz);
          put(grid + k, ox - nx * thick, oy - ny * thick, oz - nz * thick, -nx, -ny, -nz);
          if (d === D - 1) {
            const l = Math.hypot(dx, dy, dz) || 1;
            put(grid * 2 + a, ox, oy, oz, dx / l, dy / l, dz / l);
            put(grid * 2 + A + a, ox - nx * thick, oy - ny * thick, oz - nz * thick, dx / l, dy / l, dz / l);
          }
        }
      }
      position.needsUpdate = true;
      normal.needsUpdate = true;
      reshaped(geometry);
      geometry.computeBoundingSphere();
      body.work.vertices += count;
    },
  };
}

/**
 * Drives a simulation from the stage's clock: returns what, given the clock
 * and the moment the cloth hangs in now, steps the cloth on through every
 * whole `STEP` since the last call (or starts it again from rest and warms
 * it, if the clock has jumped), then shows it (`show`, given what takes the
 * world into the anchor's frame).
 */
export function clothOnClock(body: ClothBody, capsules: number, show: (intoAnchor: THREE.Matrix4) => void) {
  const [last, from, to] = [clothMoment(capsules), clothMoment(capsules), clothMoment(capsules)];
  let lastClock: number | null = null;
  const [p0, p1, p] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const [q0, q1, q] = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const [s0, s1] = [new THREE.Vector3(), new THREE.Vector3()];
  const into = new THREE.Matrix4();
  const carried = new THREE.Matrix4();

  /** The moment a share `f` of the way from the last frame's to this one's, into `out`. */
  const between = (now: ClothMoment, f: number, out: ClothMoment) => {
    q.slerpQuaternions(q0, q1, f);
    p.lerpVectors(p0, p1, f);
    out.anchor.compose(p, q, s1);
    out.wind.lerpVectors(last.wind, now.wind, f);
    out.floor = now.floor === null || last.floor === null ? now.floor : last.floor + (now.floor - last.floor) * f;
    now.capsules.forEach((capsule, i) => {
      out.capsules[i].a.lerpVectors(last.capsules[i].a, capsule.a, f);
      out.capsules[i].b.lerpVectors(last.capsules[i].b, capsule.b, f);
      out.capsules[i].radius = capsule.radius;
    });
  };

  return (clock: number, now: ClothMoment) => {
    // A frozen clock takes no step, and the cloth stands as it was.
    if (clock === lastClock) return;
    if (lastClock === null || clock < lastClock || clock - lastClock > GAP) {
      body.reset(now);
      for (let i = 0; i < WARM; i++) body.step(now, now);
    } else {
      last.anchor.decompose(p0, q0, s0);
      now.anchor.decompose(p1, q1, s1);
      copyMoment(last, from);
      for (let k = Math.floor(lastClock / STEP) + 1; k * STEP <= clock; k++) {
        between(now, (k * STEP - lastClock) / (clock - lastClock), to);
        body.step(from, to);
        copyMoment(to, from);
      }
      // The last step is up to a step behind the frame, where the figure is drawn: the cloth rides its anchor the rest
      // of the way, so where it is pinned never strays from the body frame to frame, at any refresh rate.
      body.carry(carried.copy(now.anchor).multiply(into.copy(from.anchor).invert()));
    }
    // The last step can be most of a step behind the frame: the cloth clears the legs where they are drawn.
    body.fit(now);
    copyMoment(now, last);
    lastClock = clock;
    show(into.copy(now.anchor).invert());
  };
}

/** Marks a figure whose cloth is simulated, so its cost and its points can be measured. */
export function simulatesCloth<T extends THREE.Object3D>(figure: T, body: ClothBody): T {
  figure.userData.clothBody = body;
  return figure;
}

export function clothBodyOf(figure: THREE.Object3D): ClothBody | undefined {
  return (figure.userData as { clothBody?: ClothBody }).clothBody;
}

/** How a figure's legs push its cloth: each leg's radius at the thigh, shin and foot, the share of the thigh at its
 *  top hidden inside the hips (cloth meets it only below), and the heel and toe of a shoe as built (x set per foot). */
export interface LegsAsCloth {
  radii: { thigh: number; shin: number; foot: number };
  hidden: number;
  heel: THREE.Vector3;
  toe: THREE.Vector3;
}

/** A moment's capsules for two-legged cloth: thigh, shin and foot for each leg, in the world. The figure's world
 *  matrices must be up to date. */
export function legCapsules(legs: readonly Leg[], { radii, hidden, heel, toe }: LegsAsCloth, out: Capsule[]) {
  legs.forEach((one, i) => {
    const [thigh, shin, foot] = out.slice(i * 3, i * 3 + 3);
    thigh.b.setFromMatrixPosition(one.knee.matrixWorld);
    thigh.a.setFromMatrixPosition(one.hip.matrixWorld).lerp(thigh.b, hidden);
    shin.a.copy(thigh.b);
    shin.b.setFromMatrixPosition(one.ankleMark.matrixWorld);
    foot.a.copy(heel).setX(one.ankle.x).applyMatrix4(one.shoe.matrixWorld);
    foot.b.copy(toe).setX(one.ankle.x).applyMatrix4(one.shoe.matrixWorld);
    [thigh.radius, shin.radius, foot.radius] = [radii.thigh, radii.shin, radii.foot];
  });
}

/*
 * Which cloth the figures wear: simulated nets (`net`, the default), or, for comparison, the heavy cloth worked out
 * from the clock (`cloth.ts`) with `?cloth=off`, on the bench and in the house.
 */
export const CLOTH_MODES = ["net", "off"] as const;
export type ClothMode = (typeof CLOTH_MODES)[number];

function isClothMode(value: string): value is ClothMode {
  return (CLOTH_MODES as readonly string[]).includes(value);
}

/** The cloth this page asks for; a value it doesn't know throws, so a typo never passes for a choice. Figures are
 *  also built in tests and workers, which have no page, and get the default. */
export function clothMode(): ClothMode {
  const mode = new URLSearchParams(pageSearch()).get("cloth") ?? "net";
  if (!isClothMode(mode)) throw new Error(`cloth=${mode}: it is one of ${CLOTH_MODES.join(", ")}`);
  return mode;
}
