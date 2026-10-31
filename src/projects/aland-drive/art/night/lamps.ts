import { AdditiveBlending, BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, type Node } from "three/webgpu";
import { attribute, cameraPosition, float, max, positionGeometry, select, smoothstep, varying, vec2, vec3 } from "three/tsl";
import type { GlowInstance } from "./glows";
import { nightRgb, type F, type Night } from "./night";

/*
 * Lamps: where each kind's lantern is on the models in `art/roadside` and `art/town-kit`, turned into glows, and the soft
 * pool of light each lays on the ground, one draw for all of them. A pool is a little grid draped on the terrain by the
 * clipmap's own heights in its vertex shader, so it can't cut into a slope. It's added, so it shows on the road at night
 * and melts away by day, and it lights nothing else.
 */

export type LampKind = "road" | "town" | "wall" | "harbour";

interface LampLook {
  /** The lantern, from the model's origin, along its reach: `art/roadside`'s arm, `art/town-kit`'s post. */
  headM: number;
  outM: number;
  token: string;
  haloM: number;
  poolM: number;
  poolLight: number;
  reachM: number;
}

export const LAMP_LOOKS: Record<LampKind, LampLook> = {
  road: { headM: 9.05, outM: 1.75, token: "lamp-road", haloM: 2.4, poolM: 15, poolLight: 0.2, reachM: 2400 },
  town: { headM: 4.65, outM: 0, token: "lamp-town", haloM: 1.4, poolM: 8, poolLight: 0.13, reachM: 1500 },
  wall: { headM: 2.6, outM: 0.58, token: "lamp-town", haloM: 0.8, poolM: 5, poolLight: 0.12, reachM: 500 },
  harbour: { headM: 6.5, outM: 0, token: "lamp-harbour", haloM: 2, poolM: 12, poolLight: 0.17, reachM: 4500 },
};

const POOL_CELLS = 5;
const POOL_LIFT_M = 0.42;
/** Gone by here: a pool is a thing seen on the road ahead, and the halo carries the lamp further off. */
const POOL_REACH_M = 700;
const LAMP_MIN_PIXELS = 3;
const POOL_FLOATS = 4;
/** A pool never drapes lower than this under its own post: where the ring's nodes are coarser than the road on them. */
const FOOT_BELOW_M = 0.3;
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

const headOf = ({ kind, x, y, z, yaw = 0 }: LampSpot) => {
  const look = LAMP_LOOKS[kind];
  return { x: x + Math.sin(yaw) * look.outM, y: y + look.headM, z: z + Math.cos(yaw) * look.outM };
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

/** The ground's height at a place, for a vertex shader: the clipmap's `groundAt`. Without one a pool lies flat at its lamp's foot. */
export type GroundAt = (place: Node<"vec2">) => F;

export function createLampPools(night: Night, spots: readonly LampSpot[], groundAt?: GroundAt) {
  const places = new Float32Array(spots.length * POOL_FLOATS);
  const tints = new Float32Array(spots.length * POOL_FLOATS);
  spots.forEach((spot, at) => {
    const look = LAMP_LOOKS[spot.kind];
    const head = headOf(spot);
    const { r, g, b } = nightRgb(look.token);
    places.set([head.x, spot.y, head.z, look.poolM], at * POOL_FLOATS);
    tints.set([r * look.poolLight, g * look.poolLight, b * look.poolLight, roll(spot.x, spot.z) * 0.8], at * POOL_FLOATS);
  });
  const geometry = gridGeometry();
  geometry.instanceCount = spots.length;
  geometry.setAttribute("poolPlace", new InstancedBufferAttribute(places, POOL_FLOATS));
  geometry.setAttribute("poolTint", new InstancedBufferAttribute(tints, POOL_FLOATS));

  const place = attribute<"vec4">("poolPlace", "vec4");
  const tint = attribute<"vec4">("poolTint", "vec4");
  const spot = vec2(place.x.add(positionGeometry.x.mul(place.w)), place.z.add(positionGeometry.z.mul(place.w)));
  const hour = smoothstep(tint.w.mul(0.6), tint.w.mul(0.6).add(0.4), night.lampsOn);
  const shown = float(1).sub(smoothstep(float(POOL_REACH_M * MIN_POOL_FADE), float(POOL_REACH_M), place.xyz.sub(cameraPosition).length())).mul(hour);
  const height = groundAt ? max(groundAt(spot), place.y.sub(FOOT_BELOW_M)) : place.y;

  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
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
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
