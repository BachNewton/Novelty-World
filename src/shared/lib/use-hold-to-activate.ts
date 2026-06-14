"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_DURATION_MS = 700;
// The press must outlast this before any hold affordance shows, so a normal
// quick tap/click never flashes it. The fill then sweeps over the remaining
// (duration − delay) and completes exactly when the hold fires.
const DEFAULT_FILL_DELAY_MS = 200;
// Movement past this many pixels during a press means the user is scrolling or
// dragging, not holding — abort the hold.
const MOVE_CANCEL_PX = 10;

interface Options {
  /** Fires on a normal tap / click (a short press, or a keyboard activation). */
  onActivate: () => void;
  /** Fires once the press has been held still for `durationMs`. */
  onHold: () => void;
  /** How long the press must be held to fire `onHold`. */
  durationMs?: number;
  /** Grace period before the hold affordance appears (`holding` flips true), so
   *  a normal click doesn't flash it. */
  fillDelayMs?: number;
}

interface HoldToActivate {
  /** True once the press has outlasted the grace period — drive a fill/progress
   *  affordance off it. Stays false for a normal tap. */
  holding: boolean;
  /** How long the fill should animate (duration − delay) so it lands exactly
   *  when the hold fires. */
  fillDurationMs: number;
  /** Spread onto the interactive element (a `<button>`). */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onClick: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
  };
}

/** A press-and-hold gesture that works identically on mouse and touch (pointer
 *  events), with no horizontal motion so it never collides with the browser's
 *  swipe-to-go-back. A quick press fires `onActivate`; holding still past
 *  `durationMs` fires `onHold`. Keyboard activation (Enter/Space) maps to
 *  `onActivate` only — holding is inherently a pointer gesture. */
export function useHoldToActivate({
  onActivate,
  onHold,
  durationMs = DEFAULT_DURATION_MS,
  fillDelayMs = DEFAULT_FILL_DELAY_MS,
}: Options): HoldToActivate {
  const [holding, setHolding] = useState(false);
  // Two timers per press: `fill` reveals the affordance after the grace period,
  // `hold` fires the action at the full duration.
  const fillTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  // Set once the hold timer fires this gesture, so the click the browser still
  // synthesizes on pointer-up is swallowed instead of also activating.
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    for (const ref of [fillTimerRef, holdTimerRef]) {
      if (ref.current !== null) {
        window.clearTimeout(ref.current);
        ref.current = null;
      }
    }
  }, []);

  // Stop an in-flight hold (released early or cancelled) without firing it.
  const abort = useCallback(() => {
    clearTimer();
    startRef.current = null;
    setHolding(false);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Capture so move/up still reach this element if a mouse/pen drifts off
      // mid-hold. Skipped for touch — touch already implicitly captures, and an
      // explicit capture there can suppress the list's native scroll.
      if (e.pointerType !== "touch") e.currentTarget.setPointerCapture(e.pointerId);
      firedRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      fillTimerRef.current = window.setTimeout(() => {
        fillTimerRef.current = null;
        setHolding(true);
      }, fillDelayMs);
      holdTimerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        startRef.current = null;
        holdTimerRef.current = null;
        setHolding(false);
        onHold();
      }, durationMs);
    },
    [clearTimer, durationMs, fillDelayMs, onHold],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = startRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) abort();
    },
    [abort],
  );

  const onPointerUp = useCallback(() => {
    // A completed hold leaves firedRef set so the trailing click is swallowed;
    // a short press aborts the pending hold and lets the click activate.
    if (!firedRef.current) abort();
  }, [abort]);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault();
        firedRef.current = false;
        return;
      }
      onActivate();
    },
    [onActivate],
  );

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    // Suppress the long-press / right-click menu so it doesn't fight the hold.
    e.preventDefault();
  }, []);

  return {
    holding,
    fillDurationMs: durationMs - fillDelayMs,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: abort,
      onClick,
      onContextMenu,
    },
  };
}
