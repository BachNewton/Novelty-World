import { AdditiveBlending, Box3, BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, Vector3, type BufferGeometry, type Node } from "three/webgpu";
import { attribute, cameraPosition, float, positionGeometry, select, smoothstep, varying, vec2, vec3 } from "three/tsl";
import type { GlowInstance } from "./glows";
import { PARTS } from "../roadside/mesh";
import { buildStreetLamp } from "../roadside/models";
import { TOWN_PARTS } from "../town-kit/paint";
import { buildTownLamp } from "../town-kit/lamps";
import { nightRgb, type F, type Night } from "./night";

/*
 * Lamps: each kind's glass on the models in `art/roadside` and `art/town-kit`, turned into glows, and the soft
 * pool of light each lays on the ground, one draw for all of them. A pool is a little grid draped on the terrain by the
 * clipmap's own heights in its vertex shader, so it can't cut into a slope. It's added, so it shows on the road at night
 * and melts away by day, and it lights nothing else.
 */

export type LampKind = "road" | "town";

interface LampLook {
  token: string;
  haloM: number;
  poolM: number;
  poolLight: number;
  reachM: number;
}

export const LAMP_LOOKS: Record<LampKind, LampLook> = {
  road: { token: "lamp-road", haloM: 2.4, poolM: 15, poolLight: 0.2, reachM: 2400 },
  town: { token: "lamp-town", haloM: 1.6, poolM: 10, poolLight: 0.14, reachM: 1500 },
};

/** The bounds of one part of a model, from its own vertices, in the model's frame: empty where it has none. */
export function partBounds(geometry: BufferGeometry, part: number): Box3 {
  const position = geometry.getAttribute("position");
  const tint = geometry.getAttribute("tint");
  const box = new Box3();
  const point = new Vector3();
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (Math.round(tint.getX(vertex) * 255) === part) box.expandByPoint(point.fromBufferAttribute(position, vertex));
  }
  return box;
}

/** The middle of a model's glass: where its light comes from. */
export function glassMiddle(geometry: BufferGeometry, glass: number): Vector3 {
  const box = partBounds(geometry, glass);
  if (box.isEmpty()) throw new Error(`a lamp model with no glass (part ${glass})`);
  return box.getCenter(new Vector3());
}

/** Each kind's lamp head, from the very models the roadside draws (`art/roadside`'s galvanised lamp, `art/town-kit`'s post-top one), so a glow can't drift from its glass. */
export const LAMP_HEADS: Record<LampKind, Vector3> = {
  road: glassMiddle(buildStreetLamp().near, PARTS.indexOf("lens")),
  town: glassMiddle(buildTownLamp().near, TOWN_PARTS.indexOf("lamp-glass")),
};

const POOL_CELLS = 5;
const POOL_LIFT_M = 0.42;
/** Gone by here: a pool is a thing seen on the road ahead, and the halo carries the lamp further off. */
export const POOL_REACH_M = 700;
const LAMP_MIN_PIXELS = 3;
const POOL_FLOATS = 4;
const MIN_POOL_FADE = 0.55;

export interface LampSpot {
  kind: LampKind;
  /** The foot of the post on the ground. */
  x: number;
  y: number;
  z: number;
  /** Which way the arm reaches, the model's yaw: 0 is +z. */
  yaw?: number;
}

