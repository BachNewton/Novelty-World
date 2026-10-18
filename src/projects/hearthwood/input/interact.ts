"use client";

import { useEffect, useRef, type RefObject } from "react";
import { subscribeGamepads, type StandardButton } from "@/shared/lib/gamepad";
import { isDrag, type InputKind, type Point } from "@/shared/lib/input";
import { isTextEntryTarget } from "@/shared/lib/utils";

/*
 * Interacting with what Elliott is near, beside walking: F or the
 * controller's X uses the thing offered (picks a berry, pets a cat), R or
 * the controller's B holds out a treat to the animal offered, and a tap on
 * the scene on touch uses the thing tapped; Tab or the controller's Y opens
 * and closes the basket, and C or the controller's left bumper the
 * companions; G or the controller's left trigger throws the stick in
 * Elliott's hand. Each is heard as one press, never a hold. What is offered,
 * whatever it is, is one choice among everything near (see gameplay's
 * offering), so one press always means one thing.
 */

export const KEY_INTERACT = "KeyF";
export const PAD_INTERACT: StandardButton = "X";
export const KEY_TREAT = "KeyR";
export const PAD_TREAT: StandardButton = "B";
export const KEY_BASKET = "Tab";
export const PAD_BASKET: StandardButton = "Y";
export const KEY_COMPANIONS = "KeyC";
export const PAD_COMPANIONS: StandardButton = "LB";
export const KEY_JOURNAL = "KeyJ";
export const PAD_JOURNAL: StandardButton = "RB";
export const KEY_THROW = "KeyG";
export const PAD_THROW: StandardButton = "LT";

export interface InteractListeners {
  /** Use what is offered, from a key or a pad. */
  onInteract: (by: InputKind) => void;
  /** Hold out a treat to the animal offered. */
  onTreat: (by: InputKind) => void;
  /** A tap on the scene, where it landed on the screen. */
  onTap: (at: Point) => void;
  onBasket: (by: InputKind) => void;
  onCompanions: (by: InputKind) => void;
  onJournal: (by: InputKind) => void;
  /** Throw the stick in Elliott's hand. */
  onThrow: (by: InputKind) => void;
}

export function useInteractInput(surface: RefObject<HTMLElement | null>, listeners: InteractListeners): void {
  const latest = useRef(listeners);
  useEffect(() => {
    latest.current = listeners;
  });

  useEffect(() => {
    const element = surface.current;
    if (!element) throw new Error("Interacting has no surface to listen on");
    const downs = new Map<number, Point>();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTextEntryTarget(event.target)) return;
      if (event.code === KEY_INTERACT) latest.current.onInteract("keyboard-mouse");
      if (event.code === KEY_TREAT) latest.current.onTreat("keyboard-mouse");
      if (event.code === KEY_COMPANIONS) latest.current.onCompanions("keyboard-mouse");
      if (event.code === KEY_JOURNAL) latest.current.onJournal("keyboard-mouse");
      if (event.code === KEY_THROW) latest.current.onThrow("keyboard-mouse");
      if (event.code === KEY_BASKET) {
        // Tab would otherwise move the page's focus.
        event.preventDefault();
        latest.current.onBasket("keyboard-mouse");
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" && event.target instanceof HTMLCanvasElement) downs.set(event.pointerId, { x: event.clientX, y: event.clientY });
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = downs.get(event.pointerId);
      downs.delete(event.pointerId);
      const at = { x: event.clientX, y: event.clientY };
      if (start && !isDrag(start, at)) latest.current.onTap(at);
    };
    const onPointerCancel = (event: PointerEvent) => {
      downs.delete(event.pointerId);
    };
    const stopPad = subscribeGamepads({
      onButton(edge) {
        if (!edge.pressed) return;
        if (edge.name === PAD_INTERACT) latest.current.onInteract("pad");
        if (edge.name === PAD_TREAT) latest.current.onTreat("pad");
        if (edge.name === PAD_BASKET) latest.current.onBasket("pad");
        if (edge.name === PAD_COMPANIONS) latest.current.onCompanions("pad");
        if (edge.name === PAD_JOURNAL) latest.current.onJournal("pad");
        if (edge.name === PAD_THROW) latest.current.onThrow("pad");
      },
    });

    window.addEventListener("keydown", onKeyDown);
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointerup", onPointerUp);
    element.addEventListener("pointercancel", onPointerCancel);
    return () => {
      stopPad();
      window.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [surface]);
}
