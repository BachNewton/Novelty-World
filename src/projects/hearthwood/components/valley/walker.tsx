"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { PerspectiveCamera, type Camera, type Object3D } from "three";
import type { World } from "../../engine/world";
import { GLIDE, glidingMover, standingMover, stepMover, type AirMode, type Mover } from "../../gameplay/airborne";
import { takeJump, takeTurn, type WalkState } from "../../input/use-walk-input";
import { moveInWorld, RUN_SPEED, walkSpeed } from "../../input/walk-controls";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { Focus } from "../../art/light/daylight";
import { broomSway, eyePosition, EYE_HEIGHT, fieldOfView, headBob, landingDip, lookDirection, RIDING_EYE, turnLook } from "./first-person-camera";
import { catchUp, clampOrbit, eyeFor, LOOK_HEIGHT, turnBetween, type Orbit } from "./follow-camera";
import type { Palette } from "../../art/palette";
import { Witch, type WitchHandle } from "../../art/witch";

/*
 * The walker and the camera: each frame, the input's move goes where the
 * camera looks and the land decides how far they get, on foot, in a hop or
 * on the broom (see gameplay's airborne). In first person the camera is
 * their eyes, they face where they look and only the broom is drawn; in
 * third person they turn to face their way and the camera follows behind.
 * A screenshot can instead look from above the whole valley, or from high
 * over its rim.
 */

export const WALKER_PRIORITY = -4;

export type CameraView = "walk" | "above" | "aerial";

/** Asked of the walker from outside, for screenshots: a jump, or a glide begun on the broom at a height above a spot. */
export type WalkerRequest = { kind: "jump" } | { kind: "glide"; x: number; z: number; above: number; heading: number };

export interface Walker {
  x: number;
  z: number;
  heading: number;
  stride: number;
  /** The third-person camera's orbit; its yaw is also the way they look in first person. */
  orbit: Orbit;
  /** How far up they look in first person, in radians from level. */
  lookPitch: number;
  view: CameraView;
  /** On the ground, in a hop, or on the broom, and how high their feet are: the scene's to say. */
  air?: { mode: AirMode; y: number };
  request?: WalkerRequest | null;
  /** Held where they are in the air, the camera still free to arrive: for a screenshot of a glide. */
  held?: boolean;
  /** The opening of the basket at their hip as it moves with them, for a hedgehog riding in it: the scene's to give. */
  basket?: Object3D | null;
}

/** How quickly they turn to face where they walk, and the camera keeps up, per second. */
const TURN_RATE = 9;
const FOLLOW_RATE = 12;
/** How quickly the broom comes out and is put away, and its wind rises and falls, per second. */
const RIDE_RATE = 7;
const WIND_RATE = 2.5;
/** Metres along the ground per step of their stride. */
const STRIDE_LENGTH = 0.75;

interface Followed {
  x: number;
  y: number;
  z: number;
  /** Their pace, eased: how far their hat lags behind it, and how much their head bobs. */
  easedPace: number;
  /** Seated on the broom, eased in and out, and its wind. */
  ride: number;
  wind: number;
  /** How fast the broom is turning, eased, radians a second. */
  turning: number;
  /** Seconds since they last landed, and how hard. */
  sinceLanding: number;
  impact: number;
  seconds: number;
}

interface Walking {
  world: World;
  input: WalkState;
  walker: Walker;
  focus: Focus;
}

/** The mover follows the walker wherever it was put from outside, and takes up any request. */
function moverFor(walker: Walker, mover: Mover, world: World): Mover {
  const request = walker.request;
  walker.request = null;
  if (request?.kind === "glide") {
    walker.x = request.x;
    walker.z = request.z;
    return glidingMover(world, request.x, request.z, request.above, request.heading);
  }
  if (walker.x !== mover.x || walker.z !== mover.z) return standingMover(world, walker.x, walker.z, walker.heading);
  return mover;
}

