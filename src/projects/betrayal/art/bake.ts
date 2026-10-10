import * as THREE from "three";
import { MeshBVH, SAH } from "three-mesh-bvh";
import type { Edge } from "../types";
import type { FrozenRoom, Surfaces, Texels } from "./freeze";
import { BOUNCE, FLICKER_CHANNELS, HOUSE_LIGHT, MAX_FLICKER, moonDirection } from "./lighting";
import { paletteHex } from "./palette";
import { TILE, type FlickerSignal } from "./room";

/*
 * The bake: direct light from every room light on a floor, and from the
 * moon, onto every lightmap texel of the rooms asked for, each sample tested
 * for shadow by a ray through the whole floor (walls, ceilings, furniture and
 * the rooms next door). So light spills through an open doorway onto the
 * floor beyond, and a solid wall stops it. It is the same light three.js
 * would draw live (Lambert, inverse-square falloff cut off at the light's
 * range), only shadowed by everything and worked out once.
 *
 * Alongside the light, each texel keeps how much of it flickers, per flicker
 * signal (the four flame signals in the flicker map, the water signal in the
 * lightmap's alpha); the shader modulates the baked light by those weights,
 * so a candle's spill through a doorway flickers with the candle.
 *
 * Then one bounce: each texel, and each probe's faces, gathers the light
 * the surfaces it sees reflect, tinted by their colour (`gatherBounce`), so
 * light falls off into the corners rather than stopping dead. It is a pass of
 * its own, after the direct light is shown, and is gathered at a coarser
 * grid than the lightmap's and filled in between (`bounceSamples`,
 * `spreadBounce`), as it changes slowly over a surface.
 *
 * The work is plain data in and out (`BakeScene`, `Samples`, `Gathered`), so
 * it can be split across workers; `gather` runs either pass.
 */

/** A frozen room laid on a floor: `matrix` takes its frame to the floor's. */
export interface PlacedRoom {
  room: FrozenRoom;
  matrix: THREE.Matrix4;
}

/** Signals a light can waver with: the four flame channels, then water. */
const SIGNALS = FLICKER_CHANNELS + 1;
const WATER = FLICKER_CHANNELS;
/** Floats in one probe: an ambient cube, a colour for each way a surface can
 *  face along the floor's axes (+x, −x, +y, −y, +z, −z). */
export const PROBE_FLOATS = 18;
const PROBE_FACES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** What laying light into a room's lightmap needs to know of the room: plain
 *  data a frozen room has, so a worker can do it as well. */
export interface LightLayout {
  texels: Pick<Texels, "width" | "height" | "index" | "charts">;
  probes: { all: ArrayLike<unknown> };
}

/** The bake of one room. */
export interface RoomLight {
  /** Irradiance per atlas texel, RGBA half floats. */
  irradiance: Uint16Array;
  /** The share of each texel's light that flickers, per flame channel, over `MAX_FLICKER` (bytes, RGBA). */
  flicker: Uint8Array;
  /** The room's probes, in the order of its `probes.all`, each `PROBE_FLOATS` floats, in the floor's axes. */
  probes: Float32Array;
}

/** Light this faint (irradiance) can't be told from none on screen, so its shadow ray is skipped. */
const FAINT = 0.003;
/** How much of a held lamp's light reaches the faces of its piece turned away from it. */
const HELD_SHARE = 0.5;
/** Off a surface by this much before a shadow ray leaves it, so it doesn't hit its own face. */
const LIFT = 0.005;

/** A light on the floor, as plain numbers: position, linear colour times intensity, range, flicker and its channel. */
export interface Lamp {
  at: [number, number, number];
  rgb: [number, number, number];
  range: number;
  flicker: number;
  channel: number;
}

/** What a bake needs to know about a floor. */
export interface BakeScene {
  /** Triangles that stop light, nine floats each, in the floor's frame. */
  casters: Float32Array;
  /** Each caster triangle's albedo, linear RGB: the share of the light on it that it bounces. */
  albedo: Float32Array;
  lamps: Lamp[];
  /** Towards the moon, and its light. */
  moon: [number, number, number];
  moonRgb: [number, number, number];
}

