import type { FrogAction } from "../run";

// The touch gesture recogniser: pure, fed pointer samples (position in CSS
// pixels) and returning the actions they make. Every finger is its own gesture, so one thumb can drag
// while the other taps; each gesture is a tap or a drag, never both.
//
// A drag moves the frog a step per stride of finger travel, sideways a lane
// and up or down a jump, like mobile Tetris: a fast drag makes several steps
// at once, and dragging back takes them back. A drag locks to the axis it
// first leaves the tap slop along, so a sideways drag's drift up or down
// never jumps the frog, and a jump's drift never slides it.

// Which third of the play area a finger came down in.
export type TouchZone = "left" | "centre" | "right";

export interface GestureTuning {
  // How far a finger may wander and still tap, in CSS pixels.
  tapSlop: number;
  // Sideways finger travel per lane of movement, in CSS pixels.
  laneStep: number;
  // Finger travel up or down per jump, in CSS pixels.
  jumpStep: number;
}

// Sized for a 360px-wide phone: a lane per 32px puts the whole corridor
// within one thumb's sweep, and a jump per 32px makes a dozen jumps in one
// sweep up the screen.
export const GESTURE_TUNING: GestureTuning = {
  tapSlop: 12,
  laneStep: 32,
  jumpStep: 32,
};

export interface PointerSample {
  id: number;
  x: number;
  y: number;
}

type Phase =
  // Still within the tap slop: it may yet be a tap or a drag.
  | { kind: "pending" }
  // A drag along one axis, and how many steps it has made along it so far,
  // positive right or forward (up the screen).
  | { kind: "slide"; steps: number }
  | { kind: "jump"; steps: number };

interface Finger {
  zone: TouchZone;
  startX: number;
  startY: number;
  phase: Phase;
}

export interface GestureState {
  fingers: ReadonlyMap<number, Finger>;
}

export interface GestureStep {
  state: GestureState;
  actions: FrogAction[];
}

export const NO_GESTURES: GestureState = { fingers: new Map() };

export function zoneAt(x: number, width: number): TouchZone {
  if (x < width / 3) return "left";
  if (x > (width * 2) / 3) return "right";
  return "centre";
}

// A tap rotates in the side thirds and hops in the centre.
const TAP_ACTIONS: Record<TouchZone, FrogAction> = {
  left: "rotateCcw",
  centre: "hop",
  right: "rotateCw",
};

function withFinger(state: GestureState, id: number, finger: Finger | null): GestureState {
  const fingers = new Map(state.fingers);
  if (finger === null) fingers.delete(id);
  else fingers.set(id, finger);
  return { fingers };
}

export function pointerDown(state: GestureState, sample: PointerSample, width: number): GestureStep {
  if (state.fingers.has(sample.id)) {
    throw new Error(`Pointer ${String(sample.id)} came down twice without lifting`);
  }
  const finger: Finger = { zone: zoneAt(sample.x, width), startX: sample.x, startY: sample.y, phase: { kind: "pending" } };
  return { state: withFinger(state, sample.id, finger), actions: [] };
}

// The steps from `from` to `to` along an axis, as actions.
function steps(from: number, to: number, [back, ahead]: readonly [FrogAction, FrogAction]): FrogAction[] {
  return Array.from({ length: Math.abs(to - from) }, () => (to > from ? ahead : back));
}

// One finger's movement to a new sample.
function track(finger: Finger, sample: PointerSample, tuning: GestureTuning): { finger: Finger; actions: FrogAction[] } {
  const dx = sample.x - finger.startX;
  // Up the screen is forward.
  const dy = finger.startY - sample.y;
  let phase = finger.phase;
  if (phase.kind === "pending") {
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= tuning.tapSlop) return { finger, actions: [] };
    phase = Math.abs(dx) >= Math.abs(dy) ? { kind: "slide", steps: 0 } : { kind: "jump", steps: 0 };
  }
  if (phase.kind === "slide") {
    const lanes = Math.trunc(dx / tuning.laneStep);
    return { finger: { ...finger, phase: { kind: "slide", steps: lanes } }, actions: steps(phase.steps, lanes, ["left", "right"]) };
  }
  const jumps = Math.trunc(dy / tuning.jumpStep);
  return { finger: { ...finger, phase: { kind: "jump", steps: jumps } }, actions: steps(phase.steps, jumps, ["back", "forward"]) };
}

export function pointerMove(state: GestureState, sample: PointerSample, tuning = GESTURE_TUNING): GestureStep {
  const finger = state.fingers.get(sample.id);
  if (finger === undefined) return { state, actions: [] };
  const tracked = track(finger, sample, tuning);
  return { state: withFinger(state, sample.id, tracked.finger), actions: tracked.actions };
}

// A finger lifting: a tap if it never left the tap slop, which can only be
// known once it lifts, so a tap acts on the lift.
export function pointerUp(state: GestureState, sample: PointerSample, tuning = GESTURE_TUNING): GestureStep {
  const finger = state.fingers.get(sample.id);
  if (finger === undefined) return { state, actions: [] };
  const tracked = track(finger, sample, tuning);
  const released = withFinger(state, sample.id, null);
  if (tracked.finger.phase.kind === "pending") return { state: released, actions: [TAP_ACTIONS[finger.zone]] };
  return { state: released, actions: tracked.actions };
}

// The browser took the finger away (a system gesture, or lost capture): it
// never taps, and the steps it made stand.
export function pointerCancel(state: GestureState, id: number): GestureStep {
  if (!state.fingers.has(id)) return { state, actions: [] };
  return { state: withFinger(state, id, null), actions: [] };
}
