import type { FrogAction } from "./run";

// The touch gesture recogniser: pure, fed pointer samples (position in CSS
// pixels, time in milliseconds on the events' own clock) and returning the
// commands they make. Every finger is its own gesture, so one thumb can hold
// the centre while the other steers; each gesture is a tap, a drag, a swipe
// or a hold, and never more than one of them.

// Which third of the play area a finger came down in.
export type TouchZone = "left" | "centre" | "right";

export interface GestureTuning {
  // How far a finger may wander and still tap, in CSS pixels.
  tapSlop: number;
  // Sideways finger travel per lane of movement, in CSS pixels.
  laneStep: number;
  // Vertical finger travel that fires a swipe, in CSS pixels.
  swipeDistance: number;
  // How long a still finger in the centre stays down before it holds the
  // jump, in milliseconds.
  holdDelay: number;
}

// Sized for a 360px-wide phone: a lane per 32px puts the whole corridor
// within one thumb's sweep, and a 32px swipe is short enough to be quick
// while still well clear of the tap slop.
export const GESTURE_TUNING: GestureTuning = {
  tapSlop: 12,
  laneStep: 32,
  swipeDistance: 32,
  holdDelay: 280,
};

export interface PointerSample {
  id: number;
  x: number;
  y: number;
  time: number;
}

export type TouchCommand =
  | { kind: "act"; action: FrogAction }
  // Held jumps are forward only: holding the centre is holding W.
  | { kind: "holdJump" }
  | { kind: "releaseJump" };

type Phase =
  // Still within the tap slop: it may yet be a tap, a hold or a move.
  | { kind: "pending" }
  | { kind: "drag"; lanes: number }
  // Moving vertically, not yet far enough to swipe.
  | { kind: "vertical" }
  | { kind: "holding" }
  // A swipe has fired: the rest of the gesture does nothing.
  | { kind: "spent" };

interface Finger {
  zone: TouchZone;
  startX: number;
  startY: number;
  startTime: number;
  phase: Phase;
}

export interface GestureState {
  fingers: ReadonlyMap<number, Finger>;
}

export interface GestureStep {
  state: GestureState;
  commands: TouchCommand[];
}

export const NO_GESTURES: GestureState = { fingers: new Map() };

export function zoneAt(x: number, width: number): TouchZone {
  if (x < width / 3) return "left";
  if (x > (width * 2) / 3) return "right";
  return "centre";
}

const TAP_ACTIONS: Record<TouchZone, FrogAction> = {
  left: "rotateCcw",
  centre: "forward",
  right: "rotateCw",
};

function withFinger(state: GestureState, id: number, finger: Finger | null): GestureState {
  const fingers = new Map(state.fingers);
  if (finger === null) fingers.delete(id);
  else fingers.set(id, finger);
  return { fingers };
}

function someoneHolds(state: GestureState): boolean {
  return [...state.fingers.values()].some((finger) => finger.phase.kind === "holding");
}

function mayHold(state: GestureState, finger: Finger, time: number, tuning: GestureTuning): boolean {
  return (
    finger.zone === "centre" &&
    finger.phase.kind === "pending" &&
    time - finger.startTime >= tuning.holdDelay &&
    !someoneHolds(state)
  );
}

export function pointerDown(state: GestureState, sample: PointerSample, width: number): GestureStep {
  if (state.fingers.has(sample.id)) {
    throw new Error(`Pointer ${String(sample.id)} came down twice without lifting`);
  }
  const finger: Finger = {
    zone: zoneAt(sample.x, width),
    startX: sample.x,
    startY: sample.y,
    startTime: sample.time,
    phase: { kind: "pending" },
  };
  return { state: withFinger(state, sample.id, finger), commands: [] };
}

function moves(from: number, to: number): TouchCommand[] {
  const action: FrogAction = to > from ? "right" : "left";
  return Array.from({ length: Math.abs(to - from) }, () => ({ kind: "act", action }));
}

