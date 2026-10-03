import type { FrogAction, HeldAction, PlayerInput } from "../run";
import type { DeviceId } from "./devices";

// The keyboard controls, by physical key, so the WASD block stays put on
// other keyboard layouts, and the legends the game shows for them. In solo
// the whole keyboard is one player's: WASD or the arrows, Q and E, Space. In
// local co-op it splits in two: the left half, WASD with Q, E and Space, is
// one device, and the right half, the arrows with , . and /, is another, so
// the two players' keys never collide and each hand sits on its own block.

// A key's control: an action on each press, or a jump or slide that repeats
// while it is held.
export type KeyControl = { kind: "act"; action: FrogAction } | { kind: "hold"; action: HeldAction };

export type KeyboardLayout = "solo" | "split";

const act = (action: FrogAction): KeyControl => ({ kind: "act", action });
const hold = (action: HeldAction): KeyControl => ({ kind: "hold", action });

const WASD: readonly (readonly [string, KeyControl])[] = [
  ["KeyW", hold("forward")],
  ["KeyS", hold("back")],
  ["KeyA", hold("left")],
  ["KeyD", hold("right")],
];
const ARROWS: readonly (readonly [string, KeyControl])[] = [
  ["ArrowUp", hold("forward")],
  ["ArrowDown", hold("back")],
  ["ArrowLeft", hold("left")],
  ["ArrowRight", hold("right")],
];
const LEFT_EXTRAS: readonly (readonly [string, KeyControl])[] = [
  ["KeyQ", act("rotateCcw")],
  ["KeyE", act("rotateCw")],
  ["Space", act("hop")],
];
const RIGHT_EXTRAS: readonly (readonly [string, KeyControl])[] = [
  ["Comma", act("rotateCcw")],
  ["Period", act("rotateCw")],
  ["Slash", act("hop")],
];

export const KEYBOARDS: Record<KeyboardLayout, ReadonlyMap<DeviceId, ReadonlyMap<string, KeyControl>>> = {
  solo: new Map([["keys", new Map([...WASD, ...ARROWS, ...LEFT_EXTRAS])]]),
  split: new Map([
    ["keys:left", new Map([...WASD, ...LEFT_EXTRAS])],
    ["keys:right", new Map([...ARROWS, ...RIGHT_EXTRAS])],
  ]),
};

// R restarts the run, whichever player presses it.
export const RESTART_KEY = "KeyR";

export interface KeyMeaning {
  device: DeviceId;
  control: KeyControl;
}

// Which device a key belongs to, and its control; null for a key the game
// doesn't use.
export function keyMeaning(layout: KeyboardLayout, code: string): KeyMeaning | null {
  for (const [device, keys] of KEYBOARDS[layout]) {
    const control = keys.get(code);
    if (control !== undefined) return { device, control };
  }
  return null;
}

export interface DeviceInput {
  device: DeviceId;
  input: PlayerInput;
}

// A key going down. One press is one input: the operating system's key
// repeat is the caller's to ignore, and a held jump or slide repeats in the
// rules, on the rules' own clock.
export function keyDown(layout: KeyboardLayout, code: string): DeviceInput | null {
  const meaning = keyMeaning(layout, code);
  if (meaning === null) return null;
  const { device, control } = meaning;
  return { device, input: control.kind === "act" ? { kind: "act", action: control.action } : { kind: "press", action: control.action } };
}

// A key coming up lets go of a held jump or slide.
export function keyUp(layout: KeyboardLayout, code: string): DeviceInput | null {
  const meaning = keyMeaning(layout, code);
  if (meaning?.control.kind !== "hold") return null;
  return { device: meaning.device, input: { kind: "release", action: meaning.control.action } };
}

// Key releases aren't seen while the window is out of focus, so losing focus
// lets go of every key of every keyboard device.
export function focusLost(layout: KeyboardLayout): DeviceInput[] {
  return [...KEYBOARDS[layout].keys()].map((device) => ({ device, input: { kind: "releaseAll" } }));
}

// The keys a half of the split keyboard joins and leaves local co-op with:
// its hop key, and its jump-back key.
export const JOIN_KEYS: Record<"keys:left" | "keys:right", { join: string; leave: string }> = {
  "keys:left": { join: "Space", leave: "KeyS" },
  "keys:right": { join: "Slash", leave: "ArrowDown" },
};
// Enter starts local co-op once both players are in.
export const START_KEY = "Enter";

export type Legend = readonly (readonly [keys: string, action: string])[];

export const SOLO_LEGEND: Legend = [
  ["A D / ← →", "move (hold to repeat)"],
  ["Q E", "rotate"],
  ["Space", "hop"],
  ["W S / ↑ ↓", "jump (hold to repeat)"],
  ["R", "restart"],
  ["M", "mute"],
];

// Local co-op's legend: each action with each player's keys.
export const COOP_LEGEND: readonly (readonly [action: string, p1: string, p2: string])[] = [
  ["move", "A D", "← →"],
  ["rotate", "Q E", ", ."],
  ["hop", "Space", "/"],
  ["jump", "W S", "↑ ↓"],
];
