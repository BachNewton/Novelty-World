"use client";

import { forwardRef, memo } from "react";
import { pointAt, type Point } from "@/shared/lib/input";
import { BOARD_HEIGHT, BOARD_WIDTH, CONTINENT_OUTLINES, EDGE_LINE, SEA_LINES, TERRITORY_SHAPES } from "../board/board-data";
import type { GameView, Seat } from "../contract";
import { TERRITORIES, type TerritoryId } from "../map";
import { toScreen, type Camera, type Size } from "../ui/camera";
import { territoryName } from "../ui/describe";
import { SEAT_LOOKS, seatColour, shapePath } from "../ui/seats";
import { useBoardCamera, type BoardHandle, type Marks } from "./use-board-camera";

/*
 * The board: our own map, the seats' inks on it, an army marker on every territory, and the
 * territories the player may pick lit in brass. It pans and zooms under a finger, the mouse and
 * a controller alike; what picking does is the screen's (`ui/selection.ts`).
 */

const BOARD: Size = { width: BOARD_WIDTH, height: BOARD_HEIGHT };
const IDS = TERRITORIES.map((t) => t.id);

export type { BoardHandle, Marks };

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

const locate = (territory: TerritoryId) => {
  const [x, y] = TERRITORY_SHAPES[territory].label;
  return { x, y };
};

export const BoardMap = forwardRef<BoardHandle, Props>(function BoardMap({ view, marks, focus, showFocus, markerSize, onPick, onTouch, dealKey }, ref) {
  const onTap = (point: Point, camera: Camera) => {
    const rect = box.current?.getBoundingClientRect();
    const hit = rect && (document.elementFromPoint(rect.left + point.x, rect.top + point.y)?.closest("[data-territory]")?.getAttribute("data-territory") as TerritoryId | undefined);
    const { choices, also } = marks;
    if (hit && (choices.has(hit) || also.has(hit))) return onPick(hit);
    // A small territory is still a target a fingertip can hit: its marker reaches.
    const targets = [...choices, ...also].map((id) => ({ id, outline: [], anchor: toScreen(camera, locate(id)) }));
    const near = pointAt(targets, point) as TerritoryId | null;
    if (near) return onPick(near);
    if (hit) onPick(hit);
  };
  const { box, size, camera } = useBoardCamera({ ref, board: BOARD, start: { x: BOARD_WIDTH * 0.5, y: BOARD_HEIGHT * 0.45 }, readable: 1, locate, revealMargin: Math.max(64, markerSize * 2), onTouch, onTap });

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
