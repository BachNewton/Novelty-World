"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { gamepadSupport, subscribeGamepads } from "./gamepads";
import { NAV_AT_REST, navStep, type NavHold } from "./navigation";
import { hidePadFocus, padFocusShowing, padMove, padPress, showPadFocus } from "./pad-focus";
import type { ButtonEdge } from "./state";

export interface PadNavigationOptions {
  /** Off while the screen's controls aren't the pads' to move round, e.g.
   *  while the pads are playing. */
  enabled?: boolean;
  /** Each press, before the menu sees it: return true for one the screen has
   *  handled itself, which the menu then ignores. */
  intercept?: (edge: ButtonEdge) => boolean;
  /** Shows the focus as the screen opens, for a screen a pad just opened. */
  reveal?: boolean;
}

/**
 * Every connected controller moves a focus round the controls under `root`
 * (see `pad-focus.ts`): the d-pad or left stick moves it, a held way
 * repeating, A presses the control focused, B the screen's back control and
 * Menu its start control. A screen opened while the focus shows puts it on
 * its starting control at once.
 */
export function usePadNavigation(root: RefObject<HTMLElement | null>, { enabled = true, intercept, reveal = false }: PadNavigationOptions = {}): void {
  const interceptRef = useRef(intercept);
  useEffect(() => {
    interceptRef.current = intercept;
  }, [intercept]);

  useEffect(() => {
    if (!enabled) return;
    if ((reveal || padFocusShowing()) && root.current) showPadFocus(root.current);

    window.addEventListener("keydown", hidePadFocus);
    window.addEventListener("pointerdown", hidePadFocus);
    const holds = new Map<number, NavHold>();
    // The pads are read once per animation frame, so a held direction's
    // repeat is timed on the frames: that is the input, not a delay.
    const unsubscribe = subscribeGamepads({
      onButton: (edge) => {
        if (!edge.pressed || interceptRef.current?.(edge)) return;
        const { name } = edge;
        if (root.current && (name === "A" || name === "B" || name === "Menu")) padPress(root.current, name);
      },
      onFrame: (pads) => {
        const now = performance.now();
        const seen = new Set(pads.map((pad) => pad.index));
        for (const index of holds.keys()) if (!seen.has(index)) holds.delete(index);
        for (const pad of pads) {
          const prev = holds.get(pad.index);
          const { hold, move } = navStep(prev ?? NAV_AT_REST, pad, now);
          holds.set(pad.index, hold);
          // A way already held as the screen opened was meant for the last
          // one: it only brings a hidden focus into view.
          if (move !== null && root.current && (prev !== undefined || !padFocusShowing())) padMove(root.current, move);
        }
      },
    });
    return () => {
      window.removeEventListener("keydown", hidePadFocus);
      window.removeEventListener("pointerdown", hidePadFocus);
      unsubscribe();
    };
  }, [root, enabled, reveal]);
}

function subscribeConnections(onChange: () => void): () => void {
  return subscribeGamepads({ onConnectionChange: onChange });
}

function connectedCount(): number {
  if (gamepadSupport() !== "supported") return 0;
  return navigator.getGamepads().filter((pad) => pad !== null).length;
}

/** Whether a controller is connected, for showing its button hints. */
export function usePadConnected(): boolean {
  return useSyncExternalStore(subscribeConnections, () => connectedCount() > 0, () => false);
}
