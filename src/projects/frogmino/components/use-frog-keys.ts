"use client";

import { useEffect } from "react";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { HELD_KEYS, KEY_ACTIONS } from "../controls";
import { useFrogminoStore } from "../store";

// One key press is one action, and the operating system's key repeat is
// ignored. A held jump or slide key repeats in the rules, on the rules' own
// clock.
export function useFrogKeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      const store = useFrogminoStore.getState();
      if (e.code === "KeyR") {
        e.preventDefault();
        if (!e.repeat) store.restart();
        return;
      }
      const held = HELD_KEYS.get(e.code);
      const action = KEY_ACTIONS.get(e.code);
      if (held === undefined && action === undefined) return;
      e.preventDefault();
      if (e.repeat) return;
      if (held !== undefined) store.press(held);
      if (action !== undefined) store.act(action);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const held = HELD_KEYS.get(e.code);
      if (held !== undefined) useFrogminoStore.getState().release(held);
    };
    // Key releases aren't seen while the window is out of focus, so a key
    // held when it loses focus would otherwise stay held.
    const onBlur = (): void => {
      useFrogminoStore.getState().release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