/** Points to light, in the floor's frame: a position and the way the surface faces, three floats each. */
export interface Samples {
  position: Float32Array;
  normal: Float32Array;
  /** Per sample, a box its shadow rays start from the edge of (min xyz, max xyz),
   *  or NaN for none: a probe inside a piece isn't shadowed by the piece. */
  within: Float32Array;
}

/** The light at each sample: linear RGB, and the share of it that flickers per signal (`SIGNALS` each). */
export interface Gathered {
  light: Float32Array;
  weights: Float32Array;
}

/** The bake's passes: the light straight from the lamps and the moon, then its one bounce. */
export type Pass = "direct" | "bounce";

/** Bakes samples: plain data in, plain data out, so a worker can run it.
 *  `sceneId` changes whenever the scene does, so a baker can keep its BVH. */
export type Baker = (scene: BakeScene, sceneId: number, samples: Samples, pass?: Pass) => Promise<Gathered>;

/** The signal a light wavers with: water, a flame channel it names, or one picked by its place in the floor. */
function channelOf(signal: FlickerSignal | undefined, key: string): number {
  if (signal === "water") return WATER;
  if (signal !== undefined) return signal;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % FLICKER_CHANNELS;
}

function linear(colour: Parameters<typeof paletteHex>[0], intensity: number): [number, number, number] {
  const c = new THREE.Color(paletteHex(colour));
  return [c.r * intensity, c.g * intensity, c.b * intensity];
}

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** three.js's falloff for a point light with decay 2. */
function falloff(distance: number, range: number): number {
  const ratio = distance / range;
  const cut = Math.max(0, Math.min(1, 1 - ratio ** 4));
  return (cut * cut) / Math.max(distance * distance, 0.01);
}

/** Whether a room lies through a placed room's edge: a room's centre one tile away that way. */
function roomBeyond(rooms: PlacedRoom[], { matrix }: PlacedRoom, edge: Edge): boolean {
  const out = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[edge];
  const beyond = new THREE.Vector3(out[0] * TILE, 0, out[1] * TILE).applyMatrix4(matrix);
  return rooms.some((other) => new THREE.Vector3().setFromMatrixPosition(other.matrix).distanceTo(beyond) < TILE / 2);
}

/** A floor's rooms as a bake scene: what stops light, and every light. A
 *  doorway with no room beyond it is shut (see the stage's plugs). */
export function bakeScene(rooms: PlacedRoom[]): BakeScene {
  const blocks: { surfaces: Surfaces; matrix: THREE.Matrix4 }[] = rooms.flatMap((placed) => [
    { surfaces: placed.room.casters, matrix: placed.matrix },
    ...Object.entries(placed.room.plugs).flatMap(([edge, surfaces]) => (roomBeyond(rooms, placed, edge as Edge) ? [] : [{ surfaces, matrix: placed.matrix }])),
  ]);
  const casters = new Float32Array(blocks.reduce((sum, { surfaces }) => sum + surfaces.triangles.length, 0));
  const albedo = new Float32Array(casters.length / 3);
  const point = new THREE.Vector3();
  let at = 0;
  for (const { surfaces, matrix } of blocks) {
    albedo.set(surfaces.albedo, at / 3);
    const { triangles } = surfaces;
    for (let i = 0; i < triangles.length; i += 3) {
      point.set(triangles[i], triangles[i + 1], triangles[i + 2]).applyMatrix4(matrix);
      casters[at++] = point.x;
      casters[at++] = point.y;
      casters[at++] = point.z;
    }
  }
  const lamps: Lamp[] = rooms.flatMap(({ room, matrix }) =>
    room.lights.map((light, i) => {
      if (light.flicker > MAX_FLICKER) throw new Error(`A light in ${room.id} flickers by ${light.flicker}; the most is ${MAX_FLICKER}`);
      const position = light.at.clone().applyMatrix4(matrix);
      return { at: [position.x, position.y, position.z], rgb: linear(light.colour, light.intensity), range: light.range, flicker: light.flicker, channel: channelOf(light.signal, `${room.id}:${i}`) };
    }),
  );
  return { casters, albedo, lamps, moon: moonDirection().toArray(), moonRgb: linear(HOUSE_LIGHT.moon.colour, HOUSE_LIGHT.moon.intensity) };
}

