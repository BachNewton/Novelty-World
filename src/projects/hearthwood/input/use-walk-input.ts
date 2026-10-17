"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { readPad, subscribeGamepads } from "@/shared/lib/gamepad";
import { spanOf, type InputKind, type Point } from "@/shared/lib/input";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { otherView, savedPointOfView, savePointOfView, type PointOfView } from "./point-of-view";
import {
  KEY_VIEW,
  LOOK,
  PAD_VIEW,
  STICK_RUN,
  STILL,
  WALK_KEYS,
  keyboardMove,
  keyboardRunning,
  keyboardTurn,
  padInUse,
  padMove,
  padRunning,
  stickMove,
  type Move,
} from "./walk-controls";

/*
 * Walking's input from all three methods at once, into one state the scene
 * reads each frame: the move asked for, whether running, the camera's turn
 * and the point of view. Whichever method was used last is the one the
 * prompts show.
 *
 * In first person a mouse looks with the pointer locked: a click on the
 * game locks it and Esc (the browser's own) frees it. The browser's
 * `pointerlockchange` and `pointerlockerror` events are the only word on
 * whether it is locked. In third person, and on touch, dragging turns the
 * camera instead.
 */

export interface WalkState {
  move: Move;
  running: boolean;
  /** Camera turn dragged since the scene last took it, in radians (yaw right, pitch down). */
  turn: { yaw: number; pitch: number };
  /** Camera turn held on a stick or keys, in radians per second. */
  turnRate: { yaw: number; pitch: number };
  /** Zoom asked for since the scene last took it: above 1 moves the camera out. */
  zoom: number;
  pointOfView: PointOfView;
}

/** A touch stick, where it shows on the screen. */
export interface TouchStick {
  origin: Point;
  knob: Point;
}

interface Drag {
  id: number;
  last: Point;
}

export function takeTurn(state: WalkState): { yaw: number; pitch: number; zoom: number } {
  const taken = { yaw: state.turn.yaw, pitch: state.turn.pitch, zoom: state.zoom };
  state.turn = { yaw: 0, pitch: 0 };
  state.zoom = 1;
  return taken;
}

export interface WalkInput {
  state: RefObject<WalkState>;
  /** The input used last. */
  kind: InputKind;
  /** The touch stick while a thumb holds it. */
  stick: TouchStick | null;
  /** The inputs the player has walked with, so their hints can go. */
  walkedWith: ReadonlySet<InputKind>;
  pointOfView: PointOfView;
  setPointOfView: (view: PointOfView) => void;
  /** Whether the pointer is locked to the game, the mouse looking. */
  locked: boolean;
}

/** Before anything is used: a device whose main pointer is a finger is played by touch. */
function firstGuessInput(): InputKind {
  return window.matchMedia("(pointer: coarse)").matches ? "touch" : "keyboard-mouse";
}

