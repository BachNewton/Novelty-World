import { BufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, Vector3, type Node, type Scene } from "three/webgpu";
import { cameraPosition, cameraProjectionMatrix, cameraViewMatrix, cross, float, instanceIndex, max, mod, normalize, positionGeometry, sin, smoothstep, uv, varying, vec3, vec4 } from "three/tsl";
import { sharedUniform } from "../art/shared-uniform";
import { outsideCar } from "../art/car-volume";
import { seedOf, unitOf } from "../art/hash";
import type { Weather } from "../climate/weather";
import { TRUE_NORTH_GRID_DEG } from "../time/sky-places";

/*
 * Rain and falling snow round the camera. Each is one instanced quad in one draw call: a fixed lattice of drops fills a
 * box that repeats through the world, so a drop stays where it is in the world (the car drives through them) and the box
 * the camera stands in is always full. Nothing moves on the CPU but one offset, the fall and the wind over the frame,
 * and how hard it rains is how many of the lattice's drops are drawn, so a shower thickens drop by drop.
 *
 * Rain is a thin streak along its fall, slanted by the wind; snow a soft flake facing the eye, drifting on the wind and
 * swaying as it falls. Both fade at the box's walls, so nothing pops where it wraps, and near the eye, and neither is
 * drawn inside the player's car. Cost is overdraw, so a drop is never wider than a few pixels.
 */

/** The box round the camera that the lattice repeats in, in metres: wide, so the far drops thin out into the haze rather than end. */
const BOX = new Vector3(44, 22, 44);
/** The most of each drawn, in a full downpour or the heaviest snow. */
const MOST = { rain: 9000, snow: 12000 } as const;
const RAIN_FALL_MS = 9;
const SNOW_FALL_MS = 1.1;
/** The share of the wind's speed each takes sideways: snow drifts with it, rain is heavier. */
const WIND_TAKEN = { rain: 0.6, snow: 0.9 } as const;
/** How long a rain streak is: the drop's travel over a camera's shutter. */
const STREAK_S = 0.05;
/** How wide a streak or a flake is, at least, a share of its distance from the eye: about a pixel at the floor's screen. */
const LEAST_WIDTH_PER_M = 0.0012;
const RAIN_WIDTH_M = 0.009;
const FLAKE_M = 0.08;
/** Nothing is drawn nearer the eye than the first, fading in to the second: a streak by the lens would cross the screen. */
const NEAR_M = { rain: [1.5, 5], snow: [0.6, 1.6] } as const;
const SWAY_M = 0.35;

export interface PrecipitationLook {
  /** Rain's and snow's colours, as linear RGB, before the hour's light. */
  rain: Vector3;
  snow: Vector3;
  /** The world's light and haze at this hour, which every colour drawn goes through. */
  hazed: (colour: Node<"vec3">) => Node<"vec3">;
}