/** What stops light, ready for shadow rays. */
export function occluders(casters: Float32Array): MeshBVH {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(casters.length > 0 ? casters : new Float32Array(9), 3));
  return new MeshBVH(geometry, { maxLeafTris: 8, strategy: SAH });
}

/** Floats in one reading of light at a point: linear RGB, then how much of it flickers per signal (light, not yet a share). */
const READING = 3 + SIGNALS;

/**
 * Rays through the floor from one point at a time: `from` sets where they
 * start (and the box of the piece the point is inside, whose own surfaces
 * neither shadow nor bounce), `direct` reads the light straight from the
 * lamps and the moon there, and `first` finds what a ray hits.
 */
function tracer(scene: BakeScene, bvh: MeshBVH) {
  const ray = new THREE.Ray();
  // three-mesh-bvh's types say a raycast always hits; it returns null when nothing is in the way.
  const raycastFirst = bvh.raycastFirst.bind(bvh) as (...args: Parameters<MeshBVH["raycastFirst"]>) => THREE.Intersection | null;
  const within = new THREE.Box3();
  let bounded = false;
  /** How far along the ray it leaves the sample's box: what is nearer than that is the piece's own. */
  const exit = (direction: THREE.Vector3) => {
    if (!bounded) return 0;
    let t = Infinity;
    for (const axis of ["x", "y", "z"] as const) {
      const d = direction[axis];
      if (Math.abs(d) < 1e-9) continue;
      t = Math.min(t, ((d > 0 ? within.max[axis] : within.min[axis]) - ray.origin[axis]) / d);
    }
    return Math.max(0, t);
  };
  const first = (direction: THREE.Vector3, far: number) => {
    ray.direction.copy(direction);
    const near = exit(direction);
    return near < far ? raycastFirst(ray, THREE.DoubleSide, near, far) : null;
  };
  const moon = new THREE.Vector3(...scene.moon);
  const lamps = scene.lamps.map((lamp) => ({ ...lamp, position: new THREE.Vector3(...lamp.at), brightness: luminance(...lamp.rgb) }));
  const toLight = new THREE.Vector3();
  const size = new THREE.Vector3();
  return {
    first,
    /** Rays start a lift off the surface at `position` facing `normal`, and outside `box` (min xyz, max xyz at `boxAt`) when it is a number. */
    from: (position: THREE.Vector3, normal: THREE.Vector3, box: Float32Array | null, boxAt: number) => {
      ray.origin.copy(position).addScaledVector(normal, LIFT);
      bounded = box !== null && !Number.isNaN(box[boxAt]);
      if (box && bounded) {
        within.min.fromArray(box, boxAt).min(ray.origin);
        within.max.fromArray(box, boxAt + 3).max(ray.origin);
      }
    },
    /** The direct light on a surface facing `normal` where the rays start, into `out` (`READING` floats). */
    direct: (normal: THREE.Vector3, out: Float32Array) => {
      out.fill(0);
      const ndlMoon = normal.dot(moon);
      if (ndlMoon > 0 && first(moon, 60) === null) {
        for (let k = 0; k < 3; k++) out[k] += scene.moonRgb[k] * ndlMoon;
      }
      for (const lamp of lamps) {
        toLight.subVectors(lamp.position, ray.origin);
        const distance = toLight.length();
        if (distance >= lamp.range) continue;
        toLight.divideScalar(Math.max(distance, 1e-6));
        const ndl = normal.dot(toLight);
        // A lamp held inside a piece lights the piece's own probe all round as well, as
        // from the piece's surfaces, about its radius away: one probe can't place the flame.
        const held = bounded && within.containsPoint(lamp.position);
        const around = held ? HELD_SHARE * falloff(Math.max(distance, within.getSize(size).length() / 2), lamp.range) : 0;
        const strength = Math.max(ndl > 0 ? falloff(distance, lamp.range) * ndl : 0, around);
        if (strength === 0 || lamp.brightness * strength < FAINT) continue;
        if (!held && first(toLight, distance - 0.02) !== null) continue;
        for (let k = 0; k < 3; k++) out[k] += lamp.rgb[k] * strength;
        if (lamp.flicker > 0) out[3 + lamp.channel] += lamp.flicker * lamp.brightness * strength;
      }
      return out;
    },
  };
}

