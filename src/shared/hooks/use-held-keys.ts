"use client";

import { type RefObject, useEffect, useRef } from "react";
import { isTextEntryTarget } from "@/shared/lib/utils";

export interface HeldKeys {
  // Lowercased `KeyboardEvent.key` values of the tracked keys currently down.
  keys: Set<string>;
  shift: boolean;
}

// Tracks which of `tracked` are held, for per-frame movement such as
// keyboard panning. Ignores keys typed into form fields and modifier chords,
// and forgets everything when the window loses focus so no key sticks down.
export function useHeldKeys(tracked: readonly string[]): RefObject<HeldKeys> {
  const held = useRef<HeldKeys>({ keys: new Set(), shift: false });
  const trackedKey = tracked.join(",");

  useEffect(() => {
    const keys = new Set(trackedKey.split(","));
    const state = held.current;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      state.shift = e.shiftKey;
      const k = e.key.toLowerCase();
      if (!keys.has(k)) return;
      e.preventDefault();
      state.keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      state.shift = e.shiftKey;
      state.keys.delete(e.key.toLowerCase());
    };
    const onBlur = (): void => {
      state.keys.clear();
      state.shift = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      onBlur();
    };
  }, [trackedKey]);

  return held;
}
