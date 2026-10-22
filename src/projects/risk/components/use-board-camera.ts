"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { isDrag, type Point } from "@/shared/lib/input";
import type { TerritoryId } from "../map";
import { centreOf, keepInView, panBy, type Frame, type ScreenLayout, type Size } from "../ui/camera";

/*
 * The board's camera and pointers: it shows the board where the screen's layout puts it
 * (`ui/camera.ts`), pans it across under a drag or the wheel when it pans, and turns a press that
 * barely moved into a tap. What a tap picks is the board's.
 */

/** What a board lights: the screen's picks, read from the options (`ui/selection.ts`). */
export interface Marks {
  /** The territories the step asks for, lit. */
  choices: ReadonlySet<TerritoryId>;
  /** Territories a pick would switch the selection to, lit faintly. */
  also: ReadonlySet<TerritoryId>;
  selected: readonly TerritoryId[];
  /** Whether a pick is wanted at all: then everything else dims. */
  picking: boolean;
}

export interface BoardHandle {
  /** Pans the board across, when it pans. */
  pan: (dx: number) => void;
  reveal: (territory: TerritoryId) => void;
  /** The point in the middle of the screen, in board units. */
  centre: () => Point;
}

interface Options {
  ref: Ref<BoardHandle>;
  board: Size;
  /** Where the screen puts the board, or null until the screen has its size. */
  screen: ScreenLayout | null;
  locate: (territory: TerritoryId) => Point;
  /** How far inside the board's span a revealed territory is kept, in CSS pixels. */
  revealMargin: number;
  onTouch: (kind: "touch" | "mouse") => void;
  /** A press that barely moved, at a point of the box. */
  onTap: (at: Point, frame: Frame) => void;
}

export function useBoardCamera({ ref, board, screen, locate, revealMargin, onTouch, onTap }: Options) {
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const frameRef = useRef<Frame | null>(null);

  const show = useCallback((next: Frame) => {
    frameRef.current = next;
    setFrame(next);
  }, []);

  // A new layout places the board afresh, keeping how far it was panned across while it pans at
  // the same scale.
  useLayoutEffect(() => {
    if (!screen) return;
    const current = frameRef.current;
    const next = screen.frame;
    if (next.pan.axis === "x" && current?.pan.axis === "x" && current.camera.scale === next.camera.scale) show(panBy({ ...next, camera: { ...next.camera, left: current.camera.left } }, 0, board));
    else show(next);
  }, [screen, board, show]);

  const pan = useCallback(
    (dx: number) => {
      const current = frameRef.current;
      if (current) show(panBy(current, dx, board));
    },
    [show, board],
  );

  useImperativeHandle(
    ref,
    () => ({
      pan,
      reveal: (territory) => {
        const current = frameRef.current;
        if (current) show(keepInView(current, locate(territory), revealMargin, board));
      },
      centre: () => {
        const current = frameRef.current;
        return current && screen ? centreOf(current, screen.view, board) : { x: board.width / 2, y: board.height / 2 };
      },
    }),
    [pan, show, locate, revealMargin, board, screen],
  );

  const tapRef = useRef(onTap);
  useEffect(() => {
    tapRef.current = onTap;
  });

  // Pointers: one drags the board, and a press that barely moves taps. A second finger only
  // keeps the press from counting as a tap: there is no zoom to pinch.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const presses = new Map<number, { start: Point; last: Point }>();
    let dragged = false;
    let multi = false;
    const local = (event: PointerEvent | WheelEvent): Point => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const down = (event: PointerEvent) => {
      element.setPointerCapture(event.pointerId);
      const point = local(event);
      onTouch(event.pointerType === "touch" ? "touch" : "mouse");
      presses.set(event.pointerId, { start: point, last: point });
      if (presses.size > 1) multi = true;
    };
    const move = (event: PointerEvent) => {
      const press = presses.get(event.pointerId);
      if (!press || multi) return;
      const from = press.last;
      press.last = local(event);
      if (!dragged && isDrag(press.start, press.last)) dragged = true;
      if (dragged) pan(press.last.x - from.x);
    };
    const up = (event: PointerEvent, cancelled: boolean) => {
      const press = presses.get(event.pointerId);
      presses.delete(event.pointerId);
      if (presses.size > 0) return;
      const current = frameRef.current;
      if (press && current && !dragged && !multi && !cancelled && event.button <= 0) tapRef.current(local(event), current);
      dragged = false;
      multi = false;
    };
    const onUp = (event: PointerEvent) => up(event, false);
    const onCancel = (event: PointerEvent) => up(event, true);
    // The wheel scrolls the board across when it pans; a board that shows whole leaves it be.
    const wheel = (event: WheelEvent) => {
      if (frameRef.current?.pan.axis !== "x") return;
      event.preventDefault();
      onTouch("mouse");
      pan(-(event.deltaX || event.deltaY));
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onCancel);
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onCancel);
      element.removeEventListener("wheel", wheel);
    };
  }, [pan, onTouch]);

  return { box, frame };
}