/** Writes a reading as sample `n` of gathered light, its flicker as shares of the light. */
function record(reading: Float32Array, n: number, { light, weights }: Gathered) {
  light.set(reading.subarray(0, 3), n * 3);
  const total = luminance(reading[0], reading[1], reading[2]);
  for (let k = 0; k < SIGNALS; k++) weights[n * SIGNALS + k] = total > 0 ? reading[3 + k] / total : 0;
}

/** The light arriving at each sample straight from the lamps and the moon, shadowed by `bvh` (built from the scene's casters). */
function gatherLight(scene: BakeScene, bvh: MeshBVH, samples: Samples): Gathered {
  const count = samples.position.length / 3;
  const gathered: Gathered = { light: new Float32Array(count * 3), weights: new Float32Array(count * SIGNALS) };
  const rays = tracer(scene, bvh);
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const reading = new Float32Array(READING);
  for (let n = 0; n < count; n++) {
    normal.fromArray(samples.normal, n * 3);
    rays.from(position.fromArray(samples.position, n * 3), normal, samples.within, n * 6);
    record(rays.direct(normal, reading), n, gathered);
  }
  return gathered;
}

/** How far a bounce ray looks for a surface, in metres: further than across a room and the next. */
const BOUNCE_REACH = 20;
/** The direct light a bounce ray finds is read once per cell this size (metres) of each triangle it hits, and shared by every ray hitting there. */
const BOUNCE_CELL = 0.25;

/** The `i`th of a base-2 sequence filling 0–1 evenly. */
function radicalInverse(i: number): number {
  let bits = i;
  let inverse = 0;
  let scale = 0.5;
  while (bits > 0) {
    if (bits & 1) inverse += scale;
    bits >>= 1;
    scale /= 2;
  }
  return inverse;
}

