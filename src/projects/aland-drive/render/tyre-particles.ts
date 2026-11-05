import { BufferAttribute, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, type Node, type Scene } from "three/webgpu";
import { attribute, cameraProjectionMatrix, cameraViewMatrix, cameraWorldMatrix, cos, exp, float, max, min, positionGeometry, select, sin, smoothstep, uniform, uv, varying, vec2, vec3, vec4 } from "three/tsl";
import { outsideCar } from "../art/car-volume";
import type { CarState, Rotation, Vector3 } from "../sim/car-state";
import type { Tread } from "../sim/car";
import type { Condition, Surface } from "../sim/surfaces";
import { STEP_S } from "../sim/tuning";
import { kicksOf, PUFFS, type Kick, type Puff } from "./tyre-kicks";

/*
 * What comes off the player's tyres: dust and stones on gravel, clods and torn
 * grass on grass, grit on rock, spray on anything wet, powder in snow, and smoke
 * off a dry road only once a tyre is past its grip (`tyre-kicks.ts` decides how
 * much of each).
 *
 * A particle is written once, when it's thrown: where, when, how fast, and how it
 * looks. Its flight after that is worked out in the vertex shader as a function of
 * its age (drag towards a still air, gravity, and a solid bit stopping at the
 * ground it left), so nothing is moved on the CPU and nothing is uploaded but the
 * few just thrown. It is thrown on the simulation's steps and aged on its clock,
 * so a held page stepped by hand throws exactly what a drive would, and the
 * drawing between two steps is in time with the car's.
 *
 * Two fixed pools, two draw calls: soft puffs, blended and writing no depth, and
 * small solid bits, cut out and opaque. The cost of the puffs is their overdraw,
 * so a puff is never more than a share of the screen across, fades as it nears
 * the eye, and the pools cap how many there can be. A pool with nothing alive in
 * it isn't drawn.
 */

const PUFF_POOL = 1024;
const CHIP_POOL = 512;
/** A puff is never wider than this share of its distance from the eye: about a tenth of the screen's height. */
const MOST_SIZE_PER_M = 0.12;
/** Puffs fade away over this run of distance to the eye, so the camera never sits inside one. */
const NEAR_FADE_M: [number, number] = [0.8, 3];
const GRAVITY = 9.81;
const TAU = Math.PI * 2;

interface Look {
  lifeS: number;
  /** Towards still air, a share of the velocity a second. */
  drag: number;
  /** Up, metres a second squared: a puff's is gravity and what lifts it together. */
  rise: number;
  sizeM: number;
  /** A puff spreads by this many metres a second. */
  growMS: number;
  /** Most opacity, for a puff. */
  opacity: number;
  /** The share of the car's velocity it leaves with. */
  follow: number;
  upMS: number;
  scatterMS: number;
  /** The share of the tread's rubbing it's thrown with, sideways and back. */
  thrown: number;
  /** Width over height: a torn blade of grass is long and thin. */
  aspect: number;
  /** Turns a second at most, either way. */
  spin: number;
}

const LOOKS: Record<Kick, Look> = {
  dust: { lifeS: 2.8, drag: 1.4, rise: 0.35, sizeM: 0.6, growMS: 1.5, opacity: 0.42, follow: 0.3, upMS: 1.2, scatterMS: 0.8, thrown: 0.25, aspect: 1, spin: 0.4 },
  spray: { lifeS: 1, drag: 2.4, rise: -2.5, sizeM: 0.3, growMS: 1.5, opacity: 0.2, follow: 0.45, upMS: 2.2, scatterMS: 1, thrown: 0.3, aspect: 1, spin: 0.4 },
  powder: { lifeS: 1.6, drag: 2, rise: -0.8, sizeM: 0.4, growMS: 1, opacity: 0.45, follow: 0.4, upMS: 1.4, scatterMS: 0.9, thrown: 0.3, aspect: 1, spin: 0.4 },
  smoke: { lifeS: 3, drag: 1.2, rise: 0.4, sizeM: 0.5, growMS: 1.3, opacity: 0.4, follow: 0.2, upMS: 0.4, scatterMS: 0.5, thrown: 0.15, aspect: 1, spin: 0.3 },
  stone: { lifeS: 1.3, drag: 1.2, rise: -GRAVITY, sizeM: 0.035, growMS: 0, opacity: 1, follow: 0.25, upMS: 2.2, scatterMS: 1.6, thrown: 0.5, aspect: 1, spin: 6 },
  clod: { lifeS: 1.4, drag: 1.2, rise: -GRAVITY, sizeM: 0.07, growMS: 0, opacity: 1, follow: 0.3, upMS: 2.6, scatterMS: 1.5, thrown: 0.5, aspect: 1, spin: 6 },
  blade: { lifeS: 1.5, drag: 2.5, rise: -3, sizeM: 0.08, growMS: 0, opacity: 1, follow: 0.35, upMS: 2, scatterMS: 1.4, thrown: 0.4, aspect: 0.2, spin: 8 },
  grit: { lifeS: 0.9, drag: 1.5, rise: -GRAVITY, sizeM: 0.02, growMS: 0, opacity: 1, follow: 0.2, upMS: 1.5, scatterMS: 1.4, thrown: 0.5, aspect: 1, spin: 6 },
};

