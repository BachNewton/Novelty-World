import { readPad, subscribeGamepads, type PadSnapshot } from "@/shared/lib/gamepad";
import { nextInDirection, pickTarget, type Point, type ScreenPoint, type Target } from "./navigate";

/*
 * Every input method drives one focus cursor over a decision's choices, and
 * the camera, through the same few intents: move the focus, focus a choice,
 * commit one, orbit, zoom. Selecting and steering the camera never share a
 * gesture: a drag orbits and a tap selects, a stick moves the focus and the
 * other orbits, and keys are split the same way. This layer knows nothing of
 * what is drawn: the presentation tells it where the choices are on screen.
 */

export type InputKind = "mouse" | "keyboard" | "touch" | "pad";

/** Where the choices are on the screen right now, in CSS pixels from the
 *  element's top-left corner. */
export interface ChoiceLayout {
  /** Every choice, for moving the focus by direction. */
  points: ScreenPoint[];
  /** The choices a pointer can hit. */
  targets: Target[];
  focused: string | null;
}

export interface ControlHandlers {
  layout: () => ChoiceLayout;
  focus: (id: string) => void;
  /** Commits a choice a pointer picked. */
  commit: (id: string) => void;
  /** Commits whatever has the focus. */
  confirm: () => void;
  /** Turns the camera by these angles, in radians: round the vertical, and up. */
  orbit: (yaw: number, pitch: number) => void;
  /** Zooms by a factor: above 1 is closer. */
  zoom: (factor: number) => void;
  /** Swings the camera a quarter turn round. */
  turn: (step: 1 | -1) => void;
  /** The player has a hand on the camera (dragging, holding an orbit key or
   *  stick), so nothing else may move it. */
  controlling: (on: boolean) => void;
  usedInput: (kind: InputKind) => void;
}

/** A press that moves less than this is a tap or a click, not a drag. */
const TAP_SLOP = 10;
/** Pointer targets reach at least this far round a choice: a 48 px circle, a fingertip. */
const FINGER_REACH = 24;
const ORBIT_PER_PIXEL = 0.008;
const WHEEL_ZOOM = 0.0015;
const KEY_ZOOM = 1.25;
/** Radians a second at full tilt, or with an orbit key held. */
const ORBIT_SPEED = 2.2;
/** Zoom doubles in about this fraction of a second at a full trigger. */
const TRIGGER_ZOOM = 1.6;
/** The left stick moves the focus once per push: past `press`, and back inside `release` before the next. */
const STICK = { press: 0.6, release: 0.3 };

const UP: Point = { x: 0, y: -1 };
const DOWN: Point = { x: 0, y: 1 };
const LEFT: Point = { x: -1, y: 0 };
const RIGHT: Point = { x: 1, y: 0 };

const KEY_MOVES: Record<string, Point> = {
  ArrowUp: UP,
  KeyW: UP,
  ArrowDown: DOWN,
  KeyS: DOWN,
  ArrowLeft: LEFT,
  KeyA: LEFT,
  ArrowRight: RIGHT,
  KeyD: RIGHT,
};
const PAD_MOVES: Partial<Record<string, Point>> = { DpadUp: UP, DpadDown: DOWN, DpadLeft: LEFT, DpadRight: RIGHT };
const KEY_ORBITS: Record<string, number> = { KeyQ: -1, KeyE: 1 };

/** Keys typed into a form control are the control's own. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

interface Press {
  start: Point;
  last: Point;
  kind: InputKind;
}

/** Wires every input to `handlers`. Pointers are read on `element`; keys and
 *  controllers wherever the page has focus. Call `frame` once per animation
 *  frame for what is held (orbit keys, sticks, triggers). */