/** Two numbers in 0–1 from a point, the same every bake: how a sample turns its set of rays, so neighbours' patterns differ. */
function turnOf(x: number, y: number, z: number): [number, number] {
  let h = Math.imul(Math.round(x * 1000), 0x9e3779b1) ^ Math.imul(Math.round(y * 1000), 0x85ebca77) ^ Math.imul(Math.round(z * 1000), 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return [(h >>> 0) / 2 ** 32, (Math.imul(h, 0x27d4eb2f) >>> 0) / 2 ** 32];
}

/**
 * One bounce of light at each sample: `rays` rays over the half of the
 * sky it faces, more of them towards its normal (cosine-weighted, so the
 * plain mean of what they bring is the irradiance), each bringing the direct
 * light on the surface it hits times that surface's albedo. Rays that hit
 * nothing bring nothing (the sky's fill is the house's live light). Its
 * flicker follows the lamps the bounced light came from.
 *
 * Reading the direct light where a ray lands costs a shadow ray a lamp, so
 * it is read once per `BOUNCE_CELL` of each triangle: at the triangle's
 * point nearest the cell's centre, so the reading depends only on where the
 * ray lands, never on which ray got there first.
 */
export function gatherBounce(scene: BakeScene, bvh: MeshBVH, samples: Samples, rays = BOUNCE.rays): Gathered {
  const count = samples.position.length / 3;
  const gathered: Gathered = { light: new Float32Array(count * 3), weights: new Float32Array(count * SIGNALS) };
  const out = tracer(scene, bvh);
  const back = tracer(scene, bvh);
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const facing = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const corners = new THREE.Triangle();
  const readings = new Map<number, Float32Array>();
  /** The direct light on the side facing `facing` of a triangle at `point`, read once per cell of it. */
  const directNear = (triangle: number, front: boolean, point: THREE.Vector3, facing: THREE.Vector3): Float32Array => {
    const [i, j, k] = [Math.floor(point.x / BOUNCE_CELL), Math.floor(point.y / BOUNCE_CELL), Math.floor(point.z / BOUNCE_CELL)];
    // Cells are counted from 1024 below the floor's origin each way: a floor is far smaller.
    const key = (((triangle * 2 + (front ? 1 : 0)) * 2048 + i + 1024) * 2048 + j + 1024) * 2048 + k + 1024;
    const known = readings.get(key);
    if (known) return known;
    const at = triangle * 9;
    corners.a.fromArray(scene.casters, at);
    corners.b.fromArray(scene.casters, at + 3);
    corners.c.fromArray(scene.casters, at + 6);
    corners.closestPointToPoint(centre.set((i + 0.5) * BOUNCE_CELL, (j + 0.5) * BOUNCE_CELL, (k + 0.5) * BOUNCE_CELL), centre);
    back.from(centre, facing, null, 0);
    const reading = back.direct(facing, new Float32Array(READING));
    readings.set(key, reading);
    return reading;
  };
  const sum = new Float32Array(READING);
  const up = new THREE.Vector3(0, 1, 0);
  const across = new THREE.Vector3(1, 0, 0);
  for (let n = 0; n < count; n++) {
    normal.fromArray(samples.normal, n * 3);
    position.fromArray(samples.position, n * 3);
    out.from(position, normal, samples.within, n * 6);
    tangent.crossVectors(Math.abs(normal.y) < 0.99 ? up : across, normal).normalize();
    bitangent.crossVectors(normal, tangent);
    const [turnU, turnV] = turnOf(position.x, position.y, position.z);
    sum.fill(0);
    for (let i = 0; i < rays; i++) {
      const u = ((i + 0.5) / rays + turnU) % 1;
      const v = (radicalInverse(i) + turnV) % 1;
      const radius = Math.sqrt(u);
      const angle = 2 * Math.PI * v;
      direction
        .copy(normal)
        .multiplyScalar(Math.sqrt(1 - u))
        .addScaledVector(tangent, radius * Math.cos(angle))
        .addScaledVector(bitangent, radius * Math.sin(angle));
      const hit = out.first(direction, BOUNCE_REACH);
      if (!hit?.face) continue;
      const triangle = Math.floor(hit.face.a / 3);
      const ar = scene.albedo[triangle * 3];
      const ag = scene.albedo[triangle * 3 + 1];
      const ab = scene.albedo[triangle * 3 + 2];
      if (ar + ag + ab === 0) continue;
      facing.copy(hit.face.normal);
      const front = facing.dot(direction) < 0;
      if (!front) facing.negate();
      const hitReading = directNear(triangle, front, hit.point, facing);
      const lit = luminance(hitReading[0], hitReading[1], hitReading[2]);
      if (lit === 0) continue;
      sum[0] += hitReading[0] * ar;
      sum[1] += hitReading[1] * ag;
      sum[2] += hitReading[2] * ab;
      const kept = luminance(hitReading[0] * ar, hitReading[1] * ag, hitReading[2] * ab) / lit;
      for (let k = 0; k < SIGNALS; k++) sum[3 + k] += hitReading[3 + k] * kept;
    }
    for (let k = 0; k < READING; k++) sum[k] /= rays;
    record(sum, n, gathered);
  }
  return gathered;
}

/** Runs one pass of the bake over samples. */
export function gather(pass: Pass, scene: BakeScene, bvh: MeshBVH, samples: Samples): Gathered {
  return pass === "direct" ? gatherLight(scene, bvh, samples) : gatherBounce(scene, bvh, samples);
}

/** Bakes in this thread, keeping the last scene's BVH: for tests, and where workers can't run. */
export function inlineBaker(): Baker {
  let current: { id: number; bvh: MeshBVH } | null = null;
  return (scene, sceneId, samples, pass = "direct") => {
    if (current?.id !== sceneId) current = { id: sceneId, bvh: occluders(scene.casters) };
    return Promise.resolve(gather(pass, scene, current.bvh, samples));
  };
}

/** A placed room's samples: every lightmap texel, then each probe's faces. */
export function roomSamples({ room, matrix }: PlacedRoom): Samples {
  const texels = room.texels.index.length;
  const probes = room.probes.all.length * PROBE_FACES.length;
  const position = new Float32Array((texels + probes) * 3);
  const normal = new Float32Array((texels + probes) * 3);
  const within = new Float32Array((texels + probes) * 6).fill(NaN);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let n = 0; n < texels; n++) {
    p.fromArray(room.texels.position, n * 3).applyMatrix4(matrix).toArray(position, n * 3);
    nrm.fromArray(room.texels.normal, n * 3).applyMatrix3(normalMatrix).normalize().toArray(normal, n * 3);
  }
  let n = texels;
  for (const probe of room.probes.all) {
    p.copy(probe.at).applyMatrix4(matrix);
    const box = probe.within?.clone().applyMatrix4(matrix);
    for (const face of PROBE_FACES) {
      p.toArray(position, n * 3);
      normal.set(face, n * 3);
      if (box) {
        box.min.toArray(within, n * 6);
        box.max.toArray(within, n * 6 + 3);
      }
      n++;
    }
  }
  return { position, normal, within };
}

