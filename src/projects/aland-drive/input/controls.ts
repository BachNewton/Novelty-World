import { readPad, subscribeGamepads, type PadReading, type StandardButton } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import type { Binding } from "@/shared/components/prompts";
import type { DriveInput } from "../sim/car";
import type { ChaseLook } from "../render/chase-camera";
import type { HeadLook } from "../render/cockpit-camera";

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
  freeCamera: binding(null, "F"),
  /** The chase view or the driver's seat, remembered in this browser. */
  cockpit: binding("RB", "C"),
  /** Held: the arrows look left, right or behind; the right stick looks any way round. */
  lookLeft: binding("R3", "←"),
  lookRight: binding("R3", "→"),
  lookBehind: binding("R3", "↓"),
  /** Held, in the chase view: looks down on the car. */
  lookDown: binding(null, "↑"),
  map: binding("View", "M"),
  menu: binding("Menu", "Esc"),
  /** A challenge's start ring: start it, or choose solo or co-op; and join a co-op one you're asked to. */
  challenge: binding("X", "E"),
  /** Sound on or off has no prompt: it's in the game menu too. */
  mute: binding(null, "N"),
  /** Walking round a dealership: forward, left, back and right, on WASD or the left stick. */
  walkForward: binding("L3", "W"),
  walkLeft: binding("L3", "A"),
  walkBack: binding("L3", "S"),
  walkRight: binding("L3", "D"),
  /** Held while walking: a light jog across the floor. */
  walkJog: binding("L3", "Shift"),
  /** Looking round on foot: a drag of the mouse, the arrows, or the right stick. */
  walkLook: binding("R3", "Drag"),
  /** Held, at a dealership's car or in its seat: revs its engine. In the seat, W does too. */
  rev: binding("RT", "R"),
  mapPick: binding("A", "Click"),
  mapClear: binding("X", "X"),
  mapClose: binding("B", "Esc"),
} as const;

export type GameAction = "respawn" | "freeCamera" | "cockpit" | "map" | "mute" | "challenge";
export type MapAction = "pick" | "clear" | "close";

const KEY_ACTIONS: Partial<Record<string, GameAction>> = { KeyR: "respawn", KeyF: "freeCamera", KeyC: "cockpit", KeyM: "map", KeyN: "mute", KeyE: "challenge" };
const PAD_ACTIONS: Partial<Record<StandardButton, GameAction>> = { Y: "respawn", RB: "cockpit", View: "map", X: "challenge" };
const KEY_MAP_ACTIONS: Partial<Record<string, MapAction>> = { KeyX: "clear", Escape: "close", KeyM: "close" };
const PAD_MAP_ACTIONS: Partial<Record<StandardButton, MapAction>> = { A: "pick", X: "clear", B: "close", View: "close" };
const LOOK_LEFT = Math.PI / 2;
/** How far the right stick is pushed before it looks round: nearer the middle, its direction is too unsteady to aim by. */
const PAD_LOOK_PUSH = 0.5;
/** From the driver's seat the right stick turns the head as far as it's pushed: this far round at full push, and this far up or down. */
const HEAD_TURN = (140 * Math.PI) / 180;
const HEAD_TILT = (22 * Math.PI) / 180;

const TAKEN_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** `~` is a dead key on some layouts, sent as "Dead" until it's pressed twice, so the key under Esc counts by where it is. */
const isDevMenuKey = ({ key, code }: KeyboardEvent) => key === "~" || code === "Backquote";

/** What walking reads each frame: see `walk()`. */
export interface WalkInput {
  forward: number;
  right: number;
  turn: number;
  tilt: number;
  rev: number;
  /** Held: a light jog rather than a walk. */
  jog: boolean;
}

/** The left stick's own deadzone is radial and small; walking ignores a little more, so a resting thumb doesn't drift the eye. */
const WALK_DEADZONE = 0.12;

export interface ControlsListener {
  onAction: (action: GameAction) => void;
  onMapAction: (action: MapAction) => void;
  onDevMenu: (open: boolean) => void;
  /** The game menu: Esc or a pad's Menu opens it, and Esc closes it. Its own buttons are the page's. */
  onGameMenu: (open: boolean) => void;
  onInputKind: (kind: InputKind) => void;
}