export function attachControls(element: HTMLElement, handlers: ControlHandlers): { frame: (delta: number) => void; dispose: () => void } {
  const presses = new Map<number, Press>();
  let dragging = false;
  let pinch: number | null = null;
  const keysHeld = new Set<string>();
  let pads: readonly PadSnapshot[] = [];
  let stickOut = false;
  let padCamera = false;
  let handsOn = false;

  const updateHands = () => {
    const now = dragging || keysHeld.size > 0 || padCamera;
    if (now !== handsOn) handlers.controlling(now);
    handsOn = now;
  };
  const move = (direction: Point) => {
    const { points, focused } = handlers.layout();
    const next = focused === null ? null : nextInDirection(points, focused, direction);
    if (next !== null) handlers.focus(next);
  };
  const local = (event: PointerEvent | WheelEvent): Point => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const kindOf = (event: PointerEvent): InputKind => (event.pointerType === "touch" ? "touch" : "mouse");

  /** A mouse clicks a choice to take it. A finger's first tap focuses one, to
   *  see its route and name before walking, and a tap on the focused choice
   *  takes it; with only one choice there is nothing to compare, so one tap does. */
  const tap = (point: Point, kind: InputKind) => {
    const { targets, points, focused } = handlers.layout();
    const id = pickTarget(targets, point, FINGER_REACH);
    if (id === null) return;
    if (kind === "mouse" || id === focused || points.length === 1) handlers.commit(id);
    else handlers.focus(id);
  };
  const hover = (point: Point) => {
    const { targets, focused } = handlers.layout();
    const id = pickTarget(targets, point, FINGER_REACH);
    if (id !== null && id !== focused) handlers.focus(id);
  };
  const spread = () => {
    const [a, b] = [...presses.values()];
    return Math.hypot(a.last.x - b.last.x, a.last.y - b.last.y);
  };

  const onPointerDown = (event: PointerEvent) => {
    element.setPointerCapture(event.pointerId);
    const point = local(event);
    presses.set(event.pointerId, { start: point, last: point, kind: kindOf(event) });
    handlers.usedInput(kindOf(event));
    if (presses.size === 2) {
      pinch = spread();
      dragging = true;
      updateHands();
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    const point = local(event);
    const press = presses.get(event.pointerId);
    if (!press) {
      if (event.pointerType === "mouse") {
        handlers.usedInput("mouse");
        hover(point);
      }
      return;
    }
    const from = press.last;
    press.last = point;
    if (pinch !== null && presses.size >= 2) {
      const now = spread();
      if (pinch > 0) handlers.zoom(now / pinch);
      pinch = now;
      return;
    }
    if (!dragging && Math.hypot(point.x - press.start.x, point.y - press.start.y) > TAP_SLOP) {
      dragging = true;
      updateHands();
    }
    if (dragging) handlers.orbit(-(point.x - from.x) * ORBIT_PER_PIXEL, (point.y - from.y) * ORBIT_PER_PIXEL);
  };
  const release = (event: PointerEvent, cancelled: boolean) => {
    const press = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    if (presses.size < 2) pinch = null;
    if (presses.size > 0) return;
    if (press && !dragging && !cancelled) tap(local(event), press.kind);
    dragging = false;
    updateHands();
  };
  const onPointerUp = (event: PointerEvent) => release(event, false);
  const onPointerCancel = (event: PointerEvent) => release(event, true);
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    handlers.usedInput("mouse");
    handlers.zoom(Math.exp(-event.deltaY * WHEEL_ZOOM));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = KEY_MOVES[event.code] as Point | undefined;
    const confirming = event.code === "Enter" || event.code === "Space" || event.code === "NumpadEnter";
    const zoom = event.key === "+" || event.key === "=" ? KEY_ZOOM : event.key === "-" || event.key === "_" ? 1 / KEY_ZOOM : null;
    // A focused button takes Enter and Space itself.
    if (confirming && event.target instanceof HTMLButtonElement) return;
    if (!direction && !confirming && zoom === null && !(event.code in KEY_ORBITS)) return;
    event.preventDefault();
    handlers.usedInput("keyboard");
    if (direction) move(direction);
    if (confirming && !event.repeat) handlers.confirm();
    if (zoom !== null) handlers.zoom(zoom);
    if (event.code in KEY_ORBITS) {
      keysHeld.add(event.code);
      updateHands();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keysHeld.delete(event.code);
    updateHands();
  };
  const onBlur = () => {
    keysHeld.clear();
    updateHands();
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);
  element.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  const unsubscribe = subscribeGamepads({
    onConnectionChange: (connected) => {
      pads = connected;
    },
    onFrame: (connected) => {
      pads = connected;
    },
    onButton: (edge) => {
      if (!edge.pressed || edge.name === null) return;
      handlers.usedInput("pad");
      const direction = PAD_MOVES[edge.name];
      if (direction) move(direction);
      if (edge.name === "A") handlers.confirm();
      if (edge.name === "LB") handlers.turn(-1);
      if (edge.name === "RB") handlers.turn(1);
    },
  });

  return {
    frame: (delta) => {
      let yaw = 0;
      for (const key of keysHeld) yaw += (KEY_ORBITS[key] ?? 0) * ORBIT_SPEED * delta;
      let pitch = 0;
      let zoom = 1;
      padCamera = false;
      const controls = pads.map((pad) => readPad(pad).controls).find((read) => read !== null);
      if (controls) {
        const { leftStick, rightStick, leftTrigger, rightTrigger } = controls;
        const tilt = Math.hypot(leftStick.x, leftStick.y);
        if (!stickOut && tilt > STICK.press) {
          stickOut = true;
          handlers.usedInput("pad");
          move(leftStick);
        } else if (stickOut && tilt < STICK.release) {
          stickOut = false;
        }
        yaw += rightStick.x * ORBIT_SPEED * delta;
        pitch -= rightStick.y * ORBIT_SPEED * delta;
        zoom = Math.exp((rightTrigger - leftTrigger) * TRIGGER_ZOOM * delta);
        padCamera = rightStick.x !== 0 || rightStick.y !== 0;
        if (padCamera || zoom !== 1) handlers.usedInput("pad");
      }
      updateHands();
      if (yaw !== 0 || pitch !== 0) handlers.orbit(yaw, pitch);
      if (zoom !== 1) handlers.zoom(zoom);
    },
    dispose: () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
      element.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      unsubscribe();
    },
  };
}
