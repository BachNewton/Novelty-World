"use client";

import { useEffect } from "react";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { JUMP_KEYS, KEY_ACTIONS } from "../controls";
import { useFrogminoStore } from "../store";

// One key press is one action, and the operating system's key repeat is
// ignored. A held jump key repeats in the rules, on the rules' own clock.
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
      const jump = JUMP_KEYS.get(e.code);
      const action = KEY_ACTIONS.get(e.code);
      if (jump === undefined && action === undefined) return;
      e.preventDefault();
      if (e.repeat) return;
      if (jump !== undefined) store.pressJump(jump);
      if (action !== undefined) store.act(action);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const jump = JUMP_KEYS.get(e.code);
      if (jump !== undefined) useFrogminoStore.getState().releaseJump(jump);
    };
    // Key releases aren't seen while the window is out of focus, so a key
    // held when it loses focus would otherwise stay held.
    const onBlur = (): void => {
      useFrogminoStore.getState().releaseJump();
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
