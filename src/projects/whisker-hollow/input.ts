"use client";

import { readPad, subscribeGamepads, type PadSnapshot } from "@/shared/lib/gamepad";
import { lockPointer, type InputKind } from "@/shared/lib/input";
import type { Steer } from "./camera";

/**
 * The game's controls, from the keyboard and mouse and from a controller.
 * Movement and the camera are read once a frame; presses arrive as actions.
 *
 * The mouse plays only under pointer lock: a click in the garden locks it,
 * and while locked it looks round; its buttons never interact. Unlocked,
 * it is for the cards and buttons, and never moves the camera. The keys and
 * the controller play either way.
 */

export type GameAction = "interact" | "album" | "view" | "pause";

export interface InputFrame {
  /** Where the player pushes, -1 to 1: x to the camera's right, y away from it. */
  move: { x: number; y: number };
  /** The look moved right and down, and zoom steps out, this frame. */
  look: Steer;
}

/** What each control does, for the prompts on screen. Space and A alone pick up and put down. */
export const BINDINGS = {
  interact: { pad: "A", key: "Space", fills: false },
  album: { pad: "Y", key: "Tab", fills: false },
  view: { pad: "R3", key: "V", fills: false },
  pause: { pad: "Menu", key: "Esc", fills: false },
} as const;

const KEY_ACTIONS: Partial<Record<string, GameAction>> = { Space: "interact", Tab: "album", KeyV: "view", Escape: "pause" };
const PAD_ACTIONS: Partial<Record<string, GameAction>> = { A: "interact", Y: "album", RS: "view", Menu: "pause" };

const LOOK_PER_PIXEL = 0.0025;
const STICK_TURN_SPEED = 2.8;
const STICK_TILT_SPEED = 1.8;
const PAD_ZOOM_SPEED = 6;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export interface Input {
  read(dt: number): InputFrame;
  /** Off while a card is open over the garden, so its keys and buttons don't also walk. */
  setEnabled(enabled: boolean): void;
  /** Whether the mouse is playing: the pointer is locked to the garden. */
  readonly locked: boolean;
  /** Lock the pointer to the garden. Only a click or key press may: a lock asked for otherwise is refused, and play goes on unlocked. */
  lock(): void;
  /** Give the pointer back, for a card. */
  unlock(): void;
  dispose(): void;
}

export function createInput(
  surface: HTMLElement,
  onAction: (action: GameAction) => void,
  onKind: (kind: InputKind) => void,
  onLockChange: (locked: boolean) => void,
): Input {
  const keys = new Set<string>();
  let enabled = true;
  let mouseLook = { turn: 0, tilt: 0 };
  let wheel = 0;
  let pad: PadSnapshot | null = null;
  const isLocked = () => document.pointerLockElement === surface;

  const lock = () => {
    if (isLocked()) return;
    // The browser refuses a lock outside a click or key press, and for about a
    // second after Esc released one. Refused, the garden plays on unlocked
    // until the next click in it.
    lockPointer(surface).catch(() => undefined);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled || isTyping(e.target)) return;
    onKind("keyboard-mouse");
    const action = KEY_ACTIONS[e.code];
    if (action !== undefined) {
      e.preventDefault();
      if (!e.repeat) onAction(action);
      return;
    }
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();
  const onPointerDown = () => {
    if (!enabled) return;
    onKind("keyboard-mouse");
    if (!isLocked()) lock();
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!enabled || !isLocked()) return;
    mouseLook.turn += e.movementX * LOOK_PER_PIXEL;
    mouseLook.tilt += e.movementY * LOOK_PER_PIXEL;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (enabled && isLocked()) wheel += Math.sign(e.deltaY);
  };
  const onContextMenu = (e: Event) => e.preventDefault();
  const onPointerLockChange = () => {
    if (isLocked()) onKind("keyboard-mouse");
    onLockChange(isLocked());
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("wheel", onWheel, { passive: false });
  surface.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("pointerlockchange", onPointerLockChange);
  const unsubscribePads = subscribeGamepads({
    onFrame(pads, changed) {
      pad = pads.find((p) => p.standard) ?? null;
      if (changed && enabled && pad !== null) onKind("pad");
    },
    onButton(edge) {
      if (!enabled || !edge.pressed || edge.name === null) return;
      onKind("pad");
      const action = PAD_ACTIONS[edge.name];
      if (action !== undefined) onAction(action);
    },
  });

  function held(...codes: string[]): number {
    return codes.some((code) => keys.has(code)) ? 1 : 0;
  }

  return {
    read(dt) {
      const frame: InputFrame = { move: { x: 0, y: 0 }, look: { turn: 0, tilt: 0, zoom: 0 } };
      if (!enabled) return frame;
      frame.move.x = held("KeyD") - held("KeyA");
      frame.move.y = held("KeyW") - held("KeyS");
      frame.look = { ...mouseLook, zoom: wheel };
      mouseLook = { turn: 0, tilt: 0 };
      wheel = 0;
      const controls = pad === null ? null : readPad(pad).controls;
      if (controls !== null) {
        frame.move.x += controls.leftStick.x;
        frame.move.y -= controls.leftStick.y;
        frame.look.turn += controls.rightStick.x * STICK_TURN_SPEED * dt;
        frame.look.tilt += controls.rightStick.y * STICK_TILT_SPEED * dt;
        const { DpadUp, DpadDown } = controls.buttons;
        frame.look.zoom += ((DpadDown.pressed ? 1 : 0) - (DpadUp.pressed ? 1 : 0)) * PAD_ZOOM_SPEED * dt;
      }
      const length = Math.hypot(frame.move.x, frame.move.y);
      if (length > 1) {
        frame.move.x /= length;
        frame.move.y /= length;
      }
      return frame;
    },
    setEnabled(next) {
      enabled = next;
      if (!next) {
        keys.clear();
        mouseLook = { turn: 0, tilt: 0 };
        wheel = 0;
      }
    },
    get locked() {
      return isLocked();
    },
    lock,
    unlock() {
      if (isLocked()) document.exitPointerLock();
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("wheel", onWheel);
      surface.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      if (isLocked()) document.exitPointerLock();
      unsubscribePads();
    },
  };
}
