import * as THREE from "three";
import { deforming, reshaped } from "../forms";
import { paletteHex, type PaletteKey } from "../palette";

/*
 * Cloth that really moves: simulated, rather than worked out from the clock
 * as `heavyCloth` is. It hangs from an anchor (a figure's hips, a shoulder, a
 * hat) and swings as the anchor moves and turns, lags when it stops, is
 * pushed aside by the legs and lifted by the wind. Two kinds, on trial
 * against each other on Zoe's skirt:
 *
 * - **Hinged panels** (`hingedPanels`): rigid panels hung from hinges, each
 *   a damped spring back to how it hangs as sculpted. Physics on pivots, as
 *   the rest of a figure is built.
 * - **A net** (`clothNet`): points joined by distance constraints, solved by
 *   position-based dynamics, its top pinned to the anchor; a sheet (a skirt,
 *   a cape) or a single strand (a ribbon, a pigtail).
 *
 * Both run in world space on fixed steps (`STEP`) of the stage's clock, so a
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
 * Panels are drawn as rigid parts of the figure's own sculpted cloth, each
 * turned on its pivot. A net's mesh is rebuilt from its points each frame
 * (`clothSheet`), its colours fixed on its surface.
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
    capsules: Array.from({ length: capsules }, () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), radius: 0 })),
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

const noWork = (): ClothWork => ({ steps: 0, points: 0, constraints: 0, collisions: 0, vertices: 0 });

/** A simulation of cloth hung from an anchor. */
export interface ClothBody {
  /** Puts the cloth at rest, as it hangs at `at`. */
  reset: (at: ClothMoment) => void;
  /** Moves the cloth on one step, `from` one moment `to` the next. */
  step: (from: ClothMoment, to: ClothMoment) => void;
  /** Clears the legs as they are `at` a moment between steps (the frame's own), moving no cloth on. */
  fit: (at: ClothMoment) => void;
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
    rest,
    at: new Float64Array(rest.length),
    before: new Float64Array(rest.length),
    velocity: new Float64Array(rest.length),
    /** 0 for a point pinned to the anchor, 1 for one free. */
    free: Float64Array.from({ length: count }, (_, i) => (pinned(i) ? 0 : 1)),
  };
}
type Points = ReturnType<typeof pointSet>;

const scratch = { m: new THREE.Matrix4(), carry: new THREE.Matrix4(), v: new THREE.Vector3(), w: new THREE.Vector3(), u: new THREE.Vector3() };

