"use client";

import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useFrogminoStore } from "../store";
import {
  holdDeadline,
  NO_GESTURES,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  timeReached,
  type GestureState,
  type GestureStep,
  type PointerSample,
  type TouchCommand,
} from "../touch-gestures";

export interface FrogTouchHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => void;
}

// Touch drives the same store actions as the keyboard: a held centre is a
// held W.
function perform(command: TouchCommand): void {
  const store = useFrogminoStore.getState();
  switch (command.kind) {
    case "act":
      store.act(command.action);
      return;
    case "holdJump":
      store.pressJump("forward");
      return;
    case "releaseJump":
      store.releaseJump("forward");
      return;
  }
}

function sample(e: ReactPointerEvent<HTMLElement>): PointerSample {
  const box = e.currentTarget.getBoundingClientRect();
  return { id: e.pointerId, x: e.clientX - box.left, y: e.clientY - box.top, time: e.timeStamp };
}

// The play area's touch gestures (see `touch-gestures.ts`), as pointer
// handlers for the element covering it. Mouse pointers are left alone: the
// keyboard is the desktop's control. `onGesture` hears each tap, move, swipe
// or hold as it fires.
export function useFrogTouch(onGesture: () => void): FrogTouchHandlers {
  const gestures = useRef<GestureState>(NO_GESTURES);
  const holdTimer = useRef<number | null>(null);
  const onGestureRef = useRef(onGesture);
  useEffect(() => {
    onGestureRef.current = onGesture;
  }, [onGesture]);

  const handlers = useMemo((): FrogTouchHandlers => {
    // A still finger makes no events, so the hold delay is the one thing
    // waited on with a timer: the long-press threshold itself. `timeStamp`
    // and `performance.now()` share a clock.
    function scheduleHold(): void {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      const deadline = holdDeadline(gestures.current);
      if (deadline === null) return;
      holdTimer.current = window.setTimeout(
        () => {
          holdTimer.current = null;
          apply(timeReached(gestures.current, performance.now()));
        },
        Math.max(0, deadline - performance.now()),
      );
    }

    function apply(step: GestureStep): void {
      gestures.current = step.state;
      for (const command of step.commands) perform(command);
      if (step.commands.some((command) => command.kind !== "releaseJump")) onGestureRef.current();
      scheduleHold();
    }

    const isTouchLike = (e: ReactPointerEvent<HTMLElement>): boolean => e.pointerType !== "mouse";

    return {
      onPointerDown: (e) => {
        if (!isTouchLike(e)) return;
        // Keeps the finger's events coming here even when it slides over the
        // mute button or off the edge.
        e.currentTarget.setPointerCapture(e.pointerId);
        apply(pointerDown(gestures.current, sample(e), e.currentTarget.clientWidth));
      },
      onPointerMove: (e) => {
        if (isTouchLike(e)) apply(pointerMove(gestures.current, sample(e)));
      },
      onPointerUp: (e) => {
        if (isTouchLike(e)) apply(pointerUp(gestures.current, sample(e)));
      },
      onPointerCancel: (e) => {
        apply(pointerCancel(gestures.current, e.pointerId));
      },
      // Fires after pointerup too, by which time the finger is already gone.
      onLostPointerCapture: (e) => {
        apply(pointerCancel(gestures.current, e.pointerId));
      },
    };
  }, []);

  // Leaving the game mid-hold lets go of the jump.
  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      for (const id of gestures.current.fingers.keys()) {
        for (const command of pointerCancel(gestures.current, id).commands) perform(command);
      }
      gestures.current = NO_GESTURES;
    },
    [],
  );

  return handlers;
}