function fall(kind: "rain" | "snow", colour: Vector3, hazed: PrecipitationLook["hazed"]) {
  const offset = sharedUniform(new Vector3());
  const velocity = sharedUniform(new Vector3(0, -1, 0));
  const clock = sharedUniform(0);
  const box = vec3(BOX.x, BOX.y, BOX.z);

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(Float32Array.from([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setAttribute("uv", new BufferAttribute(Float32Array.from([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.instanceCount = 0;

  const seed = seedOf(float(instanceIndex));
  const spot = vec3(unitOf(seed, 1), unitOf(seed, 2), unitOf(seed, 3));
  const sway = kind === "snow" ? vec3(sin(clock.mul(unitOf(seed, 4).add(0.6)).add(unitOf(seed, 5).mul(6.28))), 0, sin(clock.mul(unitOf(seed, 6).add(0.5)).add(unitOf(seed, 7).mul(6.28)))).mul(SWAY_M) : vec3(0, 0, 0);
  // The lattice's drop nearest the eye: the box repeats through the world, so the camera always stands in a full one.
  const fromEye = mod(spot.mul(box).add(offset).add(sway).sub(cameraPosition).add(box.mul(0.5)), box).sub(box.mul(0.5));
  const centre = cameraPosition.add(fromEye);
  const edge = max(max(fromEye.x.abs().div(BOX.x / 2), fromEye.z.abs().div(BOX.z / 2)), fromEye.y.abs().div(BOX.y / 2));
  const depth = fromEye.length();
  const seen = varying(float(1).sub(smoothstep(float(0.75), float(1), edge)).mul(smoothstep(float(NEAR_M[kind][0]), float(NEAR_M[kind][1]), depth)));
  const least = depth.mul(LEAST_WIDTH_PER_M);

  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  material.name = "precipitation";
  let corner: Node<"vec3">;
  if (kind === "rain") {
    const along = normalize(velocity);
    const side = normalize(cross(along, fromEye.negate()));
    const halfLength = velocity.length().mul(STREAK_S / 2);
    corner = centre.add(side.mul(positionGeometry.x.mul(max(float(RAIN_WIDTH_M), least)))).add(along.mul(positionGeometry.y.mul(halfLength)));
    material.vertexNode = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(corner, 1)));
    const across = uv().x.mul(2).sub(1);
    material.opacityNode = float(1).sub(across.mul(across)).mul(seen).mul(0.32);
  } else {
    const inView = cameraViewMatrix.mul(vec4(centre, 1));
    const size = max(float(FLAKE_M).mul(unitOf(seed, 8).mul(0.6).add(0.7)), least.mul(1.5));
    const placed = vec4(inView.xy.add(positionGeometry.xy.mul(size.mul(0.5))), inView.z, 1);
    material.vertexNode = cameraProjectionMatrix.mul(placed);
    corner = centre;
    const round = uv().mul(2).sub(1).length();
    const soft = float(1).sub(round.mul(round)).max(0);
    material.opacityNode = soft.mul(seen).mul(0.9);
  }
  material.colorNode = hazed(vec3(colour.x, colour.y, colour.z));
  material.maskNode = outsideCar(corner);

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;

  const wrap = (value: number, size: number) => value - Math.floor(value / size) * size;
  return {
    mesh,
    /** Each frame: how hard it falls (0 to 1), the wind it falls through as a vector in the scene, and the seconds the game moved. */
    update(amount: number, wind: Vector3, seconds: number, shown: boolean) {
      const fallMS = kind === "rain" ? RAIN_FALL_MS : SNOW_FALL_MS;
      velocity.value.set(wind.x * WIND_TAKEN[kind], -fallMS, wind.z * WIND_TAKEN[kind]);
      const moved = offset.value.addScaledVector(velocity.value, seconds);
      moved.set(wrap(moved.x, BOX.x), wrap(moved.y, BOX.y), wrap(moved.z, BOX.z));
      clock.value = (clock.value + seconds) % 3600;
      geometry.instanceCount = Math.round(MOST[kind] * Math.min(1, Math.max(0, amount)));
      mesh.visible = shown && geometry.instanceCount > 0;
    },
    /** Draws a few, whatever the weather, so the pipeline is built before the drive rather than at the first drop. */
    showAll(on: boolean) {
      mesh.visible = on;
      if (on) geometry.instanceCount = Math.max(1, geometry.instanceCount);
    },
    drawn: () => (mesh.visible ? geometry.instanceCount : 0),
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createPrecipitation(scene: Scene, look: PrecipitationLook) {
  const rain = fall("rain", look.rain, look.hazed);
  const snow = fall("snow", look.snow, look.hazed);
  scene.add(rain.mesh, snow.mesh);
  const wind = new Vector3();
  return {
    /** Each frame: the weather drawn (none on a tool's page), the seconds the game moved, and whether the eye is down among it rather than lifted to the map. */
    update(weather: Weather | null, seconds: number, shown: boolean) {
      if (weather !== null) {
        // Blowing towards the opposite of where it comes from, turned from true north to the grid's.
        const toward = ((weather.windFromDeg + 180 + TRUE_NORTH_GRID_DEG) * Math.PI) / 180;
        wind.set(Math.sin(toward), 0, -Math.cos(toward)).multiplyScalar(weather.windMS);
      }
      rain.update(weather?.rain ?? 0, wind, seconds, shown);
      snow.update(weather?.snowfall ?? 0, wind, seconds, shown);
    },
    showAll(on: boolean) {
      rain.showAll(on);
      snow.showAll(on);
    },
    /** How many drops and flakes are drawn now. */
    counts: () => ({ rain: rain.drawn(), snow: snow.drawn() }),
    dispose() {
      scene.remove(rain.mesh, snow.mesh);
      rain.dispose();
      snow.dispose();
    },
  };
}
