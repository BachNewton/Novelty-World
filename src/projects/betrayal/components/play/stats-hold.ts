"use client";

import { useEffect, useState } from "react";
import { subscribeGamepads } from "@/shared/lib/gamepad";

/*
 * Every explorer's stats over the figures, while the player holds them up:
 * Z on the keyboard, the right stick's click (R3) on a controller, or the
 * on-screen Stats button, held as the walls' V, L3 and Walls button are.
 * Stats are hidden otherwise, and shown where they are useful: in a roll's
 * prompt, on damage tracks, as a float on a gain or loss.
 */

/** Held, Z shows the stats, beside V for the walls. */
export const STATS_KEY = "KeyZ";
/** Held, the right stick's click shows the stats, as the left's raises the walls. */
export const STATS_BUTTON = "RS";

type Source = "key" | "pad" | "button";

const typing = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;

/** Whether the stats are held up, and the on-screen button's hold. `padMay` gates a pad that may not act now. */
export function useStatsHold(padMay: (pad: number) => boolean): { held: boolean; hold: (on: boolean) => void } {
  const [sources, setSources] = useState<ReadonlySet<Source>>(new Set());
  const set = (source: Source, on: boolean) => {
    setSources((was) => {
      if (was.has(source) === on) return was;
      const next = new Set(was);
      if (on) next.add(source);
      else next.delete(source);
      return next;
    });
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== STATS_KEY || typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      set("key", true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === STATS_KEY) set("key", false);
    };
    // A key held as the window loses focus never sends its release.
    const blur = () => {
      set("key", false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    const unsubscribe = subscribeGamepads({
      onConnectionChange: (pads) => {
        // A pad unplugged with the button held never sends its release.
        if (pads.length === 0) set("pad", false);
      },
      onButton: (edge) => {
        if (edge.name !== STATS_BUTTON) return;
        // A release always lets go: the pad may have gone idle while it held the button.
        if (edge.pressed && !padMay(edge.pad)) return;
        set("pad", edge.pressed);
      },
    });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      unsubscribe();
    };
  }, [padMay]);

  return {
    held: sources.size > 0,
    hold: (on) => {
      set("button", on);
    },
  };
}
