import { axisWay, DEFAULT_DEADZONE, readPad, type PadSnapshot, type StandardButton, type StickThresholds } from "@/shared/lib/gamepad";
import type { FrogAction, HeldAction, PlayerInput } from "../run";

// A game controller's controls, on a pad with the standard (Xbox) layout,
// pure: one frame's snapshot of the pad in, the inputs it makes out. The
// left stick or the D-pad slides (left, right) and jumps (up forward, down
// back), held as a held key is, so the rules repeat them on their own
// clock; A hops, X or LB turns anticlockwise and B or RB clockwise, and
// Menu restarts; View opens the game's menu. A pad without the standard
// layout drives nothing: its buttons are only known by number, and a guess
// would be wrong on some pads.

// The stick's radial deadzone, which hides a worn stick's resting wobble,
// and the thresholds a tilt holds a way past and lets go inside.
export interface PadTuning extends StickThresholds {
  deadzone: number;
}

export const PAD_TUNING: PadTuning = {
  deadzone: DEFAULT_DEADZONE,
  press: 0.5,
  release: 0.35,
};

const PAD_ACTIONS: Partial<Record<StandardButton, FrogAction>> = {
  A: "hop",
  X: "rotateCcw",
  LB: "rotateCcw",
  B: "rotateCw",
  RB: "rotateCw",
};
export const RESTART_BUTTON: StandardButton = "Menu";
// View opens the game's menu (see `game-screen.tsx`), so it drives no frog.
export const MENU_BUTTON: StandardButton = "View";
const BUTTONS = [...(Object.keys(PAD_ACTIONS) as StandardButton[]), RESTART_BUTTON];

// What a pad is holding: a slide and a jump, each one way or neither, and
// the buttons it uses that are down.
export interface PadHold {
  slide: "left" | "right" | null;
  jump: "forward" | "back" | null;
  buttons: readonly StandardButton[];
}

export const PAD_AT_REST: PadHold = { slide: null, jump: null, buttons: [] };

// Where a pad starts as the game first sees it: its buttons already down
// count as held, so a press made for the screen before (A on Start, Menu)
// isn't also a hop or a restart; a held direction still moves the frog.
export function padArrival(pad: PadSnapshot, tuning: PadTuning = PAD_TUNING): PadHold {
  return { ...padStep(PAD_AT_REST, pad, tuning).hold, slide: null, jump: null };
}

export interface PadStep {
  hold: PadHold;
  inputs: PlayerInput[];
  restart: boolean;
}

function heldChange<W extends HeldAction>(was: W | null, now: W | null): PlayerInput[] {
  if (was === now) return [];
  return [
    ...(was === null ? [] : [{ kind: "release", action: was } as const]),
    ...(now === null ? [] : [{ kind: "press", action: now } as const]),
  ];
}

// One frame of a pad, from what it held last frame; a missing pad (one
// that disconnected) lets go of everything.
export function padStep(prev: PadHold, pad: PadSnapshot | null, tuning: PadTuning = PAD_TUNING): PadStep {
  const controls = pad === null ? null : readPad(pad, { deadzone: tuning.deadzone }).controls;
  let hold = PAD_AT_REST;
  if (controls !== null) {
    const { buttons, leftStick } = controls;
    hold = {
      slide: axisWay(leftStick.x, buttons.DpadLeft.pressed, buttons.DpadRight.pressed, ["left", "right"], prev.slide, tuning),
      // Up is negative on a stick, and up is forward.
      jump: axisWay(leftStick.y, buttons.DpadUp.pressed, buttons.DpadDown.pressed, ["forward", "back"], prev.jump, tuning),
      buttons: BUTTONS.filter((name) => buttons[name].pressed),
    };
  }
  const pressed = hold.buttons.filter((name) => !prev.buttons.includes(name));
  const inputs: PlayerInput[] = [
    ...heldChange(prev.slide, hold.slide),
    ...heldChange(prev.jump, hold.jump),
    ...pressed.flatMap((name): PlayerInput[] => {
      const action = PAD_ACTIONS[name];
      return action === undefined ? [] : [{ kind: "act", action }];
    }),
  ];
  return { hold, inputs, restart: pressed.includes(RESTART_BUTTON) };
}
