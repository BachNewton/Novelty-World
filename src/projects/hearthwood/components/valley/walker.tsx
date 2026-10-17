"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Camera } from "three";
import { sample } from "../../world/grid";
import type { Valley } from "../../world/valley";
import { walk } from "../../world/walking";
import { takeTurn, type WalkState } from "../../input/use-walk-input";
import { moveInWorld, RUN_SPEED, walkSpeed } from "../../input/walk-controls";
import type { AtmosphereUniforms } from "./atmosphere";
import type { Focus } from "./daylight";
import { catchUp, clampOrbit, eyeFor, LOOK_HEIGHT, turnBetween, type Orbit } from "./follow-camera";
import type { Palette } from "./palette";
import { Witch, type WitchHandle } from "./witch";

/*
 * The walker and the camera behind her: each frame, the input's move goes
 * where the camera looks, the land decides how far she gets, she turns to
 * face her way, and the camera follows. A screenshot can instead look from
 * above the whole valley, or from high over its rim.
 */

export const WALKER_PRIORITY = -4;

export type CameraView = "walk" | "above" | "aerial";

export interface Walker {
  x: number;
  z: number;
  heading: number;
  stride: number;
  orbit: Orbit;
  view: CameraView;
}

/** How quickly she turns to face where she walks, and the camera keeps up, per second. */
const TURN_RATE = 9;
const FOLLOW_RATE = 12;
/** Metres along the ground per step of her stride. */
const STRIDE_LENGTH = 0.75;

interface Followed {
  x: number;
  y: number;
  z: number;
  /** How far her hat lags behind her pace. */
  hatLag: number;
}

interface Walking {
  valley: Valley;
  input: WalkState;
  walker: Walker;
  focus: Focus;
}

/** One frame of walking: the camera turned, the move taken as far as the land allows, her pose, and the camera after her. */
function stepWalker({ valley, input, walker, focus }: Walking, figure: WitchHandle | null, camera: Camera, followed: Followed, seconds: number): void {
  const delta = Math.min(seconds, 0.1);
  const ground = (x: number, z: number) => Math.max(sample(valley.heights, x, z), -0.2);

  const turn = takeTurn(input);
  walker.orbit = clampOrbit({
    yaw: walker.orbit.yaw - turn.yaw - input.turnRate.yaw * delta,
    pitch: walker.orbit.pitch + turn.pitch + input.turnRate.pitch * delta,
    distance: walker.orbit.distance * turn.zoom,
  });

  const speed = walkSpeed(input.move, input.running);
  const way = moveInWorld(input.move, walker.orbit.yaw);
  const push = Math.hypot(way.x, way.z);
  let moved = 0;
  if (speed > 0 && push > 0) {
    const step = (speed * delta) / push;
    const from = { x: walker.x, z: walker.z };
    const to = walk(valley.heights, from, way.x * step, way.z * step);
    moved = Math.hypot(to.x - from.x, to.z - from.z);
    walker.x = to.x;
    walker.z = to.z;
    walker.heading += turnBetween(walker.heading, Math.atan2(way.x, way.z)) * catchUp(TURN_RATE, delta);
  }
  walker.stride += (moved / STRIDE_LENGTH) * Math.PI;
  const pace = delta > 0 && moved > 0 ? Math.min(1, moved / delta / RUN_SPEED + 0.35) : 0;
  const y = sample(valley.heights, walker.x, walker.z);
  focus.x = walker.x;
  focus.y = y;
  focus.z = walker.z;

  const k = catchUp(FOLLOW_RATE, delta);
  followed.x += (walker.x - followed.x) * k;
  followed.y += (y + LOOK_HEIGHT - followed.y) * k;
  followed.z += (walker.z - followed.z) * k;
  followed.hatLag += (pace - followed.hatLag) * catchUp(4, delta);

  if (figure?.group) {
    figure.group.position.set(walker.x, y - 0.03, walker.z);
    figure.group.rotation.y = walker.heading;
    figure.pose(walker.stride, pace, followed.hatLag);
  }

  switch (walker.view) {
    case "walk": {
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
      const angle = Math.atan2(valley.camp.z, valley.camp.x) + Math.PI * 0.85;
      camera.position.set(Math.cos(angle) * 300, 210, Math.sin(angle) * 300);
      camera.lookAt(valley.camp.x * 0.5, 0, valley.camp.z * 0.5);
    }
  }
}

export function WalkerAndCamera({ valley, input, walker, focus, palette, atmosphere }: { valley: Valley; input: RefObject<WalkState>; walker: Walker; focus: Focus; palette: Palette; atmosphere: AtmosphereUniforms }) {
  const witch = useRef<WitchHandle>(null);
  const followed = useRef<Followed>({ x: walker.x, y: 0, z: walker.z, hatLag: 0 });

  useFrame(({ camera }, delta) => {
    stepWalker({ valley, input: input.current, walker, focus }, witch.current, camera, followed.current, delta);
  }, WALKER_PRIORITY);

  return <Witch ref={witch} palette={palette} atmosphere={atmosphere} />;
}
