import { Vector3 } from "three/webgpu";
import { dot, float, Fn, If, max, positionWorld, smoothstep, uniform, vec3 } from "three/tsl";
import { createGlows, type GlowInstance } from "./glows";
import { nightColour, nightRgb, type Night, type V3 } from "./night";

/*
 * The player's headlights are a sum, not a light: `poolOn` is a few sums of a surface's own colour and where it is, for
 * the one function everything drawn already goes through, so the pool falls on road, verges, walls and trees alike for
 * no draw call and can't float or cut into anything.
 *
 * Other players' cars light the ground the same way, the nearest few of them, each a pool of its own in that one
 * function. Every car has its tail and head lamps as glows, each seen from its own side, one draw for the
 * whole fleet. The lit faces of the lamps are `art/cars`'s own `setLights`.
 */

const SPREAD = 0.52;
const SPREAD_SOFT = 0.3;
/** A dipped beam: lights the ground and the foot of what stands on it. */
const CUT_FROM_M = 0.7;
const CUT_TO_M = 2.6;
const FALL_M = 40;
const POOL_GAIN = 2.4;
const REACH_M = 110;
const UP = new Vector3(0, 1, 0);

/**
 * How many other cars' headlights light the ground, the nearest to the camera with their lamps on. A fixed number, so
 * every shader is built once and none is rebuilt as players come and go; the rest show their lamps as glows alone.
 */
export const OTHERS_LIT = 3;

/** Where a car's lamps are and the way it faces. */
export interface Beam {
  lamps: Vector3;
  forward: Vector3;
}

export interface Headlights {
  /** Added to a surface's lit colour before haze. `albedo` is the surface's colour by day. */
  poolOn: (albedo: V3) => V3;
  /** Each frame: where the player's lamps are, the way the car faces, and whether they're on. */
  update: (lamps: Vector3, forward: Vector3, on: boolean) => void;
  /** Each frame: the other cars whose lamps light the ground, nearest first, of which the first `OTHERS_LIT` do. */
  updateOthers: (beams: readonly Beam[]) => void;
}

function createPool(night: Night, head: V3) {
  const lamps = uniform(new Vector3());
  const forward = uniform(new Vector3(0, 0, -1));
  const right = uniform(new Vector3(1, 0, 0));
  const on = uniform(0);
  // Most of the time most beams are off, and a branch on a uniform is taken alike by every pixel, so an off beam costs
  // a pixel one comparison rather than the pool's sums.
  const poolOn = (albedo: V3): V3 =>
    Fn(() => {
      const lit = vec3(0).toVar();
      If(on.greaterThan(0), () => {
        const toPixel = positionWorld.sub(lamps);
        const along = dot(toPixel, forward);
        const across = dot(toPixel, right).abs().div(max(along.add(3), float(0.5)));
        const inBeam = float(1).sub(smoothstep(float(SPREAD - SPREAD_SOFT), float(SPREAD), across)).mul(smoothstep(float(0), float(4), along));
        const low = float(1).sub(smoothstep(float(CUT_FROM_M), float(CUT_TO_M), toPixel.y));
        const reach = along.div(FALL_M);
        const fall = float(1).div(float(1).add(reach.mul(reach))).mul(float(1).sub(smoothstep(float(REACH_M * 0.6), float(REACH_M), along)));
        lit.assign(albedo.mul(head).mul(inBeam.mul(low).mul(fall).mul(POOL_GAIN).mul(night.lampsOn)));
      });
      return lit;
    })();
  return {
    on,
    poolOn,
    set(place: Vector3, facingWay: Vector3, isOn: boolean) {
      lamps.value.copy(place);
      forward.value.copy(facingWay);
      right.value.crossVectors(facingWay, UP).normalize();
      on.value = isOn ? 1 : 0;
    },
  };
}

export function createHeadlights(night: Night): Headlights {
  const head = nightColour("head");
  const own = createPool(night, head);
  const others = Array.from({ length: OTHERS_LIT }, () => createPool(night, head));

  const poolOn = (albedo: V3): V3 => others.reduce((sum, other) => sum.add(other.poolOn(albedo)), own.poolOn(albedo));

  return {
    poolOn,
    update: own.set,
    updateOthers(beams) {
      others.forEach((other, index) => {
        const beam = index < beams.length ? beams[index] : null;
        if (beam) other.set(beam.lamps, beam.forward, true);
        else other.on.value = 0;
      });
    },
  };
}

const SEEN_DEG = 78;
const LAMPS_A_CAR = 4;
const TAIL_REACH_M = 1400;
const HEAD_REACH_M = 2400;

type Spot = readonly [x: number, y: number, z: number];

export interface CarAtNight {
  /** Where its lamps are, each pair left then right. */
  head: readonly [Spot, Spot];
  tail: readonly [Spot, Spot];
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
  const at = ([x, y, z]: Spot): Pick<GlowInstance, "x" | "y" | "z"> => ({ x, y, z });
  return {
    mesh: glows.mesh,
    dispose: glows.dispose,
    /** Writes this frame's cars. */
    update(cars: readonly CarAtNight[]) {
      const count = Math.min(cars.length, capacity);
      for (let index = 0; index < count; index++) {
        const car = cars[index];
        const towards = (Math.atan2(car.forwardX, -car.forwardZ) * 180) / Math.PI;
        const facing = (centre: number) => ({ fromDeg: (centre - SEEN_DEG + 720) % 360, toDeg: (centre + SEEN_DEG + 720) % 360 });
        const tailGlow = { sizeM: car.braking ? 1 : 0.6, minPixels: 2, colour: tail, brightness: car.braking ? 1 : 0.55, reachM: TAIL_REACH_M, rhythm: -1, periodS: 1, phase: 0, ...facing(towards) };
        const headGlow = { sizeM: 1.5, minPixels: 3, colour: head, brightness: 0.9, reachM: HEAD_REACH_M, rhythm: -1, periodS: 1, phase: 0, ...facing(towards + 180) };
        [0, 1].forEach((side) => {
          glows.set(index * LAMPS_A_CAR + side, { ...tailGlow, ...at(car.tail[side]) });
          glows.set(index * LAMPS_A_CAR + 2 + side, { ...headGlow, ...at(car.head[side]) });
        });
      }
      glows.upload(count * LAMPS_A_CAR);
    },
  };
}
