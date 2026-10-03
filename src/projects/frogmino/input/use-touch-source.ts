"use client";

import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { InputSink } from "./devices";
import {
  NO_GESTURES,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  type GestureState,
  type GestureStep,
  type PointerSample,
} from "./touch-gestures";

export interface FrogTouchHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
  onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => void;
}

function sample(e: ReactPointerEvent<HTMLElement>): PointerSample {
  const box = e.currentTarget.getBoundingClientRect();
  return { id: e.pointerId, x: e.clientX - box.left, y: e.clientY - box.top };
}

// The touch screen as an input source: the play area's touch gestures (see
// `touch-gestures.ts`), as pointer handlers for the element covering it,
// sending each gesture's actions to the sink as the touch device's. Mouse
// pointers are left alone: the keyboard is the desktop's control.
// `onGesture` hears each tap and each drag step as it fires.
export function useTouchSource(sink: InputSink, onGesture: () => void): FrogTouchHandlers {
  const gestures = useRef<GestureState>(NO_GESTURES);
  const sinkRef = useRef(sink);
  const onGestureRef = useRef(onGesture);
  useEffect(() => {
    sinkRef.current = sink;
    onGestureRef.current = onGesture;
  }, [sink, onGesture]);

  return useMemo((): FrogTouchHandlers => {
    function apply(step: GestureStep): void {
      gestures.current = step.state;
      for (const action of step.actions) sinkRef.current.input("touch", { kind: "act", action });
      if (step.actions.length > 0) onGestureRef.current();
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
}
