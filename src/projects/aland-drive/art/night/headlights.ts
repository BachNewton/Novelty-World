import { AdditiveBlending, ConeGeometry, Mesh, MeshBasicNodeMaterial, Vector3 } from "three/webgpu";
import { cameraPosition, dot, float, max, normalize, normalLocal, positionGeometry, positionWorld, smoothstep, uniform, varying, vec3 } from "three/tsl";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createGlows, type GlowInstance } from "./glows";
import { nightColour, nightRgb, type Night, type V3 } from "./night";

/*
 * The player's headlights are a sum, not a light: `poolOn` is a few sums of a surface's own colour and where it is, for
 * the one function everything drawn already goes through, so the pool falls on road, verges, walls and trees alike for
 * no draw call and can't float or cut into anything. The cone in the air is two thin shells, one draw.
 *
 * Other cars have only points: their tail and head lamps as glows, each seen from its own side, one draw for the whole
 * fleet. The lit faces of the lamps are `art/cars`'s own `setLights`.
 */

const SPREAD = 0.52;
const SPREAD_SOFT = 0.3;
/** A dipped beam: lights the ground and the foot of what stands on it. */
const CUT_FROM_M = 0.7;
const CUT_TO_M = 2.6;
const FALL_M = 26;
const POOL_GAIN = 2.4;
const REACH_M = 110;
const CONE_LONG_M = 15;
const CONE_WIDE_M = 3.2;
const CONE_SIDES = 8;
const CONE_LIGHT = 0.05;
const LAMP_APART_M = 0.62;
const UP = new Vector3(0, 1, 0);

export interface Headlights {
  /** Added to a surface's lit colour before haze. `albedo` is the surface's colour by day. */
  poolOn: (albedo: V3) => V3;
  cones: Mesh;
  /** Each frame: where the lamps are, the way the car faces, and whether they're on. */
  update: (lamps: Vector3, forward: Vector3, on: boolean) => void;
  dispose: () => void;
}

export function createHeadlights(night: Night): Headlights {
  const lamps = uniform(new Vector3());
  const forward = uniform(new Vector3(0, 0, -1));
  const right = uniform(new Vector3(1, 0, 0));
  const on = uniform(0);
  const head = nightColour("head");

  const poolOn = (albedo: V3): V3 => {
    const toPixel = positionWorld.sub(lamps);
    const along = dot(toPixel, forward);
    const across = dot(toPixel, right).abs().div(max(along.add(3), float(0.5)));
    const inBeam = float(1).sub(smoothstep(float(SPREAD - SPREAD_SOFT), float(SPREAD), across)).mul(smoothstep(float(0), float(4), along));
    const low = float(1).sub(smoothstep(float(CUT_FROM_M), float(CUT_TO_M), toPixel.y));
    const reach = along.div(FALL_M);
    const fall = float(1).div(float(1).add(reach.mul(reach))).mul(float(1).sub(smoothstep(float(REACH_M * 0.6), float(REACH_M), along)));
    return albedo.mul(head).mul(inBeam.mul(low).mul(fall).mul(POOL_GAIN).mul(on).mul(night.lampsOn));
  };

  const shell = (side: number) => {
    const cone = new ConeGeometry(CONE_WIDE_M, CONE_LONG_M, CONE_SIDES, 1, true);
    cone.translate(0, -CONE_LONG_M / 2, 0);
    cone.rotateX(-Math.PI / 2);
    cone.scale(1, 0.34, 1);
    cone.translate(side * LAMP_APART_M, 0, 0);
    return cone;
  };
  const geometry = mergeGeometries([shell(-1), shell(1)]);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: 2 });
  const local = positionGeometry;
  material.positionNode = lamps.add(right.mul(local.x)).add(vec3(0, local.y.sub(local.z.mul(0.03)), 0)).add(forward.mul(local.z));
  const out = varying(local.z.div(CONE_LONG_M).clamp(0, 1));
  const facing = dot(normalize(normalLocal), normalize(cameraPosition.sub(positionWorld))).abs();
  const fade = float(1).sub(out);
  material.colorNode = head.mul(fade.mul(fade).mul(facing.mul(facing)).mul(CONE_LIGHT).mul(on).mul(night.lampsOn));
  const cones = new Mesh(geometry, material);
  cones.frustumCulled = false;
  cones.renderOrder = 1011;

  return {
    poolOn,
    cones,
    update(place, facingWay, isOn) {
      lamps.value.copy(place);
      forward.value.copy(facingWay);
      right.value.crossVectors(facingWay, UP).normalize();
      on.value = isOn ? 1 : 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

const LAMP_SIDE_M = 0.68;
const TAIL_BACK_M = 2.1;
const TAIL_UP_M = 0.78;
const HEAD_FRONT_M = 2.05;
const HEAD_UP_M = 0.68;
const SEEN_DEG = 78;
const LAMPS_A_CAR = 4;
const TAIL_REACH_M = 1400;
const HEAD_REACH_M = 2400;

export interface CarAtNight {
  x: number;
  y: number;
  z: number;
  /** Which way it faces, a unit vector on the ground. */
  forwardX: number;
  forwardZ: number;
  braking: boolean;
}

/** Glows for a fleet: four lamps a car, written each frame for the cars in sight. */
export function createCarGlows(night: Night, capacity: number) {
  const glows = createGlows(night, [], [], capacity * LAMPS_A_CAR);
  const tail = nightRgb("tail");
  const head = nightRgb("head");
  const lamp = (car: CarAtNight, side: number, ahead: number, up: number): Pick<GlowInstance, "x" | "y" | "z"> => ({
    x: car.x + car.forwardX * ahead - car.forwardZ * side,
    y: car.y + up,
    z: car.z + car.forwardZ * ahead + car.forwardX * side,
  });
  return {
    mesh: glows.mesh,
    dispose: glows.dispose,
    /** Writes this frame's cars. */
    update(cars: readonly CarAtNight[]) {
      const count = Math.min(cars.length, capacity);
      for (let at = 0; at < count; at++) {
        const car = cars[at];
        const towards = (Math.atan2(car.forwardX, -car.forwardZ) * 180) / Math.PI;
        const facing = (centre: number) => ({ fromDeg: (centre - SEEN_DEG + 720) % 360, toDeg: (centre + SEEN_DEG + 720) % 360 });
        const tailGlow = { sizeM: car.braking ? 1 : 0.6, minPixels: 2, colour: tail, brightness: car.braking ? 1 : 0.55, reachM: TAIL_REACH_M, rhythm: -1, periodS: 1, phase: 0, ...facing(towards) };
        const headGlow = { sizeM: 1.5, minPixels: 3, colour: head, brightness: 0.9, reachM: HEAD_REACH_M, rhythm: -1, periodS: 1, phase: 0, ...facing(towards + 180) };
        [-1, 1].forEach((side, index) => {
          glows.set(at * LAMPS_A_CAR + index, { ...tailGlow, ...lamp(car, side * LAMP_SIDE_M, -TAIL_BACK_M, TAIL_UP_M) });
          glows.set(at * LAMPS_A_CAR + 2 + index, { ...headGlow, ...lamp(car, side * LAMP_SIDE_M, HEAD_FRONT_M, HEAD_UP_M) });
        });
      }
      glows.upload(count * LAMPS_A_CAR);
    },
  };
}
