import type { FrogAction, JumpDirection } from "./run";

// The keyboard controls, by physical key, so the WASD block stays put on
// other keyboard layouts, and the legend the game shows for them.

export const KEY_ACTIONS: ReadonlyMap<string, FrogAction> = new Map<string, FrogAction>([
  ["KeyA", "left"],
  ["ArrowLeft", "left"],
  ["KeyD", "right"],
  ["ArrowRight", "right"],
  ["KeyQ", "rotateCcw"],
  ["KeyE", "rotateCw"],
  ["Space", "hop"],
]);

export const JUMP_KEYS: ReadonlyMap<string, JumpDirection> = new Map<string, JumpDirection>([
  ["KeyW", "forward"],
  ["ArrowUp", "forward"],
  ["KeyS", "back"],
  ["ArrowDown", "back"],
]);

export const KEY_LEGEND: readonly (readonly [keys: string, action: string])[] = [
  ["A D / ← →", "move"],
  ["Q E", "rotate"],
  ["Space", "hop"],
  ["W S / ↑ ↓", "jump (hold to repeat)"],
  ["R", "restart"],
  ["M", "mute"],
];