// One finger's movement to a new sample.
function track(finger: Finger, sample: PointerSample, tuning: GestureTuning): { finger: Finger; commands: TouchCommand[] } {
  const dx = sample.x - finger.startX;
  const dy = sample.y - finger.startY;
  let phase = finger.phase;
  if (phase.kind === "pending") {
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= tuning.tapSlop) return { finger, commands: [] };
    phase = Math.abs(dx) >= Math.abs(dy) ? { kind: "drag", lanes: 0 } : { kind: "vertical" };
  }
  switch (phase.kind) {
    case "drag": {
      const lanes = Math.trunc(dx / tuning.laneStep);
      return { finger: { ...finger, phase: { kind: "drag", lanes } }, commands: moves(phase.lanes, lanes) };
    }
    case "vertical": {
      if (Math.abs(dy) < tuning.swipeDistance) return { finger: { ...finger, phase }, commands: [] };
      const action: FrogAction = dy < 0 ? "hop" : "back";
      return { finger: { ...finger, phase: { kind: "spent" } }, commands: [{ kind: "act", action }] };
    }
    case "holding":
    case "spent":
      return { finger: { ...finger, phase }, commands: [] };
  }
}

export function pointerMove(state: GestureState, sample: PointerSample, tuning = GESTURE_TUNING): GestureStep {
  const finger = state.fingers.get(sample.id);
  if (finger === undefined) return { state, commands: [] };
  // A move event can be the first to see a still finger's hold delay run out.
  const stillWithinSlop =
    Math.max(Math.abs(sample.x - finger.startX), Math.abs(sample.y - finger.startY)) <= tuning.tapSlop;
  if (stillWithinSlop && mayHold(state, finger, sample.time, tuning)) {
    return {
      state: withFinger(state, sample.id, { ...finger, phase: { kind: "holding" } }),
      commands: [{ kind: "holdJump" }],
    };
  }
  const tracked = track(finger, sample, tuning);
  return { state: withFinger(state, sample.id, tracked.finger), commands: tracked.commands };
}

export function pointerUp(state: GestureState, sample: PointerSample, tuning = GESTURE_TUNING): GestureStep {
  const finger = state.fingers.get(sample.id);
  if (finger === undefined) return { state, commands: [] };
  const tracked = track(finger, sample, tuning);
  const released = withFinger(state, sample.id, null);
  switch (tracked.finger.phase.kind) {
    case "pending":
      return { state: released, commands: [{ kind: "act", action: TAP_ACTIONS[finger.zone] }] };
    case "holding":
      return { state: released, commands: [{ kind: "releaseJump" }] };
    case "drag":
    case "vertical":
    case "spent":
      return { state: released, commands: tracked.commands };
  }
}

// The browser took the finger away (a system gesture, or lost capture): it
// never taps, and a hold lets go.
export function pointerCancel(state: GestureState, id: number): GestureStep {
  const finger = state.fingers.get(id);
  if (finger === undefined) return { state, commands: [] };
  const commands: TouchCommand[] = finger.phase.kind === "holding" ? [{ kind: "releaseJump" }] : [];
  return { state: withFinger(state, id, null), commands };
}

// Time passing with no pointer event: a still finger in the centre may start
// holding.
export function timeReached(state: GestureState, time: number, tuning = GESTURE_TUNING): GestureStep {
  for (const [id, finger] of state.fingers) {
    if (mayHold(state, finger, time, tuning)) {
      return {
        state: withFinger(state, id, { ...finger, phase: { kind: "holding" } }),
        commands: [{ kind: "holdJump" }],
      };
    }
  }
  return { state, commands: [] };
}

// When the next hold could start, if no pointer event comes first; null if
// no finger could start one.
export function holdDeadline(state: GestureState, tuning = GESTURE_TUNING): number | null {
  if (someoneHolds(state)) return null;
  let deadline: number | null = null;
  for (const finger of state.fingers.values()) {
    if (finger.zone !== "centre" || finger.phase.kind !== "pending") continue;
    const at = finger.startTime + tuning.holdDelay;
    deadline = deadline === null ? at : Math.min(deadline, at);
  }
  return deadline;
}
