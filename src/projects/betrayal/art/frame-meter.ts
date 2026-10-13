"use client";

import { useEffect, useRef, useState } from "react";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { isTextEntryTarget } from "@/shared/lib/utils";

/**
 * three.js's frame meter (FPS, frame ms, memory: click it to cycle), the one
 * the art bench shows, for a playtester. A render loop calls `tick` once a
 * frame, so it measures the frames really drawn. Hidden, it has no panel and
 * `tick` does nothing.
 */
export interface FrameMeter {
  tick: () => void;
  /** Shows the meter in `slot`, or hides it (null). */
  show: (slot: HTMLElement | null) => void;
}

export function createFrameMeter(): FrameMeter {
  let stats: Stats | null = null;
  return {
    tick: () => {
      stats?.update();
    },
    show: (slot) => {
      stats?.dom.remove();
      // A fresh meter each time it shows, so the spell it was hidden doesn't count as one slow frame.
      stats = null;
      if (!slot) return;
      stats = new Stats();
      // stats.js pins itself to the page's top-left corner, above everything; here it sits in the slot instead.
      stats.dom.style.position = "static";
      stats.dom.style.zIndex = "";
      slot.appendChild(stats.dom);
    },
  };
}

/** The ~ key, wherever a layout puts it, shifted or not. */
const TOGGLE_KEY = "Backquote";
const SHOWN_KEY = "nw:betrayal:frame-meter";

/** Whether this device last left the meter shown. It shows unless turned off, and storage may be unavailable (a private window). */
function savedShown(): boolean {
  try {
    return localStorage.getItem(SHOWN_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveShown(shown: boolean) {
  try {
    localStorage.setItem(SHOWN_KEY, shown ? "on" : "off");
  } catch {
    // Storage may be unavailable (a private window): the choice then lasts as long as the page.
  }
}

/** Shows `meter` in the returned slot while it is on, toggled with the ~ key and remembered on the device. */
export function useFrameMeter(meter: FrameMeter) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(savedShown);
  useEffect(() => {
    meter.show(shown ? slotRef.current : null);
    saveShown(shown);
    return () => {
      meter.show(null);
    };
  }, [meter, shown]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== TOGGLE_KEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTextEntryTarget(event.target)) return;
      event.preventDefault();
      setShown((was) => !was);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return slotRef;
}
