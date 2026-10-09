import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { FrozenRoom } from "./freeze";
import { FLICKER_CHANNELS, HOUSE_LIGHT, MAX_FLICKER, moonDirection } from "./lighting";
import { paletteHex } from "./palette";

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
 * channel; the shader modulates the baked light by those weights, so a
 * candle's spill through a doorway flickers with the candle.
 *
 * The work is plain data in and out (`BakeScene`, `Samples`, `Gathered`), so
 * it can be split across workers; `gatherLight` is the whole of it.
 */

/** A frozen room laid on a floor: `matrix` takes its frame to the floor's. */
export interface PlacedRoom {
  room: FrozenRoom;
  matrix: THREE.Matrix4;
}

/** Probes on a 3 × 3 grid over each room, this far either side of its middle, at this height. */
export const PROBE_SPREAD = 2;
export const PROBE_HEIGHT = 1;
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
  /** The share of each texel's light that flickers, per channel, over `MAX_FLICKER` (bytes, RGBA). */
  flicker: Uint8Array;
  /** Nine probes, row by row along z, each `PROBE_FLOATS` floats. */
  probes: Float32Array;
}

/** Light this faint (irradiance) can't be told from none on screen, so its shadow ray is skipped. */
const FAINT = 0.003;
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
}

/** The light at each sample: linear RGB, and the share of it that flickers per channel. */
export interface Gathered {
  light: Float32Array;
  weights: Float32Array;
}

/** Bakes samples: plain data in, plain data out, so a worker can run it.
 *  `sceneId` changes whenever the scene does, so a baker can keep its BVH. */
export type Baker = (scene: BakeScene, sceneId: number, samples: Samples) => Promise<Gathered>;

function channelOf(key: string): number {
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

/** A floor's rooms as a bake scene: what stops light, and every light. */
export function bakeScene(rooms: PlacedRoom[]): BakeScene {
  const total = rooms.reduce((sum, { room }) => sum + room.casters.length, 0);
  const casters = new Float32Array(total);
  const point = new THREE.Vector3();
  let at = 0;
  for (const { room, matrix } of rooms) {
    for (let i = 0; i < room.casters.length; i += 3) {
      point.set(room.casters[i], room.casters[i + 1], room.casters[i + 2]).applyMatrix4(matrix);
      casters[at++] = point.x;
      casters[at++] = point.y;
      casters[at++] = point.z;
    }
  }
  const lamps: Lamp[] = rooms.flatMap(({ room, matrix }) =>
    room.lights.map((light, i) => {
      if (light.flicker > MAX_FLICKER) throw new Error(`A light in ${room.id} flickers by ${light.flicker}; the most is ${MAX_FLICKER}`);
      const position = light.at.clone().applyMatrix4(matrix);
      return { at: [position.x, position.y, position.z], rgb: linear(light.colour, light.intensity), range: light.range, flicker: light.flicker, channel: channelOf(`${room.id}:${i}`) };
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
  const weights = new Float32Array(count * FLICKER_CHANNELS);
  const ray = new THREE.Ray();
  // three-mesh-bvh's types say a raycast always hits; it returns null when nothing is in the way.
  const raycastFirst = bvh.raycastFirst.bind(bvh) as (...args: Parameters<MeshBVH["raycastFirst"]>) => THREE.Intersection | null;
  const blocked = (direction: THREE.Vector3, far: number) => {
    ray.direction.copy(direction);
    return raycastFirst(ray, THREE.DoubleSide, 0, far) !== null;
  };
  const moon = new THREE.Vector3(...scene.moon);
  const lamps = scene.lamps.map((lamp) => ({ ...lamp, position: new THREE.Vector3(...lamp.at), brightness: luminance(...lamp.rgb) }));
  const normal = new THREE.Vector3();
  const toLight = new THREE.Vector3();
  for (let n = 0; n < count; n++) {
    normal.fromArray(samples.normal, n * 3);
    ray.origin.fromArray(samples.position, n * 3).addScaledVector(normal, LIFT);
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
      if (distance >= lamp.range || distance < 1e-6) continue;
      toLight.divideScalar(distance);
      const ndl = normal.dot(toLight);
      if (ndl <= 0) continue;
      const strength = falloff(distance, lamp.range) * ndl;
      if (lamp.brightness * strength < FAINT) continue;
      if (blocked(toLight, distance - 0.02)) continue;
      r += lamp.rgb[0] * strength;
      g += lamp.rgb[1] * strength;
      b += lamp.rgb[2] * strength;
      if (lamp.flicker > 0) weights[n * FLICKER_CHANNELS + lamp.channel] += lamp.flicker * lamp.brightness * strength;
    }
    light[n * 3] = r;
    light[n * 3 + 1] = g;
    light[n * 3 + 2] = b;
    const total = luminance(r, g, b);
    for (let k = 0; k < FLICKER_CHANNELS; k++) weights[n * FLICKER_CHANNELS + k] = total > 0 ? weights[n * FLICKER_CHANNELS + k] / total : 0;
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

/** A placed room's samples: every lightmap texel, then its probes' faces. */
export function roomSamples({ room, matrix }: PlacedRoom): Samples {
  const texels = room.texels.index.length;
  const probes = 9 * PROBE_FACES.length;
  const position = new Float32Array((texels + probes) * 3);
  const normal = new Float32Array((texels + probes) * 3);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let n = 0; n < texels; n++) {
    p.fromArray(room.texels.position, n * 3).applyMatrix4(matrix).toArray(position, n * 3);
    nrm.fromArray(room.texels.normal, n * 3).applyMatrix3(normalMatrix).normalize().toArray(normal, n * 3);
  }
  let n = texels;
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      p.set((i - 1) * PROBE_SPREAD, PROBE_HEIGHT, (j - 1) * PROBE_SPREAD).applyMatrix4(matrix);
      for (const face of PROBE_FACES) {
        p.toArray(position, n * 3);
        normal.set(face, n * 3);
        n++;
      }
    }
  }
  return { position, normal };
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
    irradiance[at + 3] = THREE.DataUtils.toHalfFloat(1);
    for (let k = 0; k < FLICKER_CHANNELS; k++) flicker[at + k] = Math.round(Math.min(1, weights[n * FLICKER_CHANNELS + k] / MAX_FLICKER) * 255);
  }
  const probes = light.slice(index.length * 3, index.length * 3 + 9 * PROBE_FLOATS);
  return { irradiance, flicker, probes };
}