const roll = (x: number, z: number) => {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/** Where a lamp's head stands, turned with its post as a placement turns a model (`art/roadside/material.ts`): +z towards (sin yaw, cos yaw). */
export const headOf = ({ kind, x, y, z, yaw = 0 }: LampSpot) => {
  const head = LAMP_HEADS[kind];
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  return { x: x + head.x * cos + head.z * sin, y: y + head.y, z: z + head.z * cos - head.x * sin };
};

/** A lamp as a glow for `createGlows`. */
export function lampGlow(spot: LampSpot): GlowInstance {
  const look = LAMP_LOOKS[spot.kind];
  return { ...headOf(spot), sizeM: look.haloM, minPixels: LAMP_MIN_PIXELS, colour: nightRgb(look.token), brightness: 1, reachM: look.reachM, rhythm: -1, periodS: 1, phase: 0, strikes: roll(spot.x, spot.z) * 0.8 };
}

function gridGeometry() {
  const geometry = new InstancedBufferGeometry();
  const across = POOL_CELLS + 1;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < across; row++) {
    for (let column = 0; column < across; column++) {
      positions.push((column / POOL_CELLS) * 2 - 1, 0, (row / POOL_CELLS) * 2 - 1);
      if (row < POOL_CELLS && column < POOL_CELLS) {
        const at = row * across + column;
        indices.push(at, at + across, at + 1, at + 1, at + across, at + across + 1);
      }
    }
  }
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from(positions), 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * The ground's height at a place, for a vertex shader: the clipmap's `groundAt`, good within `reachM` of the camera.
 * Past that, or without one, a pool lies flat at its lamp's foot.
 */
export interface GroundAt {
  at: (place: Node<"vec2">) => F;
  reachM: number;
}

export function createLampPools(night: Night, capacity: number, groundAt?: GroundAt) {
  const places = new Float32Array(capacity * POOL_FLOATS);
  const tints = new Float32Array(capacity * POOL_FLOATS);
  const geometry = gridGeometry();
  geometry.instanceCount = 0;
  const placeAttribute = new InstancedBufferAttribute(places, POOL_FLOATS);
  const tintAttribute = new InstancedBufferAttribute(tints, POOL_FLOATS);
  geometry.setAttribute("poolPlace", placeAttribute);
  geometry.setAttribute("poolTint", tintAttribute);
  /** The lamps whose pools are drawn: all of them, each time the list changes. */
  const set = (spots: readonly LampSpot[]) => {
    if (spots.length > capacity) throw new Error(`${spots.length} lamp pools, and room for ${capacity}`);
    spots.forEach((spot, at) => {
      const look = LAMP_LOOKS[spot.kind];
      const head = headOf(spot);
      const { r, g, b } = nightRgb(look.token);
      places.set([head.x, spot.y, head.z, look.poolM], at * POOL_FLOATS);
      tints.set([r * look.poolLight, g * look.poolLight, b * look.poolLight, roll(spot.x, spot.z) * 0.8], at * POOL_FLOATS);
    });
    geometry.instanceCount = spots.length;
    placeAttribute.needsUpdate = true;
    tintAttribute.needsUpdate = true;
  };

  const place = attribute<"vec4">("poolPlace", "vec4");
  const tint = attribute<"vec4">("poolTint", "vec4");
  const spot = vec2(place.x.add(positionGeometry.x.mul(place.w)), place.z.add(positionGeometry.z.mul(place.w)));
  const hour = smoothstep(tint.w.mul(0.6), tint.w.mul(0.6).add(0.4), night.lampsOn);
  const fromCamera = place.xyz.sub(cameraPosition).length();
  const shown = float(1).sub(smoothstep(float(POOL_REACH_M * MIN_POOL_FADE), float(POOL_REACH_M), fromCamera)).mul(hour);
  const height = groundAt ? select(fromCamera.lessThan(groundAt.reachM), groundAt.at(spot), place.y) : place.y;

  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: 2 });
  // A pool that isn't lit has no size, so day pays for its vertices only.
  const scale = select(shown.greaterThan(0.001), float(1), float(0));
  material.positionNode = vec3(spot.x.mul(scale), height.add(POOL_LIFT_M).mul(scale), spot.y.mul(scale));
  const fromCentre = varying(positionGeometry.xz).length();
  const pool = float(1).sub(fromCentre.mul(fromCentre)).max(0);
  material.colorNode = varying(tint.xyz.mul(shown)).mul(pool.mul(pool));

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1005;
  return {
    mesh,
    set,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