export function startControls({ onAction, onMapAction, onDevMenu, onGameMenu, onInputKind }: ControlsListener) {
  const held = new Set<string>();
  let mapOpen = false;
  let devMenuOpen = false;
  let gameMenuOpen = false;
  let pad: PadReading | null = null;
  let kind: InputKind = "keyboard-mouse";

  const switchTo = (next: InputKind) => {
    if (next === kind) return;
    kind = next;
    onInputKind(next);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Open, the menu's buttons take Space themselves.
    if (TAKEN_KEYS.has(event.code) && !devMenuOpen && !gameMenuOpen) event.preventDefault();
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
    if (gameMenuOpen) {
      if (event.code === "Escape") onGameMenu(false);
      return;
    }
    if (isDevMenuKey(event)) {
      onDevMenu(true);
      return;
    }
    if (event.code === "Escape") {
      onGameMenu(true);
      return;
    }
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
      // The game menu's buttons are the page's own pad navigation.
      if (!edge.pressed || edge.name === null || devMenuOpen || gameMenuOpen) return;
      if (mapOpen) {
        const mapAction = PAD_MAP_ACTIONS[edge.name];
        if (mapAction) onMapAction(mapAction);
        return;
      }
      if (edge.name === "Menu") {
        onGameMenu(true);
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
    /** Where the chase camera looks: while an arrow key is held, or the way the right stick points, behind when it's pulled back. */
    look(): ChaseLook {
      if (held.has("ArrowUp")) return "down";
      if (held.has("ArrowDown")) return Math.PI;
      const sideways = axis(["ArrowLeft"], ["ArrowRight"]);
      if (sideways !== 0) return -sideways * LOOK_LEFT;
      const stick = pad?.controls?.rightStick;
      if (!stick || Math.hypot(stick.x, stick.y) < PAD_LOOK_PUSH) return 0;
      return Math.atan2(-stick.x, -stick.y);
    },
    /** Where the head turns in the driver's seat: an arrow key's look while held, or as far as the right stick is pushed; Up is the chase view's alone. */
    headLook(): HeadLook {
      if (held.has("ArrowDown")) return { yaw: Math.PI, pitch: 0 };
      const sideways = axis(["ArrowLeft"], ["ArrowRight"]);
      if (sideways !== 0) return { yaw: -sideways * LOOK_LEFT, pitch: 0 };
      const stick = pad?.controls?.rightStick;
      if (!stick) return { yaw: 0, pitch: 0 };
      return { yaw: -stick.x * HEAD_TURN, pitch: -stick.y * HEAD_TILT };
    },
    kind: () => kind,
    setMapOpen(open: boolean) {
      mapOpen = open;
    },
    setDevMenuOpen(open: boolean) {
      devMenuOpen = open;
    },
    setGameMenuOpen(open: boolean) {
      gameMenuOpen = open;
    },
    /** On foot in a dealership: walking (forward and right, -1 to 1), turning and tilting the head (the arrows and the right stick, -1 to 1), and the throttle a car is revved with. */
    walk(): WalkInput {
      const controls = pad?.controls;
      const stick = (value: number) => (Math.abs(value) < WALK_DEADZONE ? 0 : value);
      const keys = { forward: axis(["KeyS"], ["KeyW"]), right: axis(["KeyA"], ["KeyD"]), turn: axis(["ArrowRight"], ["ArrowLeft"]), tilt: axis(["ArrowDown"], ["ArrowUp"]) };
      const rev = held.has("KeyR") ? 1 : 0;
      const shift = held.has("ShiftLeft") || held.has("ShiftRight");
      if (!controls) return { ...keys, rev, jog: shift };
      return {
        forward: keys.forward !== 0 ? keys.forward : -stick(controls.leftStick.y),
        right: keys.right !== 0 ? keys.right : stick(controls.leftStick.x),
        turn: keys.turn !== 0 ? keys.turn : -stick(controls.rightStick.x),
        tilt: keys.tilt !== 0 ? keys.tilt : -stick(controls.rightStick.y),
        rev: Math.max(rev, controls.rightTrigger),
        jog: shift || controls.buttons.LS.pressed,
      };
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