function hangAt(points: Points, anchor: THREE.Matrix4) {
  const e = anchor.elements;
  const { rest, at, before, velocity } = points;
  for (let i = 0; i < points.count; i++) {
    const [x, y, z] = [rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]];
    at[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
    at[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    at[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
  }
  before.set(at);
  velocity.fill(0);
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
  const [c, felt] = [feel.follow, feel.inertia];
  const [f, t] = [from.anchor.elements, to.anchor.elements];
  // What the anchor's move from one moment to the next does to a point that rides it.
  const carry = scratch.carry.copy(to.anchor).multiply(scratch.m.copy(from.anchor).invert()).elements;
  const { rest, at, before, velocity, free } = points;
  const wind = to.wind;
  for (let i = 0; i < points.count; i++) {
    const j = i * 3;
    const [rx, ry, rz] = [rest[j], rest[j + 1], rest[j + 2]];
    const hx = t[0] * rx + t[4] * ry + t[8] * rz + t[12];
    const hy = t[1] * rx + t[5] * ry + t[9] * rz + t[13];
    const hz = t[2] * rx + t[6] * ry + t[10] * rz + t[14];
    if (free[i] === 0) {
      before[j] = at[j] = hx;
      before[j + 1] = at[j + 1] = hy;
      before[j + 2] = at[j + 2] = hz;
      continue;
    }
    const [px, py, pz] = [at[j], at[j + 1], at[j + 2]];
    const cx = carry[0] * px + carry[4] * py + carry[8] * pz + carry[12];
    const cy = carry[1] * px + carry[5] * py + carry[9] * pz + carry[13];
    const cz = carry[2] * px + carry[6] * py + carry[10] * pz + carry[14];
    // Carried the share it doesn't feel, which never counts as its own velocity.
    before[j] = at[j] = px + (cx - px) * (1 - felt);
    before[j + 1] = at[j + 1] = py + (cy - py) * (1 - felt);
    before[j + 2] = at[j + 2] = pz + (cz - pz) * (1 - felt);
    // The share of its hanging place's velocity left for the cloth to make up itself.
    const hvx = ((hx - (f[0] * rx + f[4] * ry + f[8] * rz + f[12])) / dt) * felt;
    const hvy = ((hy - (f[1] * rx + f[5] * ry + f[9] * rz + f[13])) / dt) * felt;
    const hvz = ((hz - (f[2] * rx + f[6] * ry + f[10] * rz + f[14])) / dt) * felt;
    const [vx, vy, vz] = [velocity[j], velocity[j + 1], velocity[j + 2]];
    // The air drags on how fast the cloth really moves: its own swing, and the share it was carried.
    const [ax, ay, az] = [(cx - px) * (1 - felt) / dt, (cy - py) * (1 - felt) / dt, (cz - pz) * (1 - felt) / dt];
    velocity[j] = vx + dt * (k * (hx - at[j]) + c * (hvx - vx) + feel.drag * (wind.x - vx - ax));
    velocity[j + 1] = vy + dt * (k * (hy - at[j + 1]) + c * (hvy - vy) + feel.drag * (wind.y - vy - ay) + gravity * GRAVITY.y);
    velocity[j + 2] = vz + dt * (k * (hz - at[j + 2]) + c * (hvz - vz) + feel.drag * (wind.z - vz - az));
    let [dx, dy, dz] = [at[j] + velocity[j] * dt - cx, at[j + 1] + velocity[j + 1] * dt - cy, at[j + 2] + velocity[j + 2] * dt - cz];
    const far = Math.hypot(dx, dy, dz);
    if (far > MOST) [dx, dy, dz] = [(dx * MOST) / far, (dy * MOST) / far, (dz * MOST) / far];
    at[j] = cx + dx;
    at[j + 1] = cy + dy;
    at[j + 2] = cz + dz;
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
    const [rx, ry, rz] = [rest[j], rest[j + 1], rest[j + 2]];
    const hx = t[0] * rx + t[4] * ry + t[8] * rz + t[12];
    const hy = t[1] * rx + t[5] * ry + t[9] * rz + t[13];
    const hz = t[2] * rx + t[6] * ry + t[10] * rz + t[14];
    const [dx, dy, dz] = [at[j] - hx, at[j + 1] - hy, at[j + 2] - hz];
    const far = Math.hypot(dx, dy, dz);
    const most = swing * depth[i];
    if (far <= most) continue;
    at[j] = hx + (dx * most) / far;
    at[j + 1] = hy + (dy * most) / far;
    at[j + 2] = hz + (dz * most) / far;
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
  const [ex, ey, ez] = [b.x - a.x, b.y - a.y, b.z - a.z];
  const long = ex * ex + ey * ey + ez * ez;
  const u = long === 0 ? 0 : THREE.MathUtils.clamp(((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / long, 0, 1);
  return out.set(a.x + ex * u, a.y + ey * u, a.z + ez * u);
}

export interface PanelsShape {
  /** Where each panel hangs from, in the anchor's frame. */
  hinges: readonly THREE.Vector3[];
  /** The middle of each panel's hem as it hangs. */
  hems: readonly THREE.Vector3[];
  /** How far round its axis each panel reaches either side of its middle, in radians, as far as any of the mesh
   *  follows it: a leg within it pushes it. */
  reach: number;
  /** How far panel `k`'s surface stands out from the line from its hinge to its hem, a share `along` of the way down, as sculpted (a bell's curve). */
  bulge: (k: number, along: number) => number;
}

/** How a leg is sampled as spheres along its axis, this many, for cloth pushed out from an axis. */
const LEG_SAMPLES = 12;
/** How far below the cloth's hem, in metres past touching it, a leg coming up begins to push the hem out, so the
 *  hem moves ahead of a kicked-up heel rather than popping out when it arrives. */
const APPROACH = 0.08;
/** How far below the anchor a leg can push the cloth's top out bodily (a waistband stretching over a raised thigh). */
const NEAR_TOP = 0.06;

/** The legs as spheres in the anchor's frame (x, y, z, radius), into `out`. */
function legSpheres(moment: ClothMoment, into: THREE.Matrix4, out: THREE.Vector4[]): THREE.Vector4[] {
  out.length = 0;
  const at = new THREE.Vector3();
  for (const capsule of moment.capsules) {
    for (let s = 0; s < LEG_SAMPLES; s++) {
      at.lerpVectors(capsule.a, capsule.b, s / (LEG_SAMPLES - 1)).applyMatrix4(into);
      out.push(new THREE.Vector4(at.x, at.y, at.z, capsule.radius));
    }
  }
  return out;
}

/** How much a leg a height `below` under the cloth's hem pushes it: all of the way while it touches, none by `APPROACH` past that. */
const approaching = (below: number, reach: number) => 1 - THREE.MathUtils.smoothstep(below, reach * 0.5, reach + APPROACH);
/** The furthest a leg can turn a panel out from straight down, and the furthest it swings in past it, in radians. */
const PANEL_MOST = 1.35;
const PANEL_LEAST = -0.3;

/**
 * Rigid panels hung round the anchor's vertical axis on hinges (a skirt's
 * gores), each a damped spring back to how it hangs. A panel is its hinge
 * and the middle of its hem, kept their distance apart; a leg pushes the
 * panel out, turning it about its hinge just far enough that it clears the
 * leg wherever the leg lies within the panel's reach.
 */
export interface Panels extends ClothBody {
  /** Each panel's hinge, and its turn from how it hangs as a 3×3 matrix (row-major), in the anchor's frame. */
  pose: (intoAnchor: THREE.Matrix4, origins: Float64Array, turns: Float64Array) => void;
}

export function hingedPanels(shape: PanelsShape, feel: ClothFeel): Panels {
  const count = shape.hinges.length;
  const rest = new Float64Array(count * 6);
  shape.hinges.forEach((hinge, k) => rest.set([hinge.x, hinge.y, hinge.z, shape.hems[k].x, shape.hems[k].y, shape.hems[k].z], k * 6));
  const points = pointSet(rest, (i) => i % 2 === 0);
  const lengths = shape.hinges.map((hinge, k) => hinge.distanceTo(shape.hems[k]));
  const work = noWork();
  const local = new THREE.Vector3();
  const spheres: THREE.Vector4[] = [];
  const into = new THREE.Matrix4();

  /** Each panel's hem held its length from its hinge. */
  const keepLengths = () => {
    const at = points.at;
    for (let k = 0; k < count; k++) {
      const [h, p] = [k * 6, k * 6 + 3];
      const [dx, dy, dz] = [at[p] - at[h], at[p + 1] - at[h + 1], at[p + 2] - at[h + 2]];
      const long = Math.hypot(dx, dy, dz) || 1;
      const s = lengths[k] / long;
      at[p] = at[h] + dx * s;
      at[p + 1] = at[h + 1] + dy * s;
      at[p + 2] = at[h + 2] + dz * s;
      work.constraints++;
    }
  };

  // Only a panel's hem point moves, the whole of its swing.
  const panelDepth = Float64Array.from({ length: count * 2 }, (_, i) => i % 2);
  const ways = shape.hinges.map((hinge, k) => Math.atan2(shape.hems[k].z - hinge.z, shape.hems[k].x - hinge.x));
  /** How far each panel's hinge is pushed straight out by a leg right under it, this step. */
  const shifts = new Float64Array(count);

  /**
   * Holds each panel to its hinge, swinging only out and in, and clears the
   * legs within its reach: a leg right under the hinge
   * pushes the panel out bodily, and any other turns it out about its hinge
   * just far enough. A leg below the hem pushes it as it comes up (`approaching`).
   */
  const clearLegs = (moment: ClothMoment) => {
    into.copy(moment.anchor).invert();
    legSpheres(moment, into, spheres);
    const at = points.at;
    const anchor = moment.anchor;
    for (let k = 0; k < count; k++) {
      const hinge = shape.hinges[k];
      const tip = local.set(at[k * 6 + 3], at[k * 6 + 4], at[k * 6 + 5]).applyMatrix4(into);
      const hingeOut = Math.hypot(hinge.x, hinge.z);
      // Measured from the hinge where last step's push left it: which way the panel faces, and how far it turns out.
      const pushed = (hingeOut + shifts[k]) / hingeOut;
      // A hinge along the waist lets a panel swing only out and in, facing the way it hangs.
      const way = ways[k];
      const length = lengths[k];
      const drop = hinge.y - tip.y;
      const was = Math.max(PANEL_LEAST, Math.atan2((tip.x - hinge.x * pushed) * Math.cos(way) + (tip.z - hinge.z * pushed) * Math.sin(way), drop));
      /** How far out from the hinge's line each leg within reach needs the panel, at the height it needs it. */
      const needs: [number, number][] = [];
      let shift = 0;
      for (const sphere of spheres) {
        work.collisions++;
        const sphereWay = Math.atan2(sphere.z, sphere.x);
        const off = Math.abs(Math.atan2(Math.sin(sphereWay - way), Math.cos(sphereWay - way)));
        const y = THREE.MathUtils.clamp(sphere.y, hinge.y - drop, hinge.y);
        const depth = (hinge.y - y) / length;
        const reach = sphere.w + feel.roomAtTop + (feel.room - feel.roomAtTop) * depth;
        // A leg pushes every panel whose reach its own width round the axis overlaps.
        if (off - Math.asin(Math.min(1, reach / Math.max(Math.hypot(sphere.x, sphere.z), 1e-6))) > shape.reach) continue;
        const below = hinge.y - drop - sphere.y;
        const share = below > 0 ? approaching(below, reach) : 1;
        const across = below > 0 ? 0 : y - sphere.y;
        if (share === 0 || Math.abs(across) >= reach) continue;
        // The panel moves out along its middle, so its cloth off to the side of it gains less: it moves further for a leg there.
        const need = (share * (Math.hypot(sphere.x, sphere.z) + Math.sqrt(reach * reach - across * across) - hingeOut - shape.bulge(k, depth))) / Math.max(Math.cos(off) ** 2, 0.4);
        if (need <= 0) continue;
        // Right under the hinge only moving the panel bodily clears a leg; further down, turning it does.
        shift = Math.max(shift, need * (1 - THREE.MathUtils.smoothstep(hinge.y - y, NEAR_TOP * 0.5, NEAR_TOP * 1.5)));
        needs.push([need, hinge.y - y]);
      }
      shifts[k] = shift;
      let turn = was;
      for (const [need, below] of needs) if (below > 1e-4) turn = Math.max(turn, Math.min(PANEL_MOST, Math.atan2(need - shift, below)));
      // The hinge moves straight out with the push, and the panel's hem hangs its length from it, as far out as it must.
      const grow = (hingeOut + shift) / hingeOut;
      const [hx, hz] = [hinge.x * grow, hinge.z * grow];
      local.set(hx, hinge.y, hz).applyMatrix4(anchor);
      at[k * 6] = local.x;
      at[k * 6 + 1] = local.y;
      at[k * 6 + 2] = local.z;
      local.set(hx + Math.cos(way) * Math.sin(turn) * length, hinge.y - Math.cos(turn) * length, hz + Math.sin(way) * Math.sin(turn) * length).applyMatrix4(anchor);
      at[k * 6 + 3] = local.x;
      at[k * 6 + 4] = local.y;
      at[k * 6 + 5] = local.z;
    }
  };

  const [panelAxis, panelTurn, panelOut] = [new THREE.Vector3(), new THREE.Matrix4(), new THREE.Matrix4()];
  return {
    points: points.at,
    work,
    reset: (at) => hangAt(points, at.anchor),
    step: (from, to) => {
      work.steps++;
      // A panel's spring holds it where it hangs as sculpted, its weight included.
      integrate(points, from, to, feel, 0, work);
      holdNear(points, to.anchor, feel.swing, panelDepth);
      keepLengths();
      clearLegs(to);
      settleVelocity(points);
    },
    fit: clearLegs,
    pose: (intoAnchor, origins, turns) => {
      const at = points.at;
      for (let k = 0; k < count; k++) {
        const tip = local.set(at[k * 6 + 3], at[k * 6 + 4], at[k * 6 + 5]).applyMatrix4(intoAnchor);
        const hem = shape.hems[k];
        const hinge = scratch.u.set(at[k * 6], at[k * 6 + 1], at[k * 6 + 2]).applyMatrix4(intoAnchor);
        origins.set([hinge.x, hinge.y, hinge.z], k * 3);
        const rest = shape.hinges[k];
        // A panel turns out about its hinge's line and round the waist, never tipping about its own middle, which
        // would drop one edge below the hem.
        const [restWay, restOut] = [Math.atan2(hem.z - rest.z, hem.x - rest.x), Math.atan2(Math.hypot(hem.x - rest.x, hem.z - rest.z), rest.y - hem.y)];
        const [way, out] = [Math.atan2(tip.z - hinge.z, tip.x - hinge.x), Math.atan2(Math.hypot(tip.x - hinge.x, tip.z - hinge.z), hinge.y - tip.y)];
        const along = panelAxis.set(-Math.sin(restWay), 0, Math.cos(restWay));
        const e = panelTurn.makeRotationY(restWay - way).multiply(panelOut.makeRotationAxis(along, out - restOut)).elements;
        turns.set([e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]], k * 9);
      }
    },
  };
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
}

/** How a net hangs: its feel, and how much its weight pulls it down (0 for cloth whose starch holds its shape). */
export interface NetFeel extends ClothFeel {
  weight: number;
}

/**
 * A net of points joined by distance constraints across and down (and, two
 * apart, against bending), solved by position-based dynamics, its top row
 * pinned to the anchor and the rest pulled, as starch pulls a petticoat,
 * towards how it hangs. A leg pushes the cloth out along its outward side,
 * at the points and along each row between them; a strand (one point a row)
 * is pushed straight off the leg.
 */
export function clothNet(shape: NetShape, feel: NetFeel): ClothBody {
  const { around, down, closed } = shape;
  const index = (i: number, j: number) => j * around + ((i + around) % around);
  const points = pointSet(shape.rest, (i) => i < around);
  const constraints: { a: number; b: number; length: number; stiffness: number }[] = [];
  const join = (a: number, b: number, stiffness: number) => {
    const r = shape.rest;
    constraints.push({ a, b, length: Math.hypot(r[a * 3] - r[b * 3], r[a * 3 + 1] - r[b * 3 + 1], r[a * 3 + 2] - r[b * 3 + 2]), stiffness });
  };
  for (let j = 0; j < down; j++) {
    for (let i = 0; i < around; i++) {
      if (j + 1 < down) join(index(i, j), index(i, j + 1), 1);
      if (j + 2 < down) join(index(i, j), index(i, j + 2), 0.3);
      if (around > 1 && (closed || i + 1 < around)) join(index(i, j), index(i + 1, j), 1);
      if (around > 2 && (closed || i + 2 < around)) join(index(i, j), index(i + 2, j), 0.3);
    }
  }
  // Each point is tethered to the pinned point at the top of its column, never further from it than it hangs, so
  // however hard the cloth is yanked it never stretches out long.
  const tethers = Array.from({ length: points.count - around }, (_, n) => {
    const k = n + around;
    const top = k % around;
    const r = shape.rest;
    return { k, top, length: Math.hypot(r[k * 3] - r[top * 3], r[k * 3 + 1] - r[top * 3 + 1], r[k * 3 + 2] - r[top * 3 + 2]) };
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
        const [up, below] = [index(i, Math.max(0, j - 1)), index(i, Math.min(down - 1, j + 1))];
        const [ax, ay, az] = [p(right, 0) - p(left, 0), p(right, 1) - p(left, 1), p(right, 2) - p(left, 2)];
        const [dx, dy, dz] = [p(below, 0) - p(up, 0), p(below, 1) - p(up, 1), p(below, 2) - p(up, 2)];
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
    const [ax, ay, az, bx, by, bz] = [at[a * 3], at[a * 3 + 1], at[a * 3 + 2], at[b * 3], at[b * 3 + 1], at[b * 3 + 2]];
    // The leg's axis nearest the stretch, found from its middle, then the stretch's point nearest that.
    nearestOnAxis(capsule, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, near);
    const [ex, ey, ez] = [bx - ax, by - ay, bz - az];
    const long = ex * ex + ey * ey + ez * ez;
    const u = long === 0 ? 0 : THREE.MathUtils.clamp(((near.x - ax) * ex + (near.y - ay) * ey + (near.z - az) * ez) / long, 0, 1);
    const [qx, qy, qz] = [ax + ex * u, ay + ey * u, az + ez * u];
    nearestOnAxis(capsule, qx, qy, qz, near);
    const [ox, oy, oz] = [qx - near.x, qy - near.y, qz - near.z];
    const clear = capsule.radius + feel.room;
    let [nx, ny, nz] = [0, 0, 0];
    let depth: number;
    if (around === 1) {
      // A strand has no outside: it leaves the leg the nearest way.
      const off = Math.hypot(ox, oy, oz);
      if (off >= clear || off === 0) return;
      [nx, ny, nz, depth] = [ox / off, oy / off, oz / off, clear - off];
    } else {
      [nx, ny, nz] = [normals[a * 3] * (1 - u) + normals[b * 3] * u, normals[a * 3 + 1] * (1 - u) + normals[b * 3 + 1] * u, normals[a * 3 + 2] * (1 - u) + normals[b * 3 + 2] * u];
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
    for (const [k, w] of [[a, wa], [b, wb]] as const) {
      if (w === 0) continue;
      // Touched right by a pinned point, a free one can't lever the cloth clear: it moves no further than the leg is wide.
      const move = Math.min(w * s, clear);
      at[k * 3] += nx * move;
      at[k * 3 + 1] += ny * move;
      at[k * 3 + 2] += nz * move;
    }
  };

  const legs: Capsule[] = [];
  const nearest = new THREE.Vector3();
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
      const [x, y, z] = [at[k * 3], at[k * 3 + 1], at[k * 3 + 2]];
      localPoints[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      localPoints[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      localPoints[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    pushes.fill(0);
    for (let j = 0; j < down; j++) {
      const room = feel.roomAtTop + (feel.room - feel.roomAtTop) * netDepth[j * around];
      for (let i = 0; i < around; i++) {
        const [a, b] = [index(i, j), index(i + 1, j)];
        const [c, d] = j + 1 < down ? [index(i, j + 1), index(i + 1, j + 1)] : [a, b];
        // The point, halfway to the next round the row, halfway to the one below, and the middle of the four.
        for (const [across, downward] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
          if (downward > 0 && c === a) continue;
          const weights = [(1 - across) * (1 - downward), across * (1 - downward), (1 - across) * downward, across * downward];
          const corners = [a, b, c, d];
          const lp = (axis: number) => corners.reduce((sum, k, n) => sum + localPoints[k * 3 + axis] * weights[n], 0);
          const [px, py, pz] = [lp(0), lp(1), lp(2)];
          const r = Math.hypot(px, pz) || 1;
          const [ex, ez] = [px / r, pz / r];
          let push = 0;
          for (const leg of legs) {
            work.collisions++;
            // The leg where it comes nearest this part of the cloth.
            const sphere = nearestOnAxis(leg, px, py, pz, nearest);
            const reach = leg.radius + room;
            const along = (sphere.x - px) * -ez + (sphere.z - pz) * ex;
            const below = py - sphere.y;
            const bottom = j === down - 1 && below > 0;
            const share = bottom ? approaching(below, reach) : 1;
            const across = bottom ? Math.abs(along) : Math.hypot(along, below);
            if (share === 0 || across >= reach) continue;
            push = Math.max(push, share * (sphere.x * ex + sphere.z * ez + Math.sqrt(reach * reach - across * across) - r));
          }
          if (push <= 0) continue;
          // Between points, each of them goes out as far, so the cloth between them clears the leg.
          corners.forEach((k, n) => {
            if (weights[n] > 0) pushes[k] = Math.max(pushes[k], push);
          });
        }
      }
    }
    const t = moment.anchor.elements;
    for (let k = 0; k < points.count; k++) {
      const push = pushes[k];
      if (push === 0) continue;
      const r = Math.hypot(localPoints[k * 3], localPoints[k * 3 + 2]) || 1;
      const [ex, ez] = [localPoints[k * 3] / r, localPoints[k * 3 + 2] / r];
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

  const solve = (moment: ClothMoment) => {
    const { at, free } = points;
    sides(at, normals);
    for (let pass = 0; pass < ITERATIONS; pass++) {
      for (const { a, b, length, stiffness } of constraints) {
        const share = free[a] + free[b];
        if (share === 0) continue;
        const [dx, dy, dz] = [at[b * 3] - at[a * 3], at[b * 3 + 1] - at[a * 3 + 1], at[b * 3 + 2] - at[a * 3 + 2]];
        const long = Math.hypot(dx, dy, dz) || 1;
        const s = (stiffness * (long - length)) / long / share;
        at[a * 3] += dx * s * free[a];
        at[a * 3 + 1] += dy * s * free[a];
        at[a * 3 + 2] += dz * s * free[a];
        at[b * 3] -= dx * s * free[b];
        at[b * 3 + 1] -= dy * s * free[b];
        at[b * 3 + 2] -= dz * s * free[b];
      }
      for (const { k, top, length } of tethers) {
        const [dx, dy, dz] = [at[k * 3] - at[top * 3], at[k * 3 + 1] - at[top * 3 + 1], at[k * 3 + 2] - at[top * 3 + 2]];
        const long = Math.hypot(dx, dy, dz);
        if (long <= length) continue;
        const s = length / long;
        at[k * 3] = at[top * 3] + dx * s;
        at[k * 3 + 1] = at[top * 3 + 1] + dy * s;
        at[k * 3 + 2] = at[top * 3 + 2] + dz * s;
      }
      holdNear(points, moment.anchor, feel.swing, netDepth);
      work.constraints += constraints.length + tethers.length;
      clear(moment);
      if (moment.floor !== null) {
        for (let k = around; k < points.count; k++) at[k * 3 + 1] = Math.max(at[k * 3 + 1], moment.floor + feel.room);
      }
    }
  };

  return {
    points: points.at,
    work,
    reset: (at) => hangAt(points, at.anchor),
    step: (from, to) => {
      work.steps++;
      integrate(points, from, to, feel, feel.weight, work);
      solve(to);
      settleVelocity(points);
    },
    fit: (at) => {
      sides(points.at, normals);
      clear(at);
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
  const [f2, f3] = [f * f, f * f * f];
  return [(-f3 + 2 * f2 - f) / 2, (3 * f3 - 5 * f2 + 2) / 2, (-3 * f3 + 4 * f2 + f) / 2, (f3 - f2) / 2];
}

/**
 * A net's cloth as a mesh, rebuilt from its points each frame: a smooth
 * surface through them (Catmull-Rom across and down), its outside folded in
 * where `look.inset` says, a cloth's thickness to its inside, and a rim
 * along its bottom edge. Its colours are its own and never move on it, so
 * its look stays on its surface as it moves.
 */
export function clothSheet(body: ClothBody, shape: Pick<NetShape, "around" | "down" | "closed" | "outward">, look: SheetLook) {
  const { around, down, closed } = shape;
  const [A, D] = [look.across, look.down];
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
    return { ids: [j - 1, j, j + 1, j + 2].map((r) => THREE.MathUtils.clamp(r, 0, down - 1)), weights: catmullRom(at - j) };
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
      const [here, next] = [a, (a + 1) % A];
      // Wound so the outside faces out along the net's outward side, the inside the other way.
      quad(d * A + here, d * A + next, (d + 1) * A + next, (d + 1) * A + here);
      quad(grid + d * A + here, grid + (d + 1) * A + here, grid + (d + 1) * A + next, grid + d * A + next);
    }
  }
  for (let a = 0; a < spans; a++) {
    const [here, next] = [a, (a + 1) % A];
    quad(grid * 2 + here, grid * 2 + next, grid * 2 + A + next, grid * 2 + A + here);
  }
  const geometry = deforming(new THREE.BufferGeometry());
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
        const [x, y, z] = [at[k * 3], at[k * 3 + 1], at[k * 3 + 2]];
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
      const sample = (a: number, d: number, axis: number) => surface[(d * A + a) * 3 + axis];
      for (let d = 0; d < D; d++) {
        for (let a = 0; a < A; a++) {
          const [left, right] = closed ? [(a + A - 1) % A, (a + 1) % A] : [Math.max(0, a - 1), Math.min(A - 1, a + 1)];
          const [up, below] = [Math.max(0, d - 1), Math.min(D - 1, d + 1)];
          const across = [0, 1, 2].map((axis) => sample(right, d, axis) - sample(left, d, axis));
          const along = [0, 1, 2].map((axis) => sample(a, below, axis) - sample(a, up, axis));
          let [nx, ny, nz] = [across[1] * along[2] - across[2] * along[1], across[2] * along[0] - across[0] * along[2], across[0] * along[1] - across[1] * along[0]];
          const long = (Math.hypot(nx, ny, nz) || 1) * shape.outward;
          [nx, ny, nz] = [nx / long, ny / long, nz / long];
          const k = d * A + a;
          const inset = insets[k];
          const [ox, oy, oz] = [sample(a, d, 0) - nx * inset, sample(a, d, 1) - ny * inset, sample(a, d, 2) - nz * inset];
          positions.set([ox, oy, oz], k * 3);
          normals.set([nx, ny, nz], k * 3);
          positions.set([ox - nx * look.thickness, oy - ny * look.thickness, oz - nz * look.thickness], (grid + k) * 3);
          normals.set([-nx, -ny, -nz], (grid + k) * 3);
          if (d === D - 1) {
            const l = Math.hypot(along[0], along[1], along[2]) || 1;
            positions.set([ox, oy, oz], (grid * 2 + a) * 3);
            positions.set([ox - nx * look.thickness, oy - ny * look.thickness, oz - nz * look.thickness], (grid * 2 + A + a) * 3);
            for (const rim of [grid * 2 + a, grid * 2 + A + a]) normals.set([along[0] / l, along[1] / l, along[2] / l], rim * 3);
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
