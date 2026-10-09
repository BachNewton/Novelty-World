import { readPad, subscribeGamepads, type PadSnapshot, type StandardButton } from "@/shared/lib/gamepad";
import { classifyTwoFinger, isDrag, spanOf, tapAction, turnBetween, type Span, type TwoFingerGesture } from "./gestures";
import { pickTarget, type Point, type ScreenPoint, type Target } from "./navigate";

/*
 * Every input method drives a free camera over the house, and picks among a
 * decision's choices, through the same few intents. The camera pans across
 * the floor, orbits round the vertical, tilts, zooms and changes floor. There are
 * three input methods: a controller, touch, and a keyboard and mouse used
 * together. The selection is the mouse cursor, a finger's tap, or, for a
 * controller, a reticle at the screen's centre that the presentation keeps. This layer knows nothing of what is drawn: the presentation tells it
 * where the choices are on screen, and turns its screen-space intents into
 * camera moves.
 */

/** The three input methods: a keyboard and mouse are one, used together. */
export type InputKind = "keyboard-mouse" | "touch" | "pad";

/** Whether the screen-centre reticle is the selection: only for a controller. A mouse and a finger point instead. */
export function usesReticle(kind: InputKind): boolean {
  return kind === "pad";
}

/** Where the choices are on the screen right now, in CSS pixels from the
 *  element's top-left corner. */
export interface ChoiceLayout {
  /** Every choice in front of the camera, for jumping between them. */
  points: ScreenPoint[];
  /** The choices a pointer or the reticle can hit. */
  targets: Target[];
  focused: string | null;
}

export interface ControlHandlers {
  layout: () => ChoiceLayout;
  focus: (id: string) => void;
  /** Commits a choice a pointer picked. */
  commit: (id: string) => void;
  /** Commits the selection: the reticle's choice, or the focused one (the one under the mouse). */
  confirm: () => void;
  /** Backs out: clears the focus, or cancels a selection pending. */
  back: () => void;
  /** Jumps the selection to the next (1) or previous (-1) choice. */
  cycle: (step: 1 | -1) => void;
  /** Pans the view across the floor: along the screen's right and down, in
   *  lengths of the screen's short side. */
  pan: (right: number, down: number) => void;
  /** Drags the floor under one point of the element to another, in CSS pixels. */
  drag: (from: Point, to: Point) => void;
  /** Turns the camera round the vertical and tilts it up from the floor, in radians. */
  orbit: (yaw: number, pitch: number) => void;
  /** Zooms by a factor: above 1 is closer. */
  zoom: (factor: number) => void;
  /** Shows the floor above (1) or below (-1). */
  floor: (step: 1 | -1) => void;
  /** Brings the view back to the explorer whose turn it is. */
  recentre: () => void;
  /** The choice being turned before it is taken (the ghost of a room being
   *  placed), or null. While there is one, turning wins: Q and E, the
   *  bumpers and the d-pad's left and right turn it rather than orbiting the
   *  camera or jumping between choices, and a tap on it turns it (a click
   *  still takes it). The wheel always zooms: a control whose meaning
   *  changed with what lies under the cursor would confuse. */
  rotating: () => string | null;
  /** Turns that choice to its next way round: clockwise seen from above (1) or back (-1). */
  rotate: (step: 1 | -1) => void;
  /** The player has a hand on the camera (dragging, holding a pan or orbit
   *  key, a stick), so the game may not move it. */
  controlling: (on: boolean) => void;
  usedInput: (kind: InputKind) => void;
  /** Offered every pad button press first: true when the page took it (its
   *  own panel's buttons), so the house does nothing with it. */
  padButton?: (button: StandardButton) => boolean;
}

/** Pointer targets reach at least this far round a choice: a 48 px circle, a fingertip. */
const FINGER_REACH = 24;
const ORBIT_PER_PIXEL = 0.008;
const WHEEL_ZOOM = 0.0015;
const KEY_ZOOM = 1.25;
/** Radians a second at full tilt, or with an orbit or tilt key held. */
const ORBIT_SPEED = 2.2;
/** Lengths of the screen's short side a second, at full tilt or with a pan key held. */
const PAN_SPEED = 0.9;
/** Zoom doubles in about this fraction of a second at a full trigger. */
const TRIGGER_ZOOM = 1.6;

const PAN_KEYS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
};
const ORBIT_KEYS: Record<string, number> = { KeyQ: -1, KeyE: 1 };
/** While a choice is being turned, Q turns it back and E on. */
const ROTATE_KEYS: Record<string, 1 | -1> = { KeyQ: -1, KeyE: 1 };
/** T tilts the camera up towards top-down, G down towards eye level. */
const TILT_KEYS: Record<string, number> = { KeyT: 1, KeyG: -1 };
const FLOOR_KEYS: Record<string, 1 | -1> = { PageUp: 1, KeyR: 1, PageDown: -1, KeyF: -1 };
const RECENTRE_KEYS = new Set(["KeyC", "Home"]);
const CONFIRM_KEYS = new Set(["Enter", "NumpadEnter", "Space"]);

