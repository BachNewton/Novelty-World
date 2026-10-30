import { readPad, subscribeGamepads, type PadReading, type StandardButton } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import type { Binding } from "@/shared/components/prompts";
import type { DriveInput } from "../sim/car";

/*
 * What each key and pad button means. The keyboard and a controller are read
 * side by side: whichever moved last drives, and the prompts follow it.
 */

const binding = (pad: Binding["pad"], key: string): Binding => ({ pad, key, fills: false });

export const BINDINGS = {
  throttle: binding("RT", "W"),
  brake: binding("LT", "S"),
  left: binding("L3", "A"),
  right: binding("L3", "D"),
  handbrake: binding("A", "Space"),
  respawn: binding("Y", "R"),
  view: binding("RB", "C"),
  freeCamera: binding("View", "F"),
} as const;

export type GameAction = "respawn" | "view" | "freeCamera";

const KEY_ACTIONS: Partial<Record<string, GameAction>> = { KeyR: "respawn", KeyC: "view", KeyF: "freeCamera" };
const PAD_ACTIONS: Partial<Record<StandardButton, GameAction>> = { Y: "respawn", RB: "view", View: "freeCamera" };
const TAKEN_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export interface ControlsListener {
  onAction: (action: GameAction) => void;
  onInputKind: (kind: InputKind) => void;
}

export function startControls({ onAction, onInputKind }: ControlsListener) {
  const held = new Set<string>();
  let pad: PadReading | null = null;
  let kind: InputKind = "keyboard-mouse";

  const switchTo = (next: InputKind) => {
    if (next === kind) return;
    kind = next;
    onInputKind(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (TAKEN_KEYS.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    switchTo("keyboard-mouse");
    held.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) onAction(action);
  };
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const onBlur = () => {
    held.clear();
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const stopPads = subscribeGamepads({
    onFrame(pads, changed) {
      const reading = pads.length > 0 ? readPad(pads[0]) : null;
      pad = reading?.controls ? reading : null;
      if (changed && pad) switchTo("pad");
    },
    onButton(edge) {
      if (!edge.pressed || edge.name === null) return;
      const action = PAD_ACTIONS[edge.name];
      if (action) onAction(action);
    },
    onConnectionChange(pads) {
      if (pads.length === 0) pad = null;
    },
  });

  const axis = (minus: readonly string[], plus: readonly string[]) => (plus.some((code) => held.has(code)) ? 1 : 0) - (minus.some((code) => held.has(code)) ? 1 : 0);

  return {
    read(): DriveInput {
      const fromKeys: DriveInput = {
        throttle: axis([], ["KeyW", "ArrowUp"]),
        brake: axis([], ["KeyS", "ArrowDown"]),
        steer: axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]),
        handbrake: held.has("Space"),
      };
      const controls = pad?.controls;
      if (!controls) return fromKeys;
      return {
        throttle: Math.max(fromKeys.throttle, controls.rightTrigger),
        brake: Math.max(fromKeys.brake, controls.leftTrigger),
        steer: fromKeys.steer !== 0 ? fromKeys.steer : controls.leftStick.x,
        handbrake: fromKeys.handbrake || controls.buttons.A.pressed,
      };
    },
    kind: () => kind,
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      stopPads();
    },
  };
}

