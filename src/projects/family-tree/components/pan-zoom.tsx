"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

interface PanZoomProps {
  contentWidth: number;
  contentHeight: number;
  minScale?: number;
  maxScale?: number;
  refitKey?: string | number;
  onBackgroundPointerDown?: () => void;
  children: ReactNode;
}

interface Transform {
  x: number;
  y: number;
  s: number;
}

interface Point {
  x: number;
  y: number;
}

interface PinchSnapshot {
  dist: number;
  midX: number;
  midY: number;
}

export function PanZoom({
  contentWidth,
  contentHeight,
  minScale = 0.2,
  maxScale = 3,
  refitKey,
  onBackgroundPointerDown,
  children,
}: PanZoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, s: 1 });

  const pointersRef = useRef<Map<number, Point>>(new Map());
  const singleRef = useRef<Point | null>(null);
  const pinchRef = useRef<PinchSnapshot | null>(null);
  const draggedRef = useRef(false);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (contentWidth <= 0 || contentHeight <= 0) {
      setTransform({ x: rect.width / 2, y: rect.height / 2, s: 1 });
      return;
    }
    const padding = 96;
    const sx = (rect.width - padding) / contentWidth;
    const sy = (rect.height - padding) / contentHeight;
    const s = Math.max(minScale, Math.min(1, sx, sy));
    const x = (rect.width - contentWidth * s) / 2;
    const y = (rect.height - contentHeight * s) / 2;
    setTransform({ x, y, s });
  }, [contentWidth, contentHeight, minScale]);

  useEffect(() => { fit(); }, [fit, refitKey]);

  // Wheel listener attached non-passively so we can preventDefault.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTransform((t) => zoomToward(t, factor, cx, cy, minScale, maxScale));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => { el.removeEventListener("wheel", handler); };
  }, [minScale, maxScale]);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    draggedRef.current = false;
    if (pointersRef.current.size === 1) {
      singleRef.current = { x: e.clientX, y: e.clientY };
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
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
      if (Math.abs(dx) + Math.abs(dy) > 2) draggedRef.current = true;
      singleRef.current = { x: e.clientX, y: e.clientY };
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
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
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 1) {
      const [remaining] = [...pointersRef.current.values()];
      singleRef.current = remaining;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 0) {
      singleRef.current = null;
      pinchRef.current = null;
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