/** A room's bake from the light gathered at its samples (as `roomSamples` lays them). */
export function roomLight(room: LightLayout, gathered: Gathered): RoomLight {
  const { width, height, index } = room.texels;
  const irradiance = new Uint16Array(width * height * 4);
  const flicker = new Uint8Array(width * height * 4);
  const { light, weights } = gathered;
  for (let n = 0; n < index.length; n++) {
    const at = index[n] * 4;
    for (let k = 0; k < 3; k++) irradiance[at + k] = THREE.DataUtils.toHalfFloat(light[n * 3 + k]);
    // The lightmap's alpha carries the share of the light that swells with the water signal.
    irradiance[at + 3] = THREE.DataUtils.toHalfFloat(Math.min(1, weights[n * SIGNALS + WATER] / MAX_FLICKER));
    for (let k = 0; k < FLICKER_CHANNELS; k++) flicker[at + k] = Math.round(Math.min(1, weights[n * SIGNALS + k] / MAX_FLICKER) * 255);
  }
  const probes = light.slice(index.length * 3, index.length * 3 + room.probes.all.length * PROBE_FLOATS);
  return { irradiance, flicker, probes };
}

/** Where along a chart's axis `length` texels long the bounce is gathered:
 *  every `step`th texel inside its one-texel border, and the last inside it;
 *  the border, a copy of the chart's edge, reads the nearest. */
function coarseAxis(length: number, step: number): number[] {
  if (length === 1) return [0];
  const at: number[] = [];
  for (let i = 1; i < length - 2; i += step) at.push(i);
  at.push(length - 2);
  return at;
}

/** A placed room's bounce samples: its lightmap's texels every `step` along
 *  each chart's axes (and each chart's last inner row and column), then each
 *  probe's faces, as `spreadBounce` reads them back. */
export function bounceSamples(placed: PlacedRoom, step = BOUNCE.step): Samples {
  const all = roomSamples(placed);
  const { charts, index } = placed.room.texels;
  const picked: number[] = [];
  for (let c = 0; c < charts.length; c += 3) {
    const [start, w, h] = [charts[c], charts[c + 1], charts[c + 2]];
    for (const j of coarseAxis(h, step)) for (const i of coarseAxis(w, step)) picked.push(start + j * w + i);
  }
  for (let n = index.length; n < all.position.length / 3; n++) picked.push(n);
  const position = new Float32Array(picked.length * 3);
  const normal = new Float32Array(picked.length * 3);
  const within = new Float32Array(picked.length * 6);
  picked.forEach((n, k) => {
    position.set(all.position.subarray(n * 3, n * 3 + 3), k * 3);
    normal.set(all.normal.subarray(n * 3, n * 3 + 3), k * 3);
    within.set(all.within.subarray(n * 6, n * 6 + 6), k * 6);
  });
  return { position, normal, within };
}

/**
 * The bounce gathered at a room's `bounceSamples`, spread back over every
 * texel and probe face as `roomSamples` lays them: each chart's coarse grid
 * is smoothed (a 3×3 tent, within the chart), which evens out the noise of
 * a few dozen rays, then read bilinearly at each texel.
 */
