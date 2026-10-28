import { readPad, subscribeGamepads, type PadSnapshot } from "@/shared/lib/gamepad";
import type { FlyInput } from "./flight";
import { FLY_BOOST, FLY_KEYS, FLY_SPEED, keyboardBoost, keyboardMove, keyboardRise, LOOK, PAD_FASTER, PAD_SLOWER, padRise, steppedSpeed, wheelSteps } from "./fly-controls";

/*
 * The free camera's input from the page: held keys, the mouse while the
 * pointer is locked (a click on the canvas locks it, Esc frees it), the
 * wheel for the speed, and a controller's sticks, triggers and bumpers.
 * The latest of each is kept as its events arrive and read once a frame.
 */

export interface FlyInputSource {
  /** This frame's input; the mouse's movement since the last read is used up. */
  read: () => FlyInput;
  /** The flying speed, in metres per second, before any boost. */
  speed: () => number;
  /** Whether the pointer is locked to the canvas, so the mouse looks. */
  locked: () => boolean;
  dispose: () => void;
}

export function flyInput(canvas: HTMLCanvasElement, onChange: () => void): FlyInputSource {
  const held = new Set<string>();
  const dragged = { x: 0, y: 0 };
  let speed: number = FLY_SPEED.start;
  let pads: readonly PadSnapshot[] = [];

  const keyDown = (event: KeyboardEvent) => {
    if (!FLY_KEYS.includes(event.code)) return;
    event.preventDefault();
    held.add(event.code);
  };
  const keyUp = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  const blur = () => {
    held.clear();
  };
  const mouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    dragged.x += event.movementX;
    dragged.y += event.movementY;
  };
  const click = () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    speed = steppedSpeed(speed, wheelSteps(event.deltaY));
    onChange();
  };
  const lockChange = () => {
    onChange();
  };

  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", blur);
  document.addEventListener("mousemove", mouseMove);
  document.addEventListener("pointerlockchange", lockChange);
  canvas.addEventListener("click", click);
  canvas.addEventListener("wheel", wheel, { passive: false });
  const unsubscribe = subscribeGamepads({
    onFrame: (now) => {
      pads = now;
    },
    onButton: (edge) => {
      if (!edge.pressed) return;
      if (edge.name === PAD_FASTER) speed = steppedSpeed(speed, 1);
      else if (edge.name === PAD_SLOWER) speed = steppedSpeed(speed, -1);
      else return;
      onChange();
    },
    onConnectionChange: (now) => {
      pads = now;
    },
  });

  return {
    read() {
      const move = keyboardMove(held);
      let rise = keyboardRise(held);
      let boost = keyboardBoost(held) ? FLY_BOOST : 1;
      const turnRate = { yaw: 0, pitch: 0 };
      for (const snapshot of pads) {
        const controls = readPad(snapshot).controls;
        if (!controls) continue;
        move.x += controls.leftStick.x;
        move.y -= controls.leftStick.y;
        rise += padRise(controls);
        turnRate.yaw += controls.rightStick.x * LOOK.stick;
        turnRate.pitch += controls.rightStick.y * LOOK.stick;
        boost = Math.max(boost, 1 + (FLY_BOOST - 1) * controls.rightTrigger);
      }
      const length = Math.hypot(move.x, move.y);
      if (length > 1) {
        move.x /= length;
        move.y /= length;
      }
      const turn = { yaw: dragged.x * LOOK.locked, pitch: dragged.y * LOOK.locked };
      dragged.x = 0;
      dragged.y = 0;
      return { move, rise: Math.max(-1, Math.min(1, rise)), speed: speed * boost, turn, turnRate };
    },
    speed: () => speed,
    locked: () => document.pointerLockElement === canvas,
    dispose() {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", mouseMove);
      document.removeEventListener("pointerlockchange", lockChange);
      canvas.removeEventListener("click", click);
      canvas.removeEventListener("wheel", wheel);
      unsubscribe();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
