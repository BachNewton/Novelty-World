"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { isTextEntryTarget } from "@/shared/lib/utils";

export interface PanZoomHandle {
  // Glides the view, keeping the zoom, until the content point sits at
  // `anchor`: a position given as fractions of the viewport's width and
  // height. The default anchor is the center.
  panTo: (point: Point, anchor?: Point) => void;
}

interface PanZoomProps {
  contentWidth: number;
  contentHeight: number;
  minScale?: number;
  maxScale?: number;
  // Content point to center on, once, the first time it's provided.
  initialFocus?: Point;
  onBackgroundPointerDown?: () => void;
  ref?: Ref<PanZoomHandle>;
  children: ReactNode;
}

interface Transform {
  x: number;
  y: number;
  s: number;
}

export interface Point {
  x: number;
  y: number;
}

const GLIDE_MS = 350;
const VIEWPORT_CENTER: Point = { x: 0.5, y: 0.5 };

interface PinchSnapshot {
  dist: number;
  midX: number;
  midY: number;
}

export function PanZoom({
  contentWidth,
  contentHeight,
  minScale = 0.1,
  maxScale = 3,
  initialFocus,
  onBackgroundPointerDown,
  ref,
  children,
}: PanZoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, s: 1 });

  const pointersRef = useRef<Map<number, Point>>(new Map());
  const singleRef = useRef<Point | null>(null);
  const pinchRef = useRef<PinchSnapshot | null>(null);
  const draggedRef = useRef(false);

  const glideRef = useRef<number | null>(null);
  const stopGlide = useCallback((): void => {
    if (glideRef.current === null) return;
    cancelAnimationFrame(glideRef.current);
    glideRef.current = null;
  }, []);
  useEffect(() => stopGlide, [stopGlide]);

  const panTo = useCallback(
    (point: Point, anchor: Point, glide: boolean): void => {
      const el = containerRef.current;
      if (!el) return;
      stopGlide();
      const rect = el.getBoundingClientRect();
      // Scales the offset from the target position by `remaining` (0 lands
      // exactly). Recomputing the target from the live scale each frame,
      // rather than interpolating from a fixed start, keeps it on target even
      // if the scale changes mid-glide.
      const approach = (t: Transform, remaining: number): Transform => {
        const x = rect.width * anchor.x - point.x * t.s;
        const y = rect.height * anchor.y - point.y * t.s;
        return { ...t, x: x + (t.x - x) * remaining, y: y + (t.y - y) * remaining };
      };
      if (!glide || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setTransform((t) => approach(t, 0));
        return;
      }
      const start = performance.now();
      let prevRemaining = 1;
      const step = (now: number): void => {
        // A frame's timestamp can predate the performance.now() taken when
        // the glide was requested, hence the clamp at 0.
        const progress = Math.min(1, Math.max(0, (now - start) / GLIDE_MS));
        const remaining = (1 - progress) ** 3; // ease-out cubic
        const ratio = remaining / prevRemaining;
        prevRemaining = remaining;
        setTransform((t) => approach(t, ratio));
        glideRef.current = progress < 1 ? requestAnimationFrame(step) : null;
      };
      glideRef.current = requestAnimationFrame(step);
    },
    [stopGlide],
  );

  useImperativeHandle(ref, () => ({
    panTo: (point, anchor = VIEWPORT_CENTER) => { panTo(point, anchor, true); },
  }), [panTo]);

  const centeredRef = useRef(false);
  useEffect(() => {
    if (!initialFocus || centeredRef.current) return;
    centeredRef.current = true;
    panTo(initialFocus, VIEWPORT_CENTER, false);
  }, [initialFocus, panTo]);

  // Wheel listener attached non-passively so we can preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      stopGlide();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTransform((t) => zoomToward(t, factor, cx, cy, minScale, maxScale));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => { el.removeEventListener("wheel", handler); };
  }, [minScale, maxScale, stopGlide]);

  // Keyboard pan (WASD) and zoom (-/+). Tracks held keys and runs an rAF loop
  // while any are pressed so the motion is smooth and resolution-independent.
  useEffect(() => {
    const pressed = new Set<string>();
    let raf: number | null = null;
    let lastTime = 0;

    const PAN_SPEED = 700; // screen px per second
    const PAN_BOOST = 3; // multiplier when shift is held
    const ZOOM_RATE = 1.8; // multiplicative factor per second
    let shiftHeld = false;

    const tick = (now: number): void => {
      const dt = lastTime === 0 ? 16 : Math.min(50, now - lastTime);
      lastTime = now;

      let dx = 0;
      let dy = 0;
      let zoomFactor = 1;
      const seconds = dt / 1000;
      const panStep = PAN_SPEED * seconds * (shiftHeld ? PAN_BOOST : 1);
      if (pressed.has("w")) dy += panStep;
      if (pressed.has("s")) dy -= panStep;
      if (pressed.has("a")) dx += panStep;
      if (pressed.has("d")) dx -= panStep;
      if (pressed.has("+")) zoomFactor *= Math.pow(ZOOM_RATE, seconds);
      if (pressed.has("-")) zoomFactor /= Math.pow(ZOOM_RATE, seconds);

      if (dx !== 0 || dy !== 0 || zoomFactor !== 1) {
        const el = containerRef.current;
        const rect = el?.getBoundingClientRect();
        const cx = rect ? rect.width / 2 : 0;
        const cy = rect ? rect.height / 2 : 0;
        setTransform((t) => {
          let next: Transform = { x: t.x + dx, y: t.y + dy, s: t.s };
          if (zoomFactor !== 1) {
            next = zoomToward(next, zoomFactor, cx, cy, minScale, maxScale);
          }
          return next;
        });
      }

      if (pressed.size > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
        lastTime = 0;
      }
    };

    const startLoop = (): void => {
      stopGlide();
      if (raf !== null) return;
      lastTime = 0;
      raf = requestAnimationFrame(tick);
    };

    const keyToken = (e: KeyboardEvent): string | null => {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "a" || k === "s" || k === "d") return k;
      if (e.key === "+" || e.key === "=") return "+";
      if (e.key === "-" || e.key === "_") return "-";
      return null;
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextEntryTarget(e.target)) return;
      shiftHeld = e.shiftKey;
      const token = keyToken(e);
      if (token === null) return;
      e.preventDefault();
      if (e.repeat) return;
      pressed.add(token);
      startLoop();
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      shiftHeld = e.shiftKey;
      const token = keyToken(e);
      if (token !== null) pressed.delete(token);
    };

    const clearPressed = (): void => { pressed.clear(); shiftHeld = false; };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearPressed);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearPressed);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [minScale, maxScale, stopGlide]);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    stopGlide();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draggedRef.current = false;
    if (pointersRef.current.size === 1) {
      // Defer setPointerCapture until movement crosses the drag threshold —
      // capturing here would redirect the follow-up `click` event away from
      // the original target (e.g. a node), breaking child onClick handlers.
      singleRef.current = { x: e.clientX, y: e.clientY };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      // For pinch we want capture immediately so a finger sliding off the
      // container doesn't drop the gesture.
      e.currentTarget.setPointerCapture(e.pointerId);
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = computePinch(a, b);
      singleRef.current = null;
    }
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1 && singleRef.current) {
      const dx = e.clientX - singleRef.current.x;
      const dy = e.clientY - singleRef.current.y;
      if (!draggedRef.current && Math.abs(dx) + Math.abs(dy) > 2) {
        draggedRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      singleRef.current = { x: e.clientX, y: e.clientY };
      if (draggedRef.current) {
        setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
      }
    } else if (pointersRef.current.size === 2 && pinchRef.current) {
      const el = containerRef.current;
      if (!el) return;
      const [a, b] = [...pointersRef.current.values()];
      const cur = computePinch(a, b);
      const factor = cur.dist / pinchRef.current.dist;
      const rect = el.getBoundingClientRect();
      const localMidX = cur.midX - rect.left;
      const localMidY = cur.midY - rect.top;
      const dx = cur.midX - pinchRef.current.midX;
      const dy = cur.midY - pinchRef.current.midY;
      draggedRef.current = true;
      setTransform((t) => {
        const zoomed = zoomToward(t, factor, localMidX, localMidY, minScale, maxScale);
        return { ...zoomed, x: zoomed.x + dx, y: zoomed.y + dy };
      });
      pinchRef.current = cur;
    }
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const wasDragging = draggedRef.current;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 1) {
      const [remaining] = [...pointersRef.current.values()];
      singleRef.current = remaining;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      singleRef.current = null;
      pinchRef.current = null;
    }

    // After a drag-pan, the browser still fires `click` on whatever element
    // pointerdown started on. Swallow it in the capture phase so dragging
    // off a node doesn't also select it.
    if (wasDragging && pointersRef.current.size === 0) {
      const el = containerRef.current;
      if (el) {
        const suppress = (ev: Event): void => {
          ev.stopPropagation();
          el.removeEventListener("click", suppress, true);
        };
        el.addEventListener("click", suppress, true);
        window.setTimeout(() => {
          el.removeEventListener("click", suppress, true);
        }, 250);
      }
    }
  }

  function handleBackgroundPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onBackgroundPointerDown?.();
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden touch-none select-none"
      onPointerDown={(e) => {
        handleBackgroundPointerDown(e);
        handlePointerDown(e);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.s})`,
          width: contentWidth,
          height: contentHeight,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function computePinch(a: Point, b: Point): PinchSnapshot {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { dist: Math.hypot(dx, dy), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
}

function zoomToward(
  t: Transform,
  factor: number,
  cx: number,
  cy: number,
  minScale: number,
  maxScale: number,
): Transform {
  const newS = Math.max(minScale, Math.min(maxScale, t.s * factor));
  const actual = newS / t.s;
  return {
    s: newS,
    x: cx - (cx - t.x) * actual,
    y: cy - (cy - t.y) * actual,
  };
}
