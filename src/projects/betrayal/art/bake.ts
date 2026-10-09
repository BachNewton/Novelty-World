import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { Edge } from "../types";
import type { FrozenRoom } from "./freeze";
import { FLICKER_CHANNELS, HOUSE_LIGHT, MAX_FLICKER, moonDirection } from "./lighting";
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
 * The work is plain data in and out (`BakeScene`, `Samples`, `Gathered`), so
 * it can be split across workers; `gatherLight` is the whole of it.
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

/** Bakes samples: plain data in, plain data out, so a worker can run it.
 *  `sceneId` changes whenever the scene does, so a baker can keep its BVH. */
export type Baker = (scene: BakeScene, sceneId: number, samples: Samples) => Promise<Gathered>;

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
  const blocks = rooms.flatMap((placed) => [
    { triangles: placed.room.casters, matrix: placed.matrix },
    ...Object.entries(placed.room.plugs).flatMap(([edge, triangles]) => (roomBeyond(rooms, placed, edge as Edge) ? [] : [{ triangles, matrix: placed.matrix }])),
  ]);
  const casters = new Float32Array(blocks.reduce((sum, { triangles }) => sum + triangles.length, 0));
  const point = new THREE.Vector3();
  let at = 0;
  for (const { triangles, matrix } of blocks) {
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
  return { casters, lamps, moon: moonDirection().toArray(), moonRgb: linear(HOUSE_LIGHT.moon.colour, HOUSE_LIGHT.moon.intensity) };
}

/** What stops light, ready for shadow rays. */
export function occluders(casters: Float32Array): MeshBVH {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(casters.length > 0 ? casters : new Float32Array(9), 3));
  return new MeshBVH(geometry, { maxLeafTris: 8 });
}

/** The light arriving at each sample, shadowed by `bvh` (built from the scene's casters). */
export function gatherLight(scene: BakeScene, bvh: MeshBVH, samples: Samples): Gathered {
  const count = samples.position.length / 3;
  const light = new Float32Array(count * 3);
  const weights = new Float32Array(count * SIGNALS);
  const ray = new THREE.Ray();
  // three-mesh-bvh's types say a raycast always hits; it returns null when nothing is in the way.
  const raycastFirst = bvh.raycastFirst.bind(bvh) as (...args: Parameters<MeshBVH["raycastFirst"]>) => THREE.Intersection | null;
  const within = new THREE.Box3();
  let bounded = false;
  /** How far along the ray it leaves the sample's box: shadows nearer than that are the piece's own. */
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
  const blocked = (direction: THREE.Vector3, far: number) => {
    ray.direction.copy(direction);
    const near = exit(direction);
    return near < far && raycastFirst(ray, THREE.DoubleSide, near, far) !== null;
  };
  const moon = new THREE.Vector3(...scene.moon);
  const lamps = scene.lamps.map((lamp) => ({ ...lamp, position: new THREE.Vector3(...lamp.at), brightness: luminance(...lamp.rgb) }));
  const normal = new THREE.Vector3();
  const toLight = new THREE.Vector3();
  const size = new THREE.Vector3();
  for (let n = 0; n < count; n++) {
    normal.fromArray(samples.normal, n * 3);
    ray.origin.fromArray(samples.position, n * 3).addScaledVector(normal, LIFT);
    bounded = !Number.isNaN(samples.within[n * 6]);
    if (bounded) {
      within.min.fromArray(samples.within, n * 6).min(ray.origin);
      within.max.fromArray(samples.within, n * 6 + 3).max(ray.origin);
    }
    let r = 0;
    let g = 0;
    let b = 0;
    const ndlMoon = normal.dot(moon);
    if (ndlMoon > 0 && !blocked(moon, 60)) {
      r += scene.moonRgb[0] * ndlMoon;
      g += scene.moonRgb[1] * ndlMoon;
      b += scene.moonRgb[2] * ndlMoon;
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
      if (!held && blocked(toLight, distance - 0.02)) continue;
      r += lamp.rgb[0] * strength;
      g += lamp.rgb[1] * strength;
      b += lamp.rgb[2] * strength;
      if (lamp.flicker > 0) weights[n * SIGNALS + lamp.channel] += lamp.flicker * lamp.brightness * strength;
    }
    light[n * 3] = r;
    light[n * 3 + 1] = g;
    light[n * 3 + 2] = b;
    const total = luminance(r, g, b);
    for (let k = 0; k < SIGNALS; k++) weights[n * SIGNALS + k] = total > 0 ? weights[n * SIGNALS + k] / total : 0;
  }
  return { light, weights };
}

/** Bakes in this thread, keeping the last scene's BVH: for tests, and where workers can't run. */
export function inlineBaker(): Baker {
  let current: { id: number; bvh: MeshBVH } | null = null;
  return (scene, sceneId, samples) => {
    if (current?.id !== sceneId) current = { id: sceneId, bvh: occluders(scene.casters) };
    return Promise.resolve(gatherLight(scene, current.bvh, samples));
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
export function roomLight(room: FrozenRoom, gathered: Gathered): RoomLight {
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