/** Each kind's colour token, and the surface's own where it differs: dust is the colour of the ground it rose from. */
const TOKENS: Record<Kick, string | Partial<Record<Surface, string>>> = {
  dust: { asphalt: "tyre-dust", gravel: "tyre-dust", grass: "town-yard", rock: "church-granite-grey" },
  spray: "tyre-spray",
  powder: "tyre-snow",
  smoke: "tyre-smoke",
  stone: "surface-gravel",
  clod: "tyre-earth",
  blade: "town-lawn",
  grit: "church-granite-grey",
};

export interface Linear {
  r: number;
  g: number;
  b: number;
}

function rotate([x, y, z, w]: Rotation, v: Vector3): Vector3 {
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}

/** Small and seeded, so a run stepped by hand throws the same particles every time. */
function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLOATS = 4;
const COLUMNS = ["tyreSpawn", "tyreFling", "tyreMotion", "tyreTint", "tyreShape"] as const;

/** One pool: a ring of particles, the oldest written over first, as one instanced quad. */
function pool(capacity: number, solid: boolean, clock: Node<"float">, hazed: (color: Node<"vec3">) => Node<"vec3">) {
  const columns = COLUMNS.map(() => new Float32Array(capacity * FLOATS));
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setAttribute("uv", new BufferAttribute(Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.instanceCount = 0;
  const attributes = columns.map((column) => new InstancedBufferAttribute(column, FLOATS));
  COLUMNS.forEach((name, index) => {
    attributes[index].setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attributes[index]);
  });

  const spawn = attribute<"vec4">("tyreSpawn", "vec4");
  const fling = attribute<"vec4">("tyreFling", "vec4");
  const motion = attribute<"vec4">("tyreMotion", "vec4");
  const tint = attribute<"vec4">("tyreTint", "vec4");
  const shape = attribute<"vec4">("tyreShape", "vec4");
  const [drag, rise, life, seed] = [motion.x, motion.y, motion.z, motion.w];
  const [startSize, grow, aspect, spin] = [shape.x, shape.y, shape.z, shape.w];

  const age = clock.sub(spawn.w);
  const lived = age.div(life);
  const alive = age.greaterThanEqual(0).and(lived.lessThan(1));
  // Drag towards still air and a steady pull up or down, solved for the place at this age.
  const slowed = float(1).sub(exp(drag.negate().mul(age))).div(drag);
  const flown = fling.xyz.mul(slowed).add(vec3(0, rise.mul(age.sub(slowed)).div(drag), 0));
  const unstopped = spawn.xyz.add(flown);
  const place = solid ? vec3(unstopped.x, max(unstopped.y, fling.w.add(startSize.mul(0.5))), unstopped.z) : unstopped;

  const inView = cameraViewMatrix.mul(vec4(place, 1));
  const depth = inView.z.negate().max(0.01);
  const grown = solid ? startSize.mul(float(1).sub(smoothstep(float(0.7), float(1), lived))) : startSize.add(grow.mul(age));
  const size = select(alive, min(grown, depth.mul(MOST_SIZE_PER_M)), float(0));
  const turn = seed.mul(TAU).add(spin.mul(seed.sub(0.5).mul(2)).mul(age));
  const corner = positionGeometry.xy.mul(vec2(aspect, 1)).mul(size.mul(0.5));
  const turned = vec2(corner.x.mul(cos(turn)).sub(corner.y.mul(sin(turn))), corner.x.mul(sin(turn)).add(corner.y.mul(cos(turn))));

  const material = new MeshBasicNodeMaterial(solid ? {} : { transparent: true, depthWrite: false });
  const corner3 = vec4(inView.xy.add(turned), inView.z, 1);
  material.vertexNode = cameraProjectionMatrix.mul(corner3);
  const across = uv().mul(2).sub(1);
  const round = across.length();
  const lit = float(0.82).add(uv().y.mul(0.3));
  const shade = varying(float(0.8).add(seed.mul(0.35)));
  material.colorNode = hazed(tint.xyz.mul(solid ? lit.mul(shade) : lit));
  material.maskNode = outsideCar(cameraWorldMatrix.mul(corner3).xyz);
  if (solid) {
    // A torn blade is its whole strip; anything else is a rough round bit.
    material.opacityNode = select(round.lessThan(1).or(aspect.lessThan(0.5)), float(1), float(0));
    material.alphaTest = 0.5;
  } else {
    const soft = float(1).sub(round.mul(round)).max(0);
    const fades = varying(
      float(1)
        .sub(lived)
        .max(0)
        .pow(1.5)
        .mul(smoothstep(float(0), float(0.08), age))
        .mul(smoothstep(float(NEAR_FADE_M[0]), float(NEAR_FADE_M[1]), depth)),
    );
    material.opacityNode = soft.mul(soft).mul(soft).mul(tint.w).mul(fades);
  }
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;

  const born = new Float32Array(capacity);
  const ends = new Float32Array(capacity).fill(-1);
  let next = 0;
  let dirtyFrom = -1;
  let dirtyCount = 0;

  return {
    mesh,
    write(values: readonly (readonly number[])[], at: number, end: number) {
      const slot = next % capacity;
      values.forEach((value, column) => columns[column].set(value, slot * FLOATS));
      born[slot] = at;
      ends[slot] = end;
      if (dirtyFrom < 0) dirtyFrom = slot;
      dirtyCount = Math.min(dirtyCount + 1, capacity);
      next++;
    },
    /** Uploads what was thrown since the last, and says how many are in the air at this clock. */
    show(now: number, shown: boolean): number {
      if (dirtyCount > 0) {
        const first = Math.min(dirtyCount, capacity - dirtyFrom);
        for (const attr of attributes) {
          attr.addUpdateRange(dirtyFrom * FLOATS, first * FLOATS);
          if (dirtyCount > first) attr.addUpdateRange(0, (dirtyCount - first) * FLOATS);
          attr.needsUpdate = true;
        }
        dirtyFrom = -1;
        dirtyCount = 0;
      }
      geometry.instanceCount = Math.min(next, capacity);
      let alive = 0;
      for (let slot = 0; slot < geometry.instanceCount; slot++) if (born[slot] <= now && now < ends[slot]) alive++;
      mesh.visible = shown && alive > 0;
      return alive;
    },
    /** Draws the pool whatever is alive, for compiling its pipeline before the drive: an unwritten particle has no size. */
    showAll(on: boolean) {
      mesh.visible = on;
      geometry.instanceCount = on ? Math.max(1, Math.min(next, capacity)) : Math.min(next, capacity);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/** `hazed` is the world's light and haze at this hour, which every colour drawn goes through. */
export function createTyreParticles(scene: Scene, colour: (token: string) => Linear, hazed: (color: Node<"vec3">) => Node<"vec3">) {
  const clock = uniform(0);
  const puffs = pool(PUFF_POOL, false, clock, hazed);
  const chips = pool(CHIP_POOL, true, clock, hazed);
  scene.add(puffs.mesh, chips.mesh);
  const colours = new Map<string, Linear>();
  const colourOf = (kick: Kick, surface: Surface) => {
    const tokens = TOKENS[kick];
    const name = typeof tokens === "string" ? tokens : tokens[surface];
    if (name === undefined) throw new Error(`no colour for ${kick} thrown off ${surface}`);
    let found = colours.get(name);
    if (!found) colours.set(name, (found = colour(name)));
    return found;
  };
  const random = randomFrom(1);
  /** Each wheel's share of a particle owed of each kind, carried from step to step. */
  const owed = [0, 1, 2, 3].map(() => new Map<Kick, number>());
  let steps = 0;
  let alive = { puffs: 0, chips: 0 };
  let shown = true;

  /** One particle's columns as it's written, kept so a throw allocates nothing. */
  const rows = COLUMNS.map(() => [0, 0, 0, 0]);
  const isPuff = (kick: Kick): kick is Puff => (PUFFS as readonly string[]).includes(kick);

  const throwOne = (kick: Kick, surface: Surface, tread: Readonly<Tread>, rub: number, frame: { velocity: Vector3; nose: Vector3; right: Vector3; up: Vector3 }) => {
    const look = LOOKS[kick];
    const { velocity, nose, right, up } = frame;
    const back = Math.sign(tread.rollMS) || 1;
    const across = (random() - 0.5) * 0.24;
    const lift = 0.04 + random() * 0.1;
    const kicked = rub * look.thrown;
    const upward = look.upMS * (0.5 + random()) + kicked * 0.3;
    const at = steps * STEP_S;
    const [spot, fling, motion, tint, shape] = rows;
    for (let axis = 0; axis < 3; axis++) {
      spot[axis] = tread.contact[axis] + up[axis] * lift + right[axis] * across - nose[axis] * back * 0.25;
      const scatter = (random() - 0.5) * 2 * look.scatterMS;
      fling[axis] = velocity[axis] * look.follow + right[axis] * Math.sign(tread.slideMS) * kicked - nose[axis] * back * kicked * 0.5 + up[axis] * upward + scatter;
    }
    spot[3] = at;
    fling[3] = tread.contact[1];
    motion[0] = look.drag;
    motion[1] = look.rise;
    motion[2] = look.lifeS * (0.75 + random() * 0.5);
    motion[3] = random();
    const { r, g, b } = colourOf(kick, surface);
    tint[0] = r;
    tint[1] = g;
    tint[2] = b;
    tint[3] = look.opacity;
    shape[0] = look.sizeM * (0.7 + random() * 0.6);
    shape[1] = look.growMS;
    shape[2] = look.aspect;
    shape[3] = look.spin;
    (isPuff(kick) ? puffs : chips).write(rows, at, at + look.lifeS * 1.25);
  };

  return {
    /** After each step of the simulation: what each wheel of the car just threw up. A wheel off the ground reads still, and throws nothing. */
    step(treads: readonly Readonly<Tread>[], surfaces: readonly Surface[], condition: Condition, car: CarState) {
      const frame = { velocity: car.velocity, nose: rotate(car.rotation, [0, 0, -1]), right: rotate(car.rotation, [1, 0, 0]), up: rotate(car.rotation, [0, 1, 0]) };
      treads.forEach((tread, wheel) => {
        const debts = owed[wheel];
        const surface = surfaces[wheel];
        const { rates, rub } = kicksOf({ surface, condition, rollMS: tread.rollMS, slideMS: tread.slideMS, demand: tread.demand });
        for (const kick of debts.keys()) if (!rates.some(([thrown]) => thrown === kick)) debts.delete(kick);
        for (const [kick, perS] of rates) {
          let debt = (debts.get(kick) ?? random()) + perS * STEP_S;
          for (; debt >= 1; debt--) throwOne(kick, surface, tread, rub, frame);
          debts.set(kick, debt);
        }
      });
      steps++;
    },
    /** Before each frame is drawn, `share` of the way from the last step but one to the last. */
    draw(share: number) {
      const now = (steps - 1 + share) * STEP_S;
      clock.value = now;
      alive = { puffs: puffs.show(now, shown), chips: chips.show(now, shown) };
    },
    /** Draws both pools whatever is alive, so their pipelines are built before the drive starts rather than at the first particle. */
    showAll(on: boolean) {
      puffs.showAll(on);
      chips.showAll(on);
    },
    /** Draws them or leaves them out, for a tool to see what they cost; they are thrown either way. */
    show(on: boolean) {
      shown = on;
    },
    /** How many are in the air, of the most each pool holds. */
    counts: () => ({ ...alive, puffPool: PUFF_POOL, chipPool: CHIP_POOL }),
    dispose() {
      scene.remove(puffs.mesh, chips.mesh);
      puffs.dispose();
      chips.dispose();
    },
  };
}