export function useWalkInput(surface: RefObject<HTMLElement | null>): WalkInput {
  const [pointOfView, setShownView] = useState<PointOfView>(savedPointOfView);
  const state = useRef<WalkState>({ move: STILL, running: false, turn: { yaw: 0, pitch: 0 }, turnRate: { yaw: 0, pitch: 0 }, zoom: 1, pointOfView });
  const [kind, setKind] = useState<InputKind>(firstGuessInput);
  const [stick, setStick] = useState<TouchStick | null>(null);
  const [walkedWith, setWalkedWith] = useState<ReadonlySet<InputKind>>(new Set());
  const [locked, setLocked] = useState(false);

  const setPointOfView = useCallback((view: PointOfView) => {
    state.current.pointOfView = view;
    setShownView(view);
    savePointOfView(view);
    // Third person turns by dragging, so it hands the pointer back.
    if (view === "third" && document.pointerLockElement !== null) document.exitPointerLock();
  }, []);

  useEffect(() => {
    const element = surface.current;
    if (!element) throw new Error("Walking has no surface to listen on");
    const held = new Set<string>();
    let stickDrag: (Drag & { origin: Point }) | null = null;
    const looks = new Map<number, Drag>();
    let pinch: number | null = null;
    let padMoving = false;
    const walked = (by: InputKind, move: Move) => {
      if (move.x === 0 && move.y === 0) return;
      setWalkedWith((before) => (before.has(by) ? before : new Set([...before, by])));
    };
    const switchView = () => {
      setPointOfView(otherView(state.current.pointOfView));
    };
    const isLocked = () => document.pointerLockElement === element;

    const fromKeys = () => {
      state.current.move = keyboardMove(held);
      state.current.running = keyboardRunning(held);
      state.current.turnRate = { yaw: keyboardTurn(held) * LOOK.keys, pitch: 0 };
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === KEY_VIEW) {
        if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTextEntryTarget(event.target)) return;
        setKind("keyboard-mouse");
        switchView();
        return;
      }
      if (!WALK_KEYS.includes(event.code)) return;
      event.preventDefault();
      held.add(event.code);
      setKind("keyboard-mouse");
      fromKeys();
      walked("keyboard-mouse", state.current.move);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(event.code);
      if (WALK_KEYS.includes(event.code)) fromKeys();
    };
    const onBlur = () => {
      held.clear();
      fromKeys();
    };

    const onLockChange = () => {
      setLocked(isLocked());
    };
    const point = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });

    const onPointerDown = (event: PointerEvent) => {
      // Only a press on the scene itself walks or looks; the overlay's own buttons and the debug panel keep theirs.
      if (!(event.target instanceof HTMLCanvasElement)) return;
      const p = point(event);
      if (event.pointerType === "touch") {
        setKind("touch");
        element.setPointerCapture(event.pointerId);
        const rect = element.getBoundingClientRect();
        if (stickDrag === null && p.x - rect.left < rect.width / 2) {
          stickDrag = { id: event.pointerId, last: p, origin: p };
          setStick({ origin: p, knob: p });
          return;
        }
      } else {
        setKind("keyboard-mouse");
        if (state.current.pointOfView === "first") {
          // A refused lock (asked again too soon after Esc) is reported by `pointerlockerror`, and the
          // pointer simply stays free for the next click; the promise's rejection says the same thing again.
          if (!isLocked()) element.requestPointerLock().catch(() => undefined);
          return;
        }
        element.setPointerCapture(event.pointerId);
      }
      looks.set(event.pointerId, { id: event.pointerId, last: p });
      pinch = null;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (isLocked()) {
        setKind("keyboard-mouse");
        state.current.turn.yaw += event.movementX * LOOK.locked;
        state.current.turn.pitch += event.movementY * LOOK.locked;
        return;
      }
      const p = point(event);
      if (stickDrag?.id === event.pointerId) {
        const move = stickMove(stickDrag.origin, p);
        state.current.move = move;
        state.current.running = Math.hypot(move.x, move.y) >= STICK_RUN;
        walked("touch", move);
        stickDrag.last = p;
        setStick({ origin: stickDrag.origin, knob: p });
        return;
      }
      const drag = looks.get(event.pointerId);
      if (!drag) return;
      if (looks.size === 2) {
        const [a, b] = [...looks.values()].map((d) => (d.id === event.pointerId ? p : d.last));
        const spread = spanOf(a, b).spread;
        if (pinch !== null && spread > 0) state.current.zoom *= pinch / spread;
        pinch = spread;
      } else {
        const rate = event.pointerType === "touch" ? LOOK.touch : LOOK.mouse;
        state.current.turn.yaw += (p.x - drag.last.x) * rate;
        state.current.turn.pitch += (p.y - drag.last.y) * rate;
      }
      drag.last = p;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (stickDrag?.id === event.pointerId) {
        stickDrag = null;
        state.current.move = STILL;
        state.current.running = false;
        setStick(null);
        return;
      }
      looks.delete(event.pointerId);
      pinch = null;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setKind("keyboard-mouse");
      state.current.zoom *= Math.exp(event.deltaY * 0.0012);
    };

    const stopPad = subscribeGamepads({
      onFrame(pads) {
        const pad = pads.find((p) => p.standard);
        if (!pad) return;
        const controls = readPad(pad).controls;
        if (!controls) return;
        const using = padInUse(controls);
        if (using) setKind("pad");
        if (using || padMoving) {
          state.current.move = padMove(controls);
          walked("pad", state.current.move);
          state.current.running = padRunning(controls);
          state.current.turnRate = { yaw: controls.rightStick.x * LOOK.stick, pitch: controls.rightStick.y * LOOK.stick * 0.6 };
        }
        padMoving = using;
      },
      onButton(edge) {
        if (edge.name === PAD_VIEW && edge.pressed) switchView();
      },
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockChange);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerUp);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stopPad();
      if (isLocked()) document.exitPointerLock();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockChange);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerUp);
      element.removeEventListener("wheel", onWheel);
    };
  }, [surface, setPointOfView]);

  return { state, kind, stick, walkedWith, pointOfView, setPointOfView, locked };
}
