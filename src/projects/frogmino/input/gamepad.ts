import { DEFAULT_DEADZONE, readPad, type PadSnapshot, type StandardButton } from "@/shared/lib/gamepad";
import type { FrogAction, HeldAction, PlayerInput } from "../run";

// A game controller's controls, on a pad with the standard (Xbox) layout,
// pure: one frame's snapshot of the pad in, the inputs it makes out. The
// left stick or the D-pad slides (left, right) and jumps (up forward, down
// back), held as a held key is, so the rules repeat them on their own
// clock; A hops, X or LB turns anticlockwise and B or RB clockwise, and
// Menu restarts. A pad without the standard layout drives nothing: its
// buttons are only known by number, and a guess would be wrong on some pads.

export interface PadTuning {
  // The stick's radial deadzone, which hides a worn stick's resting wobble.
  deadzone: number;
  // How far the stick, past its deadzone, must tilt along an axis to hold
  // that way, and how far back it must come to let go: two thresholds, so a
  // stick resting near one doesn't chatter between held and let go.
  press: number;
  release: number;
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
const BUTTONS = [...(Object.keys(PAD_ACTIONS) as StandardButton[]), RESTART_BUTTON];

// What a pad is holding: a slide and a jump, each one way or neither, and
// the buttons it uses that are down.
export interface PadHold {
  slide: "left" | "right" | null;
  jump: "forward" | "back" | null;
  buttons: readonly StandardButton[];
}

export const PAD_AT_REST: PadHold = { slide: null, jump: null, buttons: [] };

export interface PadStep {
  hold: PadHold;
  inputs: PlayerInput[];
  restart: boolean;
}

// Which way one axis holds: the D-pad's way if pressed, or the stick's once
// it tilts past the press threshold, kept until it comes back inside the
// release threshold.
function axisWay<W extends string>(
  stick: number,
  negativePad: boolean,
  positivePad: boolean,
  [negative, positive]: readonly [W, W],
  was: W | null,
  tuning: PadTuning,
): W | null {
  if (negativePad !== positivePad) return negativePad ? negative : positive;
  const beyond = (way: W): number => (was === way ? tuning.release : tuning.press);
  if (stick <= -beyond(negative)) return negative;
  if (stick >= beyond(positive)) return positive;
  return null;
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
