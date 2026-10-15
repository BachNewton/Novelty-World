"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { isDrag, PINCH_START, pointAt, spanOf, type Point, type Span } from "@/shared/lib/input";
import { BOARD_HEIGHT, BOARD_WIDTH, CONTINENT_OUTLINES, EDGE_LINE, SEA_LINES, TERRITORY_SHAPES } from "../board/board-data";
import type { GameView, Seat } from "../contract";
import { TERRITORIES, type TerritoryId } from "../map";
import { centredOn, clampCamera, keepInView, panBy, startScale, toScreen, zoomAbout, type Camera, type Size } from "../ui/camera";
import { territoryName } from "../ui/describe";
import { SEAT_LOOKS, seatColour, shapePath } from "../ui/seats";

/*
 * The board: our own map, the seats' inks on it, an army marker on every territory, and the
 * territories the player may pick lit in brass. It pans and zooms under a finger, the mouse and
 * a controller alike; what picking does is the screen's (`ui/selection.ts`).
 */

const BOARD: Size = { width: BOARD_WIDTH, height: BOARD_HEIGHT };
const IDS = TERRITORIES.map((t) => t.id);

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
  /** The territory nearest the middle of the screen, in board units. */
  centre: () => Point;
}

interface Props {
  view: GameView;
  marks: Marks;
  focus: TerritoryId | null;
  showFocus: boolean;
  /** A marker's size on the screen, in CSS pixels. */
  markerSize: number;
  onPick: (territory: TerritoryId) => void;
  onTouch: (kind: "touch" | "mouse") => void;
  /** Changes when the board was just dealt, to play the deal. */
  dealKey: number;
}

const HATCHES = SEAT_LOOKS.map((look) => look.hatch);

