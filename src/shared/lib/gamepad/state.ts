// The pure core of the gamepad library: snapshots in, readable state and
// button edges out. Nothing here touches the browser, so it runs in tests.

/** The buttons of the W3C "standard" mapping, in their standard index order,
 *  named as they're printed on an Xbox controller. */
export const STANDARD_BUTTONS = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "LS",
  "RS",
  "DpadUp",
  "DpadDown",
  "DpadLeft",
  "DpadRight",
  "Home",
] as const;

export type StandardButton = (typeof STANDARD_BUTTONS)[number];

/** Left stick x/y, then right stick x/y. Right and down are positive. */
const LEFT_X = 0;
const LEFT_Y = 1;
const RIGHT_X = 2;
const RIGHT_Y = 3;

/** A radial deadzone of 0.2 hides the resting wobble of a worn Xbox stick
 *  without making small, deliberate tilts feel dead. */
export const DEFAULT_DEADZONE = 0.2;

export interface ButtonState {
  pressed: boolean;
  /** 0 to 1. Analog for the triggers, 0 or 1 for everything else. */
  value: number;
}

/** One pad as the browser reported it on one frame. */
export interface PadSnapshot {
  /** The pad's slot, stable for as long as it stays connected. */
  index: number;
  id: string;
  /** True for the W3C "standard" layout, which Xbox pads report. */
  standard: boolean;
  buttons: readonly ButtonState[];
  axes: readonly number[];
}

/** The parts of a browser `Gamepad` a snapshot is read from. */
export interface GamepadSource {
  index: number;
  id: string;
  mapping: string;
  buttons: readonly ButtonState[];
  axes: readonly number[];
}

export function snapshotOf(pad: GamepadSource): PadSnapshot {
  return {
    index: pad.index,
    id: pad.id,
    standard: pad.mapping === "standard",
    buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
    axes: [...pad.axes],
  };
}

export interface Stick {
  x: number;
  y: number;
}

/** A standard pad's controls by name. Sticks have the deadzone applied. */
export interface StandardControls {
  buttons: Record<StandardButton, ButtonState>;
  leftStick: Stick;
  rightStick: Stick;
  /** 0 to 1. */
  leftTrigger: number;
  rightTrigger: number;
}

export interface PadReading extends PadSnapshot {
  /** Null when the pad's layout isn't "standard": its buttons and axes are
   *  then only known by index, and no name would be more than a guess. */
  controls: StandardControls | null;
}

export interface ReadOptions {
  /** Radial deadzone for the sticks, 0 to 1. */
  deadzone?: number;
}

const RELEASED: ButtonState = { pressed: false, value: 0 };

export function readPad(snapshot: PadSnapshot, options: ReadOptions = {}): PadReading {
  return { ...snapshot, controls: snapshot.standard ? standardControls(snapshot, options) : null };
}

function standardControls(snapshot: PadSnapshot, { deadzone = DEFAULT_DEADZONE }: ReadOptions): StandardControls {
  const buttons = Object.fromEntries(
    STANDARD_BUTTONS.map((name, i) => [name, snapshot.buttons[i] ?? RELEASED]),
  ) as Record<StandardButton, ButtonState>;
  const axis = (i: number): number => snapshot.axes[i] ?? 0;
  return {
    buttons,
    leftStick: radialDeadzone({ x: axis(LEFT_X), y: axis(LEFT_Y) }, deadzone),
    rightStick: radialDeadzone({ x: axis(RIGHT_X), y: axis(RIGHT_Y) }, deadzone),
    leftTrigger: buttons.LT.value,
    rightTrigger: buttons.RT.value,
  };
}

/** Zeroes a stick inside the deadzone circle and rescales the rest so output
 *  still runs smoothly from 0 at the ring to 1 at the rim, in any direction.
 *  Radial rather than per-axis, so diagonals don't snap to the axes. */
export function radialDeadzone(stick: Stick, deadzone: number): Stick {
  const magnitude = Math.hypot(stick.x, stick.y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return { x: (stick.x / magnitude) * scaled, y: (stick.y / magnitude) * scaled };
}

/** A button going down or coming up between two frames. */
export interface ButtonEdge {
  pad: number;
  /** Raw button index. */
  button: number;
  /** The standard name, or null when the pad's layout isn't standard. */
  name: StandardButton | null;
  pressed: boolean;
}

/** The presses and releases between two frames of one pad. A missing `prev`
 *  is a pad that just appeared (so held buttons count as presses); a missing
 *  `curr` is one that just left (so held buttons count as releases). */
export function buttonEdges(prev: PadSnapshot | null, curr: PadSnapshot | null): ButtonEdge[] {
  const pad = curr ?? prev;
  if (!pad) return [];
  // A different pad in the same slot shares nothing with the last one.
  const before = prev && curr && prev.id !== curr.id ? null : prev;
  const count = Math.max(before?.buttons.length ?? 0, curr?.buttons.length ?? 0);
  const edges: ButtonEdge[] = [];
  for (let button = 0; button < count; button++) {
    const was = before?.buttons[button]?.pressed ?? false;
    const is = curr?.buttons[button]?.pressed ?? false;
    if (was === is) continue;
    edges.push({ pad: pad.index, button, name: pad.standard ? (STANDARD_BUTTONS[button] ?? null) : null, pressed: is });
  }
  return edges;
}

/** Whether anything a reader could see differs between two frames. */
export function snapshotChanged(prev: PadSnapshot | null, curr: PadSnapshot): boolean {
  if (!prev || prev.id !== curr.id || prev.buttons.length !== curr.buttons.length || prev.axes.length !== curr.axes.length) {
    return true;
  }
  return (
    curr.buttons.some((b, i) => b.pressed !== prev.buttons[i].pressed || b.value !== prev.buttons[i].value) ||
    curr.axes.some((a, i) => a !== prev.axes[i])
  );
}
