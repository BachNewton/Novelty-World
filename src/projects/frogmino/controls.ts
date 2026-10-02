import type { FrogAction, HeldAction } from "./run";

// The keyboard controls, by physical key, so the WASD block stays put on
// other keyboard layouts, and the legend the game shows for them.

export const KEY_ACTIONS: ReadonlyMap<string, FrogAction> = new Map<string, FrogAction>([
  ["KeyQ", "rotateCcw"],
  ["KeyE", "rotateCw"],
  ["Space", "hop"],
]);

// The jump and slide keys, which repeat while held.
export const HELD_KEYS: ReadonlyMap<string, HeldAction> = new Map<string, HeldAction>([
  ["KeyW", "forward"],
  ["ArrowUp", "forward"],
  ["KeyS", "back"],
  ["ArrowDown", "back"],
  ["KeyA", "left"],
  ["ArrowLeft", "left"],
  ["KeyD", "right"],
  ["ArrowRight", "right"],
]);

export const KEY_LEGEND: readonly (readonly [keys: string, action: string])[] = [
  ["A D / ← →", "move (hold to repeat)"],
  ["Q E", "rotate"],
  ["Space", "hop"],
  ["W S / ↑ ↓", "jump (hold to repeat)"],
  ["R", "restart"],
  ["M", "mute"],
];
