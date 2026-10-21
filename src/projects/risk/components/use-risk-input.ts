"use client";

import { useEffect, useRef } from "react";
import { NAV_AT_REST, navStep, readPad, subscribeGamepads, type Direction, type NavHold } from "@/shared/lib/gamepad";
import type { InputKind } from "@/shared/lib/input";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { KEY_CODES } from "../ui/bindings";

/*
 * The keyboard and the controllers, each complete on its own, turned into the screen's intents.
 * Touch and the mouse act on the map (`graph-board.tsx`) and on buttons directly. Each control
 * means one thing everywhere (`ui/bindings.ts`); where the focus is decides only what "move the
 * focus" and "press it" reach:
 *
 * - the map, while a territory is to be picked: the d-pad, left stick and arrow keys move between
 *   the territories on offer, A, Enter and Space pick one, B and Esc back out;
 * - the status box's buttons, while it asks for an amount or the dice: the site's menu
 *   navigation moves round them (`usePadNavigation`), and the keyboard's Tab. Enter on anything
 *   but a button (the slider, once a click or drag has focused it) presses the box's main action;
 * - a dialog, while one is open, the same way.
 */

export type FocusZone = "map" | "box" | "dialog";

export interface InputIntents {
  zone: () => FocusZone;
  usedInput: (kind: InputKind, byKeys?: boolean) => void;
  moveFocus: (direction: Direction) => void;
  cycleFocus: (step: 1 | -1) => void;
  pickFocus: () => void;
  confirm: () => void;
  back: () => void;
  closeDialog: () => void;
  endPhase: () => void;
  menu: () => void;
  log: () => void;
  less: () => void;
  more: () => void;
  dice: (count: 1 | 2 | 3) => void;
  blitz: () => void;
  pan: (dx: number, dy: number) => void;
}

const KEY_PAN = 70;
/** CSS pixels a second the right stick pans at full tilt. */
const STICK_PAN = 900;

const ARROWS: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

export function useRiskInput(intents: InputIntents): void {
  const ref = useRef(intents);
  useEffect(() => {
    ref.current = intents;
  });

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const it = ref.current;
      const { code } = event;
      const zone = it.zone();
      const onButton = event.target instanceof HTMLButtonElement;
      const handled = (fn: () => void) => {
        event.preventDefault();
        it.usedInput("keyboard-mouse", true);
        fn();
      };
      if (code === KEY_CODES.endPhase) return handled(() => !event.repeat && it.endPhase());
      if (code === KEY_CODES.menu) return handled(() => !event.repeat && it.menu());
      if (zone === "dialog") {
        if (code === "Escape") handled(it.closeDialog);
        else if (code === KEY_CODES.less) handled(it.less);
        else if (code === KEY_CODES.more) handled(it.more);
        else it.usedInput("keyboard-mouse", true);
        return;
      }
      if (code === "Escape") return handled(it.back);
      if (code === KEY_CODES.log) return handled(it.log);
      if (code === KEY_CODES.less) return handled(it.less);
      if (code === KEY_CODES.more) return handled(it.more);
      if (code === KEY_CODES.blitz) return handled(it.blitz);
      if (code in KEY_CODES.dice) return handled(() => it.dice(KEY_CODES.dice[code]));
      if (code in KEY_CODES.pan) {
        const [x, y] = KEY_CODES.pan[code];
        return handled(() => it.pan(-x * KEY_PAN, -y * KEY_PAN));
      }
      const enter = code === "Enter" || code === "NumpadEnter";
      if (zone === "box" && enter && !onButton) return handled(() => !event.repeat && it.confirm());
      if (zone !== "map") {
        it.usedInput("keyboard-mouse", true);
        return;
      }
      if (code in ARROWS) return handled(() => it.moveFocus(ARROWS[code]));
      if (code === "Tab") return handled(() => it.cycleFocus(event.shiftKey ? -1 : 1));
      if ((enter || code === "Space") && !onButton) return handled(() => !event.repeat && it.pickFocus());
      it.usedInput("keyboard-mouse", true);
    };
    window.addEventListener("keydown", keyDown);

    const holds = new Map<number, NavHold>();
    let last = performance.now();
    const unsubscribe = subscribeGamepads({
      onButton: (edge) => {
        const it = ref.current;
        if (!edge.pressed || edge.name === null) return;
        it.usedInput("pad");
        const zone = it.zone();
        if (edge.name === "X") return it.endPhase();
        if (edge.name === "Menu") return it.menu();
        if (edge.name === "LB") return it.less();
        if (edge.name === "RB") return it.more();
        if (zone === "dialog") return;
        if (zone !== "map") return;
        if (edge.name === "A") return it.pickFocus();
        if (edge.name === "B") return it.back();
      },
      // The pads are read once per animation frame: the right stick pans the board as long as it
      // is held, and a held d-pad repeats on the frames.
      onFrame: (pads) => {
        const now = performance.now();
        const delta = Math.min(0.1, (now - last) / 1000);
        last = now;
        const it = ref.current;
        const zone = it.zone();
        for (const pad of pads) {
          const controls = readPad(pad).controls;
          if (!controls) continue;
          const { rightStick } = controls;
          if (zone !== "dialog" && (rightStick.x !== 0 || rightStick.y !== 0)) {
            it.usedInput("pad");
            it.pan(-rightStick.x * STICK_PAN * delta, -rightStick.y * STICK_PAN * delta);
          }
          const { hold, move } = navStep(holds.get(pad.index) ?? NAV_AT_REST, zone === "map" ? pad : null, now);
          holds.set(pad.index, hold);
          if (move !== null) {
            it.usedInput("pad");
            it.moveFocus(move);
          }
        }
      },
    });
    return () => {
      window.removeEventListener("keydown", keyDown);
      unsubscribe();
    };
  }, []);
}
