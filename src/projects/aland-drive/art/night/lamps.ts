import { AdditiveBlending, Box3, Color, HalfFloatType, InstancedBufferAttribute, Mesh, MeshBasicNodeMaterial, OrthographicCamera, RenderTarget, Scene, Vector2, Vector3, type BufferGeometry, type WebGPURenderer } from "three/webgpu";
import { attribute, float, positionGeometry, positionWorld, smoothstep, texture, uniform, varying, vec3 } from "three/tsl";
import { quadGeometry, type GlowInstance } from "./glows";
import { PARTS } from "../roadside/mesh";
import { buildStreetLamp } from "../roadside/models";
import { TOWN_PARTS } from "../town-kit/paint";
import { buildTownLamp } from "../town-kit/lamps";
import { nightRgb, type Night, type V3 } from "./night";

/*
 * Lamps: each kind's glass on the models in `art/roadside` and `art/town-kit`, turned into glows, and the
 * light each casts on what's under it (`createLampLight`).
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

/** The lamps whose light is cast are those within this of the camera: past it a lamp is its glow. */
export const POOL_REACH_M = 700;
const LAMP_MIN_PIXELS = 3;
const POOL_FLOATS = 4;
/** The light image: its pixels across, the ground it covers, and the share of its half width its light fades over at the edge. */
const LIGHT_PIXELS = 1024;
const LIGHT_SPAN_M = 2 * POOL_REACH_M + 136;
const LIGHT_EDGE = 0.05;
const LIGHT_HEIGHT_M = 1000;
/** How strongly the lamps' light falls on a surface's own colour. */
const LIGHT_GAIN = 4;

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

/**
 * The light every lamp near the camera casts on what's under it, as an image seen from straight above that follows the
 * camera: each lamp's pool is drawn into it, brightest under the lamp and falling away, summed where pools meet. Every
 * colour drawn reads it (`lightOn`) and is lit by it, so a lit road stays its own grey with its paint, only brighter and
 * warmer, and a car, a wall or a tree under a lamp takes the same light. One small pass a frame while lamps are on.
 */
export function createLampLight(night: Night, capacity: number) {
  const places = new Float32Array(capacity * POOL_FLOATS);
  const tints = new Float32Array(capacity * POOL_FLOATS);
  const geometry = quadGeometry();
  geometry.instanceCount = 0;
  const placeAttribute = new InstancedBufferAttribute(places, POOL_FLOATS);
  const tintAttribute = new InstancedBufferAttribute(tints, POOL_FLOATS);
  geometry.setAttribute("poolPlace", placeAttribute);
  geometry.setAttribute("poolTint", tintAttribute);
  /** The lamps whose light is cast: those near the camera, each time that list changes. */
  const set = (spots: readonly LampSpot[]) => {
    if (spots.length > capacity) throw new Error(`${spots.length} lamp pools, and room for ${capacity}`);
    spots.forEach((spot, at) => {
      const look = LAMP_LOOKS[spot.kind];
      const head = headOf(spot);
      const { r, g, b } = nightRgb(look.token);
      places.set([head.x, 0, head.z, look.poolM], at * POOL_FLOATS);
      tints.set([r * look.poolLight, g * look.poolLight, b * look.poolLight, roll(spot.x, spot.z) * 0.8], at * POOL_FLOATS);
    });
    geometry.instanceCount = spots.length;
    placeAttribute.needsUpdate = true;
    tintAttribute.needsUpdate = true;
  };

  const place = attribute<"vec4">("poolPlace", "vec4");
  const tint = attribute<"vec4">("poolTint", "vec4");
  const hour = smoothstep(tint.w.mul(0.6), tint.w.mul(0.6).add(0.4), night.lampsOn);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: AdditiveBlending, side: 2 });
  material.positionNode = vec3(place.x.add(positionGeometry.x.mul(place.w)), 0, place.z.sub(positionGeometry.y.mul(place.w)));
  const fromCentre = varying(positionGeometry.xy).length();
  const pool = float(1).sub(fromCentre.mul(fromCentre)).max(0);
  material.colorNode = varying(tint.xyz.mul(hour)).mul(pool.mul(pool));
  const pools = new Mesh(geometry, material);
  pools.frustumCulled = false;
  const lightScene = new Scene();
  lightScene.add(pools);

  const half = LIGHT_SPAN_M / 2;
  const target = new RenderTarget(LIGHT_PIXELS, LIGHT_PIXELS, { type: HalfFloatType });
  // Looking straight down with north up the image, so its rows run with the scene's z.
  const above = new OrthographicCamera(-half, half, half, -half, 1, LIGHT_HEIGHT_M * 2);
  above.up.set(0, 0, -1);
  const centre = uniform(new Vector2());
  const cleared = new Color();
  const step = LIGHT_SPAN_M / LIGHT_PIXELS;

  /** A surface's light from the lamps, for its colour by day: added to its lit colour before haze. */
  const lightOn = (albedo: V3): V3 => {
    const at = positionWorld.xz.sub(centre).div(LIGHT_SPAN_M);
    const inside = float(1).sub(smoothstep(float(0.5 - LIGHT_EDGE), float(0.5), at.x.abs().max(at.y.abs())));
    const cast = texture(target.texture, at.add(0.5)).rgb;
    return albedo.mul(cast).mul(inside.mul(night.lampsOn).mul(LIGHT_GAIN));
  };

  return {
    set,
    lightOn,
    /** Before drawing, while lamps are on: the image follows the camera, a whole pixel at a time so it doesn't swim. */
    cast(renderer: WebGPURenderer, camera: { x: number; z: number }) {
      const [x, z] = [Math.round(camera.x / step) * step, Math.round(camera.z / step) * step];
      centre.value.set(x, z);
      above.position.set(x, LIGHT_HEIGHT_M, z);
      above.lookAt(x, 0, z);
      above.updateMatrixWorld();
      const alpha = renderer.getClearAlpha();
      renderer.getClearColor(cleared);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(target);
      renderer.render(lightScene, above);
      renderer.setRenderTarget(null);
      renderer.setClearColor(cleared, alpha);
    },
    compile: (renderer: WebGPURenderer) => renderer.compileAsync(lightScene, above),
    dispose() {
      geometry.dispose();
      material.dispose();
      target.dispose();
    },
  };
}