/** One frame of walking: the camera turned, the move taken as far as the land allows, their pose, and the camera after them. */
function stepWalker({ world, input, walker, focus }: Walking, figure: WitchHandle | null, camera: Camera, followed: Followed, motion: { mover: Mover }, seconds: number): void {
  const delta = Math.min(seconds, 0.1);
  const ground = world.surfaceAt;
  const pendingJump = walker.request?.kind === "jump";
  const mover = moverFor(walker, motion.mover, world);
  motion.mover = mover;

  const firstPerson = input.pointOfView === "first";
  const turn = takeTurn(input);
  if (firstPerson) {
    const look = turnLook({ yaw: walker.orbit.yaw, pitch: walker.lookPitch }, turn, input.turnRate, delta);
    walker.orbit = { ...walker.orbit, yaw: look.yaw };
    walker.lookPitch = look.pitch;
  } else {
    walker.orbit = clampOrbit({
      yaw: walker.orbit.yaw - turn.yaw - input.turnRate.yaw * delta,
      pitch: walker.orbit.pitch + turn.pitch + input.turnRate.pitch * delta,
      distance: walker.orbit.distance * turn.zoom,
    });
  }

  const speed = walkSpeed(input.move, input.running);
  const way = moveInWorld(input.move, walker.orbit.yaw);
  const push = Math.hypot(way.x, way.z);
  const velocity = speed > 0 && push > 0 ? { x: (way.x / push) * speed, z: (way.z / push) * speed } : { x: 0, z: 0 };
  const steer = firstPerson ? walker.orbit.yaw : push > 0 ? Math.atan2(way.x, way.z) : null;
  const before = { heading: mover.heading };
  const jump = takeJump(input) || pendingJump;
  const moverSeconds = walker.held === true ? 0 : delta;
  const result = stepMover(mover, { jump, velocity, facing: walker.heading, steer }, world, moverSeconds);
  walker.x = mover.x;
  walker.z = mover.z;
  if (mover.mode !== (walker.air?.mode ?? "ground")) input.reportAir(mover.mode);
  walker.air = { mode: mover.mode, y: mover.y };
  if (result.landed !== null) {
    followed.sinceLanding = 0;
    followed.impact = result.landed;
  } else {
    followed.sinceLanding += delta;
  }

  const onBroom = mover.mode === "broom";
  if (onBroom) walker.heading = mover.heading;
  else if (firstPerson) walker.heading = walker.orbit.yaw;
  else if (push > 0) walker.heading += turnBetween(walker.heading, Math.atan2(way.x, way.z)) * catchUp(TURN_RATE, delta);

  const moved = mover.mode === "ground" ? result.moved : 0;
  walker.stride += (moved / STRIDE_LENGTH) * Math.PI;
  const pace = delta > 0 && moved > 0 ? Math.min(1, moved / delta / RUN_SPEED + 0.35) : 0;
  const y = mover.y;
  focus.x = walker.x;
  focus.y = y;
  focus.z = walker.z;

  const k = catchUp(FOLLOW_RATE, delta);
  followed.x += (walker.x - followed.x) * k;
  followed.y += (y + LOOK_HEIGHT - followed.y) * k;
  followed.z += (walker.z - followed.z) * k;
  followed.easedPace += (pace - followed.easedPace) * catchUp(4, delta);
  followed.ride += ((onBroom ? 1 : 0) - followed.ride) * catchUp(RIDE_RATE, delta);
  const windNow = onBroom ? Math.min(1, Math.hypot(mover.vx, mover.vz) / GLIDE.speed) : 0;
  followed.wind += (windNow - followed.wind) * catchUp(WIND_RATE, delta);
  const turning = delta > 0 ? turnBetween(before.heading, mover.heading) / delta : 0;
  followed.turning += ((onBroom ? turning : 0) - followed.turning) * catchUp(4, delta);
  followed.seconds += delta;

  const throughTheirEyes = firstPerson && walker.view === "walk";
  if (camera instanceof PerspectiveCamera) {
    const fov = fieldOfView(throughTheirEyes ? "first" : "third", followed.wind);
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  const sway = broomSway(followed.seconds, followed.turning, followed.wind);
  walker.basket = figure?.basket ?? null;
  if (figure?.group) {
    figure.group.visible = !throughTheirEyes || followed.ride > 0.02;
    figure.group.position.set(walker.x, y - 0.03, walker.z);
    figure.group.rotation.y = walker.heading;
    figure.pose({
      stride: walker.stride,
      pace,
      hatLag: followed.easedPace,
      ride: followed.ride,
      wind: followed.wind,
      bank: sway.roll * followed.ride,
      rise: mover.mode === "air" ? mover.vy : 0,
      seconds: followed.seconds,
      throughTheirEyes,
    });
  }

  switch (walker.view) {
    case "walk": {
      if (firstPerson) {
        const height = EYE_HEIGHT + (RIDING_EYE.height - EYE_HEIGHT + sway.up) * followed.ride + landingDip(followed.sinceLanding, followed.impact);
        const back = RIDING_EYE.back * followed.ride;
        const left = RIDING_EYE.left * followed.ride;
        // Their left, facing along the heading from +z towards +x, is +x at heading 0.
        const feet = {
          x: walker.x - Math.sin(walker.heading) * back + Math.cos(walker.heading) * left,
          y: followed.y - LOOK_HEIGHT,
          z: walker.z - Math.cos(walker.heading) * back - Math.sin(walker.heading) * left,
        };
        const eye = eyePosition(feet, walker.orbit.yaw, headBob(walker.stride, followed.easedPace), height);
        const ahead = lookDirection({ yaw: walker.orbit.yaw, pitch: walker.lookPitch });
        camera.position.set(eye.x, eye.y, eye.z);
        camera.lookAt(eye.x + ahead.x, eye.y + ahead.y, eye.z + ahead.z);
        camera.rotateZ(sway.roll * followed.ride);
        return;
      }
      const eye = eyeFor(followed, walker.orbit, ground);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.lookAt(followed.x, followed.y, followed.z);
      return;
    }
    case "above":
      camera.position.set(0, 720, 0.01);
      camera.lookAt(0, 0, 0);
      return;
    case "aerial": {
      const angle = Math.atan2(world.camp.z, world.camp.x) + Math.PI * 0.85;
      camera.position.set(Math.cos(angle) * 300, 210, Math.sin(angle) * 300);
      camera.lookAt(world.camp.x * 0.5, 0, world.camp.z * 0.5);
    }
  }
}

export function WalkerAndCamera({ world, input, walker, focus, palette, atmosphere }: { world: World; input: RefObject<WalkState>; walker: Walker; focus: Focus; palette: Palette; atmosphere: AtmosphereUniforms }) {
  const witch = useRef<WitchHandle>(null);
  const followed = useRef<Followed>({
    x: walker.x,
    y: world.heightAt(walker.x, walker.z) + LOOK_HEIGHT,
    z: walker.z,
    easedPace: 0,
    ride: 0,
    wind: 0,
    turning: 0,
    sinceLanding: Infinity,
    impact: 0,
    seconds: 0,
  });
  const motion = useRef({ mover: standingMover(world, walker.x, walker.z, walker.heading) });

  useFrame(({ camera }, delta) => {
    stepWalker({ world, input: input.current, walker, focus }, witch.current, camera, followed.current, motion.current, delta);
  }, WALKER_PRIORITY);

  return <Witch ref={witch} palette={palette} atmosphere={atmosphere} />;
}
