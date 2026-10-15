"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { isDrag, PINCH_START, spanOf, type Point, type Span } from "@/shared/lib/input";
import type { TerritoryId } from "../map";
import { centredOn, clampCamera, keepInView, panBy, startScale, zoomAbout, type Camera, type Size } from "../ui/camera";

/*
 * A board's camera and pointers, whatever the board draws: it fits the box, pans under a drag,
 * pinches and wheels to zoom, and turns a press that barely moved into a tap. What a tap picks is
 * the board's.
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
  zoom: (factor: number) => void;
  pan: (dx: number, dy: number) => void;
  overview: () => void;
  reveal: (territory: TerritoryId) => void;
  /** The point in the middle of the screen, in board units. */
  centre: () => Point;
}

interface Press {
  start: Point;
  last: Point;
}

interface Options {
  ref: Ref<BoardHandle>;
  board: Size;
  /** Where the camera looks first, in board units. */
  start: Point;
  /** The least scale at which the whole board is readable (`startScale`). */
  readable: number;
  locate: (territory: TerritoryId) => Point;
  /** How far inside the box's edge a revealed territory is kept, in CSS pixels. */
  revealMargin: number;
  onTouch: (kind: "touch" | "mouse") => void;
  /** A press that barely moved, at a point of the box. */
  onTap: (at: Point, camera: Camera) => void;
}

export function useBoardCamera({ ref, board, start, readable, locate, revealMargin, onTouch, onTap }: Options) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const sizeRef = useRef<Size | null>(null);
  const setup = useRef({ board, start, readable });

  const update = useCallback((next: (camera: Camera, size: Size, board: Size) => Camera) => {
    const current = cameraRef.current;
    const view = sizeRef.current;
    if (!current || !view) return;
    const moved = next(current, view, setup.current.board);
    cameraRef.current = moved;
    setCamera(moved);
  }, []);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      if (next.width === 0 || next.height === 0) return;
      sizeRef.current = next;
      setSize(next);
      const { board, start, readable } = setup.current;
      const current = cameraRef.current;
      const moved = current ? clampCamera(current, board, next) : centredOn(start, startScale(board, next, readable), board, next);
      cameraRef.current = moved;
      setCamera(moved);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoom: (factor) => update((c, s, b) => zoomAbout(c, factor, { x: s.width / 2, y: s.height / 2 }, b, s)),
      pan: (dx, dy) => update((c, s, b) => panBy(c, dx, dy, b, s)),
      overview: () => update((c, s, b) => clampCamera({ ...c, scale: 0 }, b, s)),
      reveal: (territory) => update((c, s, b) => keepInView(c, locate(territory), revealMargin, b, s)),
      centre: () => {
        const c = cameraRef.current;
        const s = sizeRef.current;
        if (!c || !s) return setup.current.start;
        return { x: (s.width / 2 - c.left) / c.scale, y: (s.height / 2 - c.top) / c.scale };
      },
    }),
    [update, locate, revealMargin],
  );

  const tapRef = useRef(onTap);
  useEffect(() => {
    tapRef.current = onTap;
  });

  // Pointers: one drags the board, two pinch it, a press that barely moves taps.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const presses = new Map<number, Press>();
    let pinch: { start: Span; last: Span; zooming: boolean } | null = null;
    let dragged = false;
    let multi = false;
    const local = (event: PointerEvent | WheelEvent): Point => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const span = () => {
      const [a, b] = [...presses.values()];
      return spanOf(a.last, b.last);
    };
    const down = (event: PointerEvent) => {
      element.setPointerCapture(event.pointerId);
      const point = local(event);
      onTouch(event.pointerType === "touch" ? "touch" : "mouse");
      presses.set(event.pointerId, { start: point, last: point });
      if (presses.size === 2) {
        multi = true;
        const s = span();
        pinch = { start: s, last: s, zooming: false };
      }
    };
    const move = (event: PointerEvent) => {
      const press = presses.get(event.pointerId);
      if (!press) return;
      const from = press.last;
      press.last = local(event);
      if (pinch) {
        const now = span();
        const { start, last } = pinch;
        const zooming = pinch.zooming || (start.spread > 0 && Math.abs(Math.log(now.spread / start.spread)) >= PINCH_START);
        update((c, s, b) => {
          const panned = panBy(c, now.middle.x - last.middle.x, now.middle.y - last.middle.y, b, s);
          return zooming && last.spread > 0 ? zoomAbout(panned, now.spread / last.spread, now.middle, b, s) : panned;
        });
        pinch = { start, last: now, zooming };
        return;
      }
      if (!dragged && isDrag(press.start, press.last)) dragged = true;
      if (dragged) update((c, s, b) => panBy(c, press.last.x - from.x, press.last.y - from.y, b, s));
    };
    const up = (event: PointerEvent, cancelled: boolean) => {
      const press = presses.get(event.pointerId);
      presses.delete(event.pointerId);
      if (presses.size < 2) pinch = null;
      if (presses.size > 0) return;
      const c = cameraRef.current;
      if (press && c && !dragged && !multi && !cancelled && event.button <= 0) tapRef.current(local(event), c);
      dragged = false;
      multi = false;
    };
    const onUp = (event: PointerEvent) => up(event, false);
    const onCancel = (event: PointerEvent) => up(event, true);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      onTouch("mouse");
      const at = local(event);
      update((c, s, b) => zoomAbout(c, Math.exp(-event.deltaY * 0.0015), at, b, s));
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
  }, [update, onTouch]);

  return { box, size, camera };
}
