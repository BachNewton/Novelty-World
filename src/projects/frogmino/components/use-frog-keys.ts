"use client";

import { useEffect } from "react";
import { isTextEntryTarget } from "@/shared/lib/utils";
import type { FrogAction } from "../run";
import { useFrogminoStore } from "../store";

// Physical keys, so the WASD block stays put on other keyboard layouts.
const KEY_ACTIONS = new Map<string, FrogAction>([
  ["KeyA", "left"],
  ["ArrowLeft", "left"],
  ["KeyD", "right"],
  ["ArrowRight", "right"],
  ["KeyQ", "rotateCcw"],
  ["KeyE", "rotateCw"],
  ["Space", "hop"],
  ["KeyW", "forward"],
  ["ArrowUp", "forward"],
  ["KeyS", "back"],
  ["ArrowDown", "back"],
]);

// One key press is one action: held keys don't repeat.
export function useFrogKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      const { act, restart } = useFrogminoStore.getState();
      if (e.code === "KeyR") {
        e.preventDefault();
        if (!e.repeat) restart();
        return;
      }
      const action = KEY_ACTIONS.get(e.code);
      if (action === undefined) return;
      e.preventDefault();
      if (!e.repeat) act(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
