import type { PerspectiveCamera } from "three/webgpu";

/*
 * A free camera for looking round the data: WASD to move, Q and E to sink and
 * rise, Shift to go faster, drag to look, the wheel to set the speed.
 */

const START_SPEED_M_S = 60;
const SPEED_STEP = 1.25;
const MIN_SPEED_M_S = 2;
const MAX_SPEED_M_S = 2000;
const BOOST = 5;
const LOOK_RADIANS_PER_PIXEL = 0.003;
const WHEEL_NOTCH = 100;
const LONGEST_FRAME_S = 0.1;

export interface View {
  x: number;
  y: number;
  z: number;
  /** Radians anticlockwise from looking along -z (north). */
  yaw: number;
  pitch: number;
}

export function startFreeCamera(camera: PerspectiveCamera, element: HTMLElement, start: View) {
  const view = { ...start };
  const held = new Set<string>();
  let speed = START_SPEED_M_S;
  let dragging = false;
  let last: number | null = null;

  const apply = () => {
    camera.position.set(view.x, view.y, view.z);
    camera.rotation.set(view.pitch, view.yaw, 0, "YXZ");
  };

  const onKeyDown = (event: KeyboardEvent) => held.add(event.code);
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const onBlur = () => held.clear();
  const onPointerDown = (event: PointerEvent) => {
    dragging = true;
    element.setPointerCapture(event.pointerId);
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    view.yaw -= event.movementX * LOOK_RADIANS_PER_PIXEL;
    view.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, view.pitch - event.movementY * LOOK_RADIANS_PER_PIXEL));
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    speed = Math.max(MIN_SPEED_M_S, Math.min(MAX_SPEED_M_S, speed * SPEED_STEP ** (-event.deltaY / WHEEL_NOTCH)));
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("wheel", onWheel, { passive: false });
  apply();

  const axis = (minus: string, plus: string) => (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);

  return {
    update(now: number) {
      const seconds = Math.min(last === null ? 0 : (now - last) / 1000, LONGEST_FRAME_S);
      last = now;
      const ahead = axis("KeyS", "KeyW");
      const right = axis("KeyA", "KeyD");
      const step = speed * (held.has("ShiftLeft") || held.has("ShiftRight") ? BOOST : 1) * seconds;
      const flat = Math.cos(view.pitch);
      view.x += step * (ahead * -Math.sin(view.yaw) * flat + right * Math.cos(view.yaw));
      view.y += step * (ahead * Math.sin(view.pitch) + axis("KeyQ", "KeyE"));
      view.z += step * (ahead * -Math.cos(view.yaw) * flat - right * Math.sin(view.yaw));
      apply();
    },
    set(next: View) {
      Object.assign(view, next);
      apply();
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("wheel", onWheel);
    },
  };
}