/** Keys typed into a form control are the control's own. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

interface Press {
  start: Point;
  last: Point;
  kind: "mouse" | "touch";
  /** A mouse's right or middle button orbits and tilts; anything else pans. */
  orbits: boolean;
}

/** Two fingers down: where they started, where they were last seen, and what they are doing. */
interface TwoFingers {
  start: Span;
  last: Span;
  gesture: TwoFingerGesture;
}

/** Wires every input to `handlers`. Pointers are read on `element`; keys and
 *  controllers wherever the page has focus. Call `frame` once per animation
 *  frame for what is held (pan and orbit keys, sticks, triggers). */
export function attachControls(element: HTMLElement, handlers: ControlHandlers): { frame: (delta: number) => void; dispose: () => void } {
  const presses = new Map<number, Press>();
  let dragging = false;
  /** Two fingers have touched since the last time none were down, so no tap ends it. */
  let multiTouch = false;
  let fingers: TwoFingers | null = null;
  const keysHeld = new Set<string>();
  let pads: readonly PadSnapshot[] = [];
  let padCamera = false;
  let handsOn = false;

  const updateHands = () => {
    const now = dragging || fingers !== null || keysHeld.size > 0 || padCamera;
    if (now !== handsOn) handlers.controlling(now);
    handsOn = now;
  };
  const local = (event: PointerEvent | WheelEvent): Point => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const kindOf = (event: PointerEvent): "mouse" | "touch" => (event.pointerType === "touch" ? "touch" : "mouse");

  const tap = (point: Point, kind: "mouse" | "touch") => {
    const { targets, points, focused } = handlers.layout();
    const id = pickTarget(targets, point, FINGER_REACH);
    if (id === null) return;
    if (kind === "touch" && id === handlers.rotating()) handlers.rotate(1);
    else if (tapAction(kind, id, focused, points.length) === "commit") handlers.commit(id);
    else handlers.focus(id);
  };
  const hover = (point: Point) => {
    const { targets, focused } = handlers.layout();
    const id = pickTarget(targets, point, FINGER_REACH);
    if (id !== null && id !== focused) handlers.focus(id);
  };
  const twoSpan = (): Span => {
    const [a, b] = [...presses.values()];
    return spanOf(a.last, b.last);
  };

  const onPointerDown = (event: PointerEvent) => {
    element.setPointerCapture(event.pointerId);
    const point = local(event);
    const kind = kindOf(event);
    presses.set(event.pointerId, { start: point, last: point, kind, orbits: kind === "mouse" && event.button !== 0 });
    handlers.usedInput(kind === "mouse" ? "keyboard-mouse" : "touch");
    if (presses.size === 2) {
      multiTouch = true;
      const span = twoSpan();
      fingers = { start: span, last: span, gesture: "pending" };
      updateHands();
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    const point = local(event);
    const press = presses.get(event.pointerId);
    if (!press) {
      if (event.pointerType === "mouse") {
        handlers.usedInput("keyboard-mouse");
        hover(point);
      }
      return;
    }
    const from = press.last;
    press.last = point;
    if (fingers) {
      const now = twoSpan();
      if (fingers.gesture === "pending") fingers.gesture = classifyTwoFinger(fingers.start, now);
      if (fingers.gesture === "pinch" && fingers.last.spread > 0) handlers.zoom(now.spread / fingers.last.spread);
      if (fingers.gesture === "twist") handlers.orbit(turnBetween(fingers.last.angle, now.angle), 0);
      if (fingers.gesture === "tilt") handlers.orbit(0, (now.middle.y - fingers.last.middle.y) * ORBIT_PER_PIXEL);
      // Until it decides, a gesture measures from where it started, so the movement that decided it still counts.
      if (fingers.gesture !== "pending") fingers.last = now;
      return;
    }
    if (!dragging && isDrag(press.start, point)) {
      dragging = true;
      updateHands();
    }
    if (!dragging) return;
    if (press.orbits) handlers.orbit(-(point.x - from.x) * ORBIT_PER_PIXEL, (point.y - from.y) * ORBIT_PER_PIXEL);
    else handlers.drag(from, point);
  };
  const release = (event: PointerEvent, cancelled: boolean) => {
    const press = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    if (presses.size < 2) fingers = null;
    if (presses.size === 0) {
      if (press && !dragging && !multiTouch && !cancelled && !press.orbits) tap(local(event), press.kind);
      dragging = false;
      multiTouch = false;
    }
    updateHands();
  };
  const onPointerUp = (event: PointerEvent) => release(event, false);
  const onPointerCancel = (event: PointerEvent) => release(event, true);
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    handlers.usedInput("keyboard-mouse");
    handlers.zoom(Math.exp(-event.deltaY * WHEEL_ZOOM));
  };
  // A right-button drag orbits, so the page's own menu stays shut over the house.
  const onContextMenu = (event: MouseEvent) => event.preventDefault();

  const onKeyDown = (event: KeyboardEvent) => {
    if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const { code } = event;
    const confirming = CONFIRM_KEYS.has(code);
    // A focused button takes Enter and Space itself.
    if (confirming && event.target instanceof HTMLButtonElement) return;
    const rotate = handlers.rotating() === null ? undefined : (ROTATE_KEYS[code] as 1 | -1 | undefined);
    const held = rotate === undefined && (code in PAN_KEYS || code in ORBIT_KEYS || code in TILT_KEYS);
    const zoom = event.key === "+" || event.key === "=" ? KEY_ZOOM : event.key === "-" || event.key === "_" ? 1 / KEY_ZOOM : null;
    const floor = FLOOR_KEYS[code] as 1 | -1 | undefined;
    const recentre = RECENTRE_KEYS.has(code);
    const cycle = code === "Tab";
    const back = code === "Escape";
    if (!held && rotate === undefined && !confirming && zoom === null && floor === undefined && !recentre && !cycle && !back) return;
    event.preventDefault();
    handlers.usedInput("keyboard-mouse");
    if (held) {
      keysHeld.add(code);
      updateHands();
    }
    if (zoom !== null) handlers.zoom(zoom);
    if (event.repeat) return;
    if (rotate !== undefined) handlers.rotate(rotate);
    if (confirming) handlers.confirm();
    if (floor !== undefined) handlers.floor(floor);
    if (recentre) handlers.recentre();
    if (cycle) handlers.cycle(event.shiftKey ? -1 : 1);
    if (back) handlers.back();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keysHeld.delete(event.code);
    updateHands();
  };
  const onBlur = () => {
    keysHeld.clear();
    updateHands();
  };

  /** A turning button turns the choice being turned, if there is one, and otherwise does `otherwise`. */
  const turnOr = (step: 1 | -1, otherwise?: () => void) => () => {
    if (handlers.rotating() !== null) handlers.rotate(step);
    else otherwise?.();
  };
  const PAD_BUTTONS: Partial<Record<StandardButton, () => void>> = {
    A: handlers.confirm,
    B: handlers.back,
    LB: turnOr(-1, () => handlers.cycle(-1)),
    RB: turnOr(1, () => handlers.cycle(1)),
    DpadLeft: turnOr(-1),
    DpadRight: turnOr(1),
    Y: handlers.recentre,
    RS: handlers.recentre,
    DpadUp: () => handlers.floor(1),
    DpadDown: () => handlers.floor(-1),
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("contextmenu", onContextMenu);
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
      if (handlers.padButton?.(edge.name)) return;
      PAD_BUTTONS[edge.name]?.();
    },
  });

  return {
    frame: (delta) => {
      let yaw = 0;
      let pitch = 0;
      const pan = { x: 0, y: 0 };
      for (const key of keysHeld) {
        yaw += (ORBIT_KEYS[key] ?? 0) * ORBIT_SPEED * delta;
        pitch += (TILT_KEYS[key] ?? 0) * ORBIT_SPEED * delta;
        const push = PAN_KEYS[key] as Point | undefined;
        if (push) {
          pan.x += push.x;
          pan.y += push.y;
        }
      }
      // Two keys at right angles pan no faster than one.
      const keyed = Math.hypot(pan.x, pan.y);
      if (keyed > 1) {
        pan.x /= keyed;
        pan.y /= keyed;
      }
      let zoom = 1;
      padCamera = false;
      const controls = pads.map((pad) => readPad(pad).controls).find((read) => read !== null);
      if (controls) {
        const { leftStick, rightStick, leftTrigger, rightTrigger } = controls;
        pan.x += leftStick.x;
        pan.y += leftStick.y;
        yaw += rightStick.x * ORBIT_SPEED * delta;
        // Up on the stick tilts up, towards top-down.
        pitch -= rightStick.y * ORBIT_SPEED * delta;
        zoom = Math.exp((rightTrigger - leftTrigger) * TRIGGER_ZOOM * delta);
        padCamera = leftStick.x !== 0 || leftStick.y !== 0 || rightStick.x !== 0 || rightStick.y !== 0 || zoom !== 1;
        if (padCamera) handlers.usedInput("pad");
      }
      updateHands();
      if (pan.x !== 0 || pan.y !== 0) handlers.pan(pan.x * PAN_SPEED * delta, pan.y * PAN_SPEED * delta);
      if (yaw !== 0 || pitch !== 0) handlers.orbit(yaw, pitch);
      if (zoom !== 1) handlers.zoom(zoom);
    },
    dispose: () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      unsubscribe();
    },
  };
}
