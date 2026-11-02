import { readPad, subscribeGamepads, type PadReading, type StandardButton } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import type { Binding } from "@/shared/components/prompts";
import type { DriveInput } from "../sim/car";
import type { ChaseLook } from "../render/chase-camera";

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
  freeCamera: binding("View", "F"),
  map: binding("Menu", "M"),
  mute: binding("X", "N"),
  mapPick: binding("A", "Click"),
  mapClear: binding("X", "X"),
  mapClose: binding("B", "Esc"),
} as const;

export type GameAction = "respawn" | "freeCamera" | "map" | "mute";
export type MapAction = "pick" | "clear" | "close";

const KEY_ACTIONS: Partial<Record<string, GameAction>> = { KeyR: "respawn", KeyF: "freeCamera", KeyM: "map", KeyN: "mute" };
const PAD_ACTIONS: Partial<Record<StandardButton, GameAction>> = { Y: "respawn", View: "freeCamera", Menu: "map", X: "mute" };
const KEY_MAP_ACTIONS: Partial<Record<string, MapAction>> = { KeyX: "clear", Escape: "close", KeyM: "close" };
const PAD_MAP_ACTIONS: Partial<Record<StandardButton, MapAction>> = { A: "pick", X: "clear", B: "close", Menu: "close" };
const TAKEN_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** `~` is a dead key on some layouts, sent as "Dead" until it's pressed twice, so the key under Esc counts by where it is. */
const isDevMenuKey = ({ key, code }: KeyboardEvent) => key === "~" || code === "Backquote";

export interface ControlsListener {
  onAction: (action: GameAction) => void;
  onMapAction: (action: MapAction) => void;
  /** A number key: the digit, as a string. */
  onDigit: (digit: string) => void;
  onDevMenu: (open: boolean) => void;
  onInputKind: (kind: InputKind) => void;
}

export function startControls({ onAction, onMapAction, onDigit, onDevMenu, onInputKind }: ControlsListener) {
  const held = new Set<string>();
  let mapOpen = false;
  let devMenuOpen = false;
  let pad: PadReading | null = null;
  let kind: InputKind = "keyboard-mouse";

  const switchTo = (next: InputKind) => {
    if (next === kind) return;
    kind = next;
    onInputKind(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Open, the menu's buttons take Space themselves.
    if (TAKEN_KEYS.has(event.code) && !devMenuOpen) event.preventDefault();
    if (event.repeat) return;
    switchTo("keyboard-mouse");
    held.add(event.code);
    if (mapOpen) {
      const mapAction = KEY_MAP_ACTIONS[event.code];
      if (mapAction) onMapAction(mapAction);
      return;
    }
    if (devMenuOpen) {
      if (event.code === "Escape" || isDevMenuKey(event)) onDevMenu(false);
      return;
    }
    if (isDevMenuKey(event)) {
      onDevMenu(true);
      return;
    }
    const action = KEY_ACTIONS[event.code];
    if (action) onAction(action);
    if (event.code.startsWith("Digit")) onDigit(event.code.slice(5));
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
      if (!edge.pressed || edge.name === null || devMenuOpen) return;
      if (mapOpen) {
        const mapAction = PAD_MAP_ACTIONS[edge.name];
        if (mapAction) onMapAction(mapAction);
        return;
      }
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
        throttle: axis([], ["KeyW"]),
        brake: axis([], ["KeyS"]),
        steer: axis(["KeyA"], ["KeyD"]),
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
    /** Where the chase camera looks while an arrow key is held. */
    look(): ChaseLook {
      if (held.has("ArrowUp")) return "down";
      if (held.has("ArrowDown")) return "behind";
      const sideways = axis(["ArrowLeft"], ["ArrowRight"]);
      return sideways < 0 ? "left" : sideways > 0 ? "right" : "ahead";
    },
    kind: () => kind,
    setMapOpen(open: boolean) {
      mapOpen = open;
    },
    setDevMenuOpen(open: boolean) {
      devMenuOpen = open;
    },
    /** The steady inputs on the world map: a pad's, and WASD's panning. */
    mapSteer() {
      const panX = axis(["KeyA"], ["KeyD"]);
      const panY = axis(["KeyW"], ["KeyS"]);
      const controls = pad?.controls;
      if (!controls) return { stickX: 0, stickY: 0, panX, panY, zoom: 0 };
      return { stickX: controls.leftStick.x, stickY: controls.leftStick.y, panX: panX !== 0 ? panX : controls.rightStick.x, panY: panY !== 0 ? panY : controls.rightStick.y, zoom: controls.rightTrigger - controls.leftTrigger };
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      stopPads();
    },
  };
}