export function spreadBounce(room: LightLayout, coarse: Gathered, step = BOUNCE.step): Gathered {
  const { charts, index } = room.texels;
  const count = index.length + room.probes.all.length * PROBE_FACES.length;
  const spread: Gathered = { light: new Float32Array(count * 3), weights: new Float32Array(count * SIGNALS) };
  const width = 3 + SIGNALS;
  let at = 0;
  for (let c = 0; c < charts.length; c += 3) {
    const [start, w, h] = [charts[c], charts[c + 1], charts[c + 2]];
    const us = coarseAxis(w, step);
    const vs = coarseAxis(h, step);
    const grid = new Float32Array(us.length * vs.length * width);
    for (let k = 0; k < us.length * vs.length; k++) {
      grid.set(coarse.light.subarray((at + k) * 3, (at + k) * 3 + 3), k * width);
      grid.set(coarse.weights.subarray((at + k) * SIGNALS, (at + k) * SIGNALS + SIGNALS), k * width + 3);
    }
    at += us.length * vs.length;
    const smooth = new Float32Array(grid.length);
    for (let gj = 0; gj < vs.length; gj++) {
      for (let gi = 0; gi < us.length; gi++) {
        let total = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const [ni, nj] = [gi + di, gj + dj];
            if (ni < 0 || nj < 0 || ni >= us.length || nj >= vs.length) continue;
            const weight = (2 - Math.abs(di)) * (2 - Math.abs(dj));
            total += weight;
            for (let k = 0; k < width; k++) smooth[(gj * us.length + gi) * width + k] += grid[(nj * us.length + ni) * width + k] * weight;
          }
        }
        for (let k = 0; k < width; k++) smooth[(gj * us.length + gi) * width + k] /= total;
      }
    }
    /** The grid cell a texel lies in along an axis, and how far across it. */
    const cell = (axis: number[], t: number): [number, number] => {
      let k = 0;
      while (k < axis.length - 2 && axis[k + 1] <= t) k++;
      return axis.length === 1 ? [0, 0] : [k, THREE.MathUtils.clamp((t - axis[k]) / (axis[k + 1] - axis[k]), 0, 1)];
    };
    for (let j = 0; j < h; j++) {
      const [gj, fj] = cell(vs, j);
      const gj1 = Math.min(gj + 1, vs.length - 1);
      for (let i = 0; i < w; i++) {
        const [gi, fi] = cell(us, i);
        const gi1 = Math.min(gi + 1, us.length - 1);
        const n = start + j * w + i;
        for (let k = 0; k < width; k++) {
          const value =
            smooth[(gj * us.length + gi) * width + k] * (1 - fi) * (1 - fj) +
            smooth[(gj * us.length + gi1) * width + k] * fi * (1 - fj) +
            smooth[(gj1 * us.length + gi) * width + k] * (1 - fi) * fj +
            smooth[(gj1 * us.length + gi1) * width + k] * fi * fj;
          if (k < 3) spread.light[n * 3 + k] = value;
          else spread.weights[n * SIGNALS + k - 3] = value;
        }
      }
    }
  }
  const probeFloats = count - index.length;
  spread.light.set(coarse.light.subarray(at * 3, (at + probeFloats) * 3), index.length * 3);
  spread.weights.set(coarse.weights.subarray(at * SIGNALS, (at + probeFloats) * SIGNALS), index.length * SIGNALS);
  return spread;
}

/** Direct light with its bounce added, `strength` times over; the flicker shares follow each's part of the light. */
export function withBounce(direct: Gathered, bounce: Gathered, strength = BOUNCE.strength): Gathered {
  const count = direct.light.length / 3;
  const light = new Float32Array(direct.light.length);
  const weights = new Float32Array(direct.weights.length);
  for (let n = 0; n < count; n++) {
    for (let k = 0; k < 3; k++) light[n * 3 + k] = direct.light[n * 3 + k] + bounce.light[n * 3 + k] * strength;
    const own = luminance(direct.light[n * 3], direct.light[n * 3 + 1], direct.light[n * 3 + 2]);
    const bounced = luminance(bounce.light[n * 3], bounce.light[n * 3 + 1], bounce.light[n * 3 + 2]) * strength;
    const total = own + bounced;
    for (let k = 0; k < SIGNALS; k++) {
      weights[n * SIGNALS + k] = total > 0 ? (direct.weights[n * SIGNALS + k] * own + bounce.weights[n * SIGNALS + k] * bounced) / total : 0;
    }
  }
  return { light, weights };
}