/** The hatchings over a seat's territories, in board units so they scale with the map. */
function Hatches() {
  const line = { stroke: "var(--rk-ink)", strokeOpacity: 0.32, strokeWidth: 0.9 };
  return (
    <defs>
      <pattern id="rk-hatch-diagonal" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" {...line} />
      </pattern>
      <pattern id="rk-hatch-horizontal" width="5" height="5" patternUnits="userSpaceOnUse">
        <line x1="0" y1="2.5" x2="5" y2="2.5" {...line} />
      </pattern>
      <pattern id="rk-hatch-vertical" width="5" height="5" patternUnits="userSpaceOnUse">
        <line x1="2.5" y1="0" x2="2.5" y2="5" {...line} />
      </pattern>
      <pattern id="rk-hatch-cross" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" {...line} />
        <line x1="0" y1="0" x2="6" y2="0" {...line} />
      </pattern>
      <pattern id="rk-hatch-dots" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="0.9" fill="var(--rk-ink)" fillOpacity={0.4} />
      </pattern>
      <pattern id="rk-sea-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="var(--rk-sea-grid)" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

/** The land: territories in their owners' inks, borders, coasts and sea lines. Drawn once per
 *  change of owners, not per frame of a pan. */
const Land = memo(function Land({ owners, dealKey }: { owners: string; dealKey: number }) {
  const seats = owners.split(",").map(Number) as Seat[];
  return (
    <g key={dealKey}>
      {IDS.map((id, i) => {
        const seat = seats[i];
        const hatch = HATCHES[seat];
        const d = TERRITORY_SHAPES[id].path;
        return (
          <g key={id} className="rk-deal" style={{ animationDelay: `${(i % 42) * 25}ms` }}>
            <path d={d} data-territory={id} fill={seatColour(seat)} stroke="var(--rk-border)" strokeWidth={0.7} strokeLinejoin="round" />
            {hatch !== "none" && <path d={d} fill={`url(#rk-hatch-${hatch})`} pointerEvents="none" />}
          </g>
        );
      })}
      {Object.entries(CONTINENT_OUTLINES).map(([id, d]) => (
        <path key={id} d={d} fill="none" stroke="var(--rk-coast)" strokeWidth={1.8} strokeLinejoin="round" pointerEvents="none" vectorEffect="non-scaling-stroke" />
      ))}
      {SEA_LINES.map((line) => (
        <polyline key={line.between.join()} points={line.points} fill="none" stroke="var(--rk-sea-line)" strokeOpacity={0.75} strokeWidth={1.4} strokeDasharray="5 4" pointerEvents="none" vectorEffect="non-scaling-stroke" />
      ))}
      <polyline points={`${EDGE_LINE.alaska.join(",")} 0,${EDGE_LINE.alaska[1]}`} fill="none" stroke="var(--rk-sea-line)" strokeOpacity={0.75} strokeWidth={1.4} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
      <polyline points={`${EDGE_LINE.kamchatka.join(",")} ${BOARD_WIDTH},${EDGE_LINE.kamchatka[1]}`} fill="none" stroke="var(--rk-sea-line)" strokeOpacity={0.75} strokeWidth={1.4} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" pointerEvents="none" />
    </g>
  );
});

function Marker({ id, owner, armies, size, scale, lit, focused }: { id: TerritoryId; owner: Seat; armies: number; size: number; scale: number; lit: boolean; focused: boolean }) {
  const [x, y] = TERRITORY_SHAPES[id].label;
  const unit = size / scale;
  const label = String(armies);
  const showName = scale >= 1.9;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {focused && <circle r={unit * 0.95} fill="none" stroke="var(--rk-brass-bright)" strokeWidth={3} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" className="rk-focus-ring" />}
      <path d={shapePath(SEAT_LOOKS[owner].shape, unit)} fill={seatColour(owner)} stroke={lit ? "var(--rk-brass-bright)" : "var(--rk-ink)"} strokeWidth={lit ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <text y={unit * 0.06} textAnchor="middle" dominantBaseline="central" fontSize={unit * (label.length > 2 ? 0.42 : 0.52)} fontWeight={800} fill={`var(--rk-seat-ink-${owner})`}>
        {label}
      </text>
      {showName && (
        <text y={unit * 1.05} textAnchor="middle" dominantBaseline="hanging" fontSize={unit * 0.42} fontWeight={700} fill="var(--rk-parchment)" stroke="var(--rk-coast)" strokeWidth={unit * 0.12} paintOrder="stroke" className="font-(family-name:--rk-font-display)">
          {territoryName(id)}
        </text>
      )}
    </g>
  );
}

interface Press {
  start: Point;
  last: Point;
  kind: "touch" | "mouse";
}

export const BoardMap = forwardRef<BoardHandle, Props>(function BoardMap({ view, marks, focus, showFocus, markerSize, onPick, onTouch, dealKey }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const sizeRef = useRef<Size | null>(null);

  const update = useCallback((next: (camera: Camera, size: Size) => Camera) => {
    const current = cameraRef.current;
    const view = sizeRef.current;
    if (!current || !view) return;
    const moved = next(current, view);
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
      const current = cameraRef.current;
      const moved = current ? clampCamera(current, BOARD, next) : centredOn({ x: BOARD_WIDTH * 0.5, y: BOARD_HEIGHT * 0.45 }, startScale(BOARD, next), BOARD, next);
      cameraRef.current = moved;
      setCamera(moved);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoom: (factor) => update((c, s) => zoomAbout(c, factor, { x: s.width / 2, y: s.height / 2 }, BOARD, s)),
      pan: (dx, dy) => update((c, s) => panBy(c, dx, dy, BOARD, s)),
      overview: () => update((c, s) => clampCamera({ ...c, scale: 0 }, BOARD, s)),
      reveal: (territory) => {
        const [x, y] = TERRITORY_SHAPES[territory].label;
        update((c, s) => keepInView(c, { x, y }, Math.max(64, markerSize * 2), BOARD, s));
      },
      centre: () => {
        const c = cameraRef.current;
        const s = sizeRef.current;
        if (!c || !s) return { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 };
        return { x: (s.width / 2 - c.left) / c.scale, y: (s.height / 2 - c.top) / c.scale };
      },
    }),
    [update, markerSize],
  );

  // Pointers: one drags the board, two pinch it, a press that barely moves picks.
  const presses = useRef(new Map<number, Press>());
  const pinch = useRef<{ start: Span; last: Span; zooming: boolean } | null>(null);
  const dragged = useRef(false);
  const multi = useRef(false);
  const pickRef = useRef(onPick);
  const marksRef = useRef(marks);
  useEffect(() => {
    pickRef.current = onPick;
    marksRef.current = marks;
  });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const local = (event: PointerEvent | WheelEvent): Point => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const span = () => {
      const [a, b] = [...presses.current.values()];
      return spanOf(a.last, b.last);
    };
    const tap = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-territory]")?.getAttribute("data-territory") as TerritoryId | undefined;
      const { choices, also } = marksRef.current;
      if (hit && (choices.has(hit) || also.has(hit))) return pickRef.current(hit);
      const c = cameraRef.current;
      if (c) {
        const point = local(event);
        // A small territory is still a target a fingertip can hit: its marker reaches.
        const targets = [...choices, ...also].map((id) => {
          const [x, y] = TERRITORY_SHAPES[id].label;
          return { id, outline: [], anchor: toScreen(c, { x, y }) };
        });
        const near = pointAt(targets, point) as TerritoryId | null;
        if (near) return pickRef.current(near);
      }
      if (hit) pickRef.current(hit);
    };
    const down = (event: PointerEvent) => {
      element.setPointerCapture(event.pointerId);
      const point = local(event);
      const kind = event.pointerType === "touch" ? "touch" : "mouse";
      onTouch(kind);
      presses.current.set(event.pointerId, { start: point, last: point, kind });
      if (presses.current.size === 2) {
        multi.current = true;
        const s = span();
        pinch.current = { start: s, last: s, zooming: false };
      }
    };
    const move = (event: PointerEvent) => {
      const press = presses.current.get(event.pointerId);
      if (!press) return;
      const from = press.last;
      press.last = local(event);
      if (pinch.current) {
        const now = span();
        const { start, last } = pinch.current;
        const zooming = pinch.current.zooming || (start.spread > 0 && Math.abs(Math.log(now.spread / start.spread)) >= PINCH_START);
        update((c, s) => {
          const panned = panBy(c, now.middle.x - last.middle.x, now.middle.y - last.middle.y, BOARD, s);
          return zooming && last.spread > 0 ? zoomAbout(panned, now.spread / last.spread, now.middle, BOARD, s) : panned;
        });
        pinch.current = { start, last: now, zooming };
        return;
      }
      if (!dragged.current && isDrag(press.start, press.last)) dragged.current = true;
      if (dragged.current) update((c, s) => panBy(c, press.last.x - from.x, press.last.y - from.y, BOARD, s));
    };
    const up = (event: PointerEvent, cancelled: boolean) => {
      const press = presses.current.get(event.pointerId);
      presses.current.delete(event.pointerId);
      if (presses.current.size < 2) pinch.current = null;
      if (presses.current.size > 0) return;
      if (press && !dragged.current && !multi.current && !cancelled && event.button <= 0) tap(event);
      dragged.current = false;
      multi.current = false;
    };
    const onUp = (event: PointerEvent) => up(event, false);
    const onCancel = (event: PointerEvent) => up(event, true);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      onTouch("mouse");
      const at = local(event);
      update((c, s) => zoomAbout(c, Math.exp(-event.deltaY * 0.0015), at, BOARD, s));
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

  const owners = IDS.map((id) => view.territories[id].owner).join(",");

  return (
    <div ref={box} data-testid="risk-board" className="relative h-full w-full touch-none overflow-clip bg-(--rk-sea) select-none" style={{ cursor: marks.picking ? "pointer" : "grab" }}>
      {size && camera && (
        <svg width={size.width} height={size.height} className="absolute inset-0" role="img" aria-label="The world map">
          <Hatches />
          <rect width={size.width} height={size.height} fill="url(#rk-sea-grid)" />
          <g transform={`translate(${camera.left} ${camera.top}) scale(${camera.scale})`}>
            <Land owners={owners} dealKey={dealKey} />
            {marks.picking && (
              <g pointerEvents="none">
                {IDS.filter((id) => !marks.choices.has(id) && !marks.also.has(id) && !marks.selected.includes(id)).map((id) => (
                  <path key={id} d={TERRITORY_SHAPES[id].path} fill="var(--rk-coast)" fillOpacity={0.4} />
                ))}
              </g>
            )}
            <g pointerEvents="none">
              {[...marks.choices].map((id) => (
                <path key={id} d={TERRITORY_SHAPES[id].path} fill="var(--rk-brass-bright)" fillOpacity={0.14} stroke="var(--rk-brass-bright)" strokeWidth={2.2} vectorEffect="non-scaling-stroke" className="rk-lit" />
              ))}
              {[...marks.also].map((id) => (
                <path key={id} d={TERRITORY_SHAPES[id].path} fill="none" stroke="var(--rk-brass)" strokeOpacity={0.7} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
              ))}
              {marks.selected.map((id) => (
                <path key={id} d={TERRITORY_SHAPES[id].path} fill="var(--rk-brass-bright)" fillOpacity={0.3} stroke="var(--rk-brass-bright)" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
            {IDS.map((id) => (
              <Marker key={id} id={id} owner={view.territories[id].owner} armies={view.territories[id].armies} size={markerSize} scale={camera.scale} lit={marks.choices.has(id) || marks.selected.includes(id)} focused={showFocus && focus === id} />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
});
