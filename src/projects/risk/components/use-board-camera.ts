"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { isDrag, type Point } from "@/shared/lib/input";
import type { TerritoryId } from "../map";
import { centreOf, frameBoard, keepInView, panBy, type Camera, type Frame, type Rect, type Size } from "../ui/camera";

/*
 * The board's camera and pointers: it frames the board on the screen (`ui/camera.ts`), pans
 * under a drag or the wheel along the one way the board pans, and turns a press that barely moved
 * into a tap. What a tap picks is the board's.
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
  pan: (dx: number, dy: number) => void;
  reveal: (territory: TerritoryId) => void;
  /** The point in the middle of the screen, in board units. */
  centre: () => Point;
}

interface Options {
  ref: Ref<BoardHandle>;
  board: Size;
  footprints: readonly Rect[];
  touch: number;
  /** What floats over the map, in the box's CSS pixels. */
  overlays: readonly Rect[];
  locate: (territory: TerritoryId) => Point;
  /** How far inside the box's edge a revealed territory is kept, in CSS pixels. */
  revealMargin: number;
  onTouch: (kind: "touch" | "mouse") => void;
  /** A press that barely moved, at a point of the box. */
  onTap: (at: Point, camera: Camera) => void;
}

export function useBoardCamera({ ref, board, footprints, touch, overlays, locate, revealMargin, onTouch, onTap }: Options) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const frameRef = useRef<Frame | null>(null);
  const scene = useRef({ board, footprints, touch, overlays, view: { width: 0, height: 0 } });

  const show = useCallback((next: Frame) => {
    frameRef.current = next;
    setFrame(next);
  }, []);

  // A new screen size or new overlays frame the board afresh, keeping where it was panned to,
  // along the way it pans, while the scale stays the same.
  const reframe = useCallback(() => {
    const current = frameRef.current;
    const next = frameBoard(scene.current);
    if (current?.pan.axis !== next.pan.axis || current.camera.scale !== next.camera.scale || next.pan.axis === "none") return show(next);
    const kept = next.pan.axis === "x" ? { ...next.camera, left: current.camera.left } : { ...next.camera, top: current.camera.top };
    show(panBy({ pan: next.pan, camera: kept }, 0, 0, scene.current.board));
  }, [show]);

  useLayoutEffect(() => {
    scene.current = { ...scene.current, board, footprints, touch, overlays };
    if (scene.current.view.width > 0) reframe();
  }, [board, footprints, touch, overlays, reframe]);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const view = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (view.width === 0 || view.height === 0) return;
      scene.current = { ...scene.current, view };
      setSize(view);
      reframe();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [reframe]);

  const pan = useCallback(
    (dx: number, dy: number) => {
      const current = frameRef.current;
      if (current) show(panBy(current, dx, dy, scene.current.board));
    },
    [show],
  );

  useImperativeHandle(
    ref,
    () => ({
      pan,
      reveal: (territory) => {
        const current = frameRef.current;
        if (current) show(keepInView(current, locate(territory), revealMargin, scene.current));
      },
      centre: () => {
        const current = frameRef.current;
        const { view, board } = scene.current;
        return current ? centreOf(current.camera, view, board) : { x: board.width / 2, y: board.height / 2 };
      },
    }),
    [pan, show, locate, revealMargin],
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
      if (dragged) pan(press.last.x - from.x, press.last.y - from.y);
    };
    const up = (event: PointerEvent, cancelled: boolean) => {
      const press = presses.get(event.pointerId);
      presses.delete(event.pointerId);
      if (presses.size > 0) return;
      const current = frameRef.current;
      if (press && current && !dragged && !multi && !cancelled && event.button <= 0) tapRef.current(local(event), current.camera);
      dragged = false;
      multi = false;
    };
    const onUp = (event: PointerEvent) => up(event, false);
    const onCancel = (event: PointerEvent) => up(event, true);
    // The wheel scrolls the board the way it pans; a board that shows whole leaves the wheel be.
    const wheel = (event: WheelEvent) => {
      const axis = frameRef.current?.pan.axis;
      if (axis === undefined || axis === "none") return;
      event.preventDefault();
      onTouch("mouse");
      if (axis === "x") pan(-(event.deltaX || event.deltaY), 0);
      else pan(0, -event.deltaY);
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

  return { box, size, frame };
}
