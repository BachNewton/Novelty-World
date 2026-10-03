"use client";

import { useEffect, useRef } from "react";
import { isTextEntryTarget } from "@/shared/lib/utils";
import type { InputSink } from "./devices";
import { focusLost, keyDown, keyUp, RESTART_KEY, type KeyboardLayout } from "./keyboard";

// The keyboard as an input source: its keys' inputs, by device, to the sink.
// The operating system's key repeat is ignored: a held jump or slide repeats
// in the rules.
export function useKeyboardSource(layout: KeyboardLayout, sink: InputSink): void {
  const sinkRef = useRef(sink);
  useEffect(() => {
    sinkRef.current = sink;
  }, [sink]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      if (e.code === RESTART_KEY) {
        e.preventDefault();
        if (!e.repeat) sinkRef.current.restart();
        return;
      }
      const heard = keyDown(layout, e.code);
      if (heard === null) return;
      e.preventDefault();
      if (!e.repeat) sinkRef.current.input(heard.device, heard.input);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const heard = keyUp(layout, e.code);
      if (heard !== null) sinkRef.current.input(heard.device, heard.input);
    };
    const onBlur = (): void => {
      for (const { device, input } of focusLost(layout)) sinkRef.current.input(device, input);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [layout]);
}
