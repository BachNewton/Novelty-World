"use client";

import { forwardRef, memo, useState } from "react";
import { pickTarget, type Point } from "@/shared/lib/input";
import { borderLines, DRAWN, FOOTPRINTS, isWrap, locate, MARKER, NAME_SIZE, pathThrough, TOUCH_SCALE } from "../board/graph";
import { GRAPH_HEIGHT, GRAPH_UNIT, GRAPH_WIDTH, NODES, REGIONS } from "../board/graph-layout";
import type { GameView, Seat } from "../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES, type ContinentId, type TerritoryId } from "../map";
import { copies, toScreen, type Camera, type Rect, type Size } from "../ui/camera";
import { territoryName } from "../ui/describe";
import { SEAT_LOOKS, seatColour, seatName, shapePath } from "../ui/seats";
import { shortName } from "../ui/short-names";
import { useBoardCamera, type BoardHandle, type Marks } from "./use-board-camera";

/*
 * The board as a graph: each territory a node in its owner's colour and shape with its armies,
 * each border an edge, each continent a tinted region, outlined in a seat's colour while that
 * seat holds it all. The layout is fixed (`board/graph-layout.ts`), so players learn it. The
 * board wraps east to west: Alaska–Kamchatka runs across its edge, and a screen that pans across
 * draws it again either side. What picking does is the screen's (`ui/selection.ts`).
 */

const BOARD: Size = { width: GRAPH_WIDTH, height: GRAPH_HEIGHT };
const IDS = TERRITORIES.map((t) => t.id);
const CONTINENT_OF = new Map<TerritoryId, ContinentId>(TERRITORIES.map((t) => [t.id, t.continent]));
const COUNT = 30;

/** Who holds a whole continent, if anyone. */
function holder(view: GameView, continent: ContinentId): Seat | null {
  const owners = new Set(IDS.filter((id) => CONTINENT_OF.get(id) === continent).map((id) => view.territories[id].owner));
  return owners.size === 1 ? [...owners][0] : null;
}

const Regions = memo(function Regions({ held }: { held: string }) {
  const holders = held.split(",").map((h) => (h === "" ? null : Number(h)));
  return (
    <g pointerEvents="none">
      {CONTINENTS.map((continent, i) => {
        const seat = holders[i];
        return <path key={continent.id} d={REGIONS[continent.id]} fill={`var(--rk-region-${continent.id})`} stroke={seat === null ? `var(--rk-region-edge-${continent.id})` : seatColour(seat)} strokeOpacity={seat === null ? 0.55 : 1} strokeWidth={seat === null ? 3 : 7} />;
      })}
    </g>
  );
});

const Borders = memo(function Borders() {
  return (
    <g pointerEvents="none" strokeLinecap="round">
      {DRAWN.map(({ border: [a, b], line: [p, q] }) => {
        const between = CONTINENT_OF.get(a) !== CONTINENT_OF.get(b);
        return <line key={`${a}|${b}|${p.join()}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={between ? "var(--rk-edge-between)" : "var(--rk-edge)"} strokeOpacity={between ? 0.8 : 0.55} strokeWidth={between ? 6 : 3.5} strokeDasharray={isWrap(a, b) ? "10 9" : undefined} />;
      })}
    </g>
  );
});

type Mark = "choice" | "also" | "selected" | "dim" | null;

function Node({ id, owner, armies, mark, focused }: { id: TerritoryId; owner: Seat; armies: number; mark: Mark; focused: boolean }) {
  const label = String(armies);
  const ring = MARKER * 0.78;
  const [x, y] = NODES[id];
  return (
    <g transform={`translate(${x} ${y})`} opacity={mark === "dim" ? 0.6 : 1}>
      <title>{`${territoryName(id)}: ${seatName(owner)}, ${armies} ${armies === 1 ? "army" : "armies"}`}</title>
      {mark === "choice" && <circle r={ring} fill="var(--rk-brass-bright)" fillOpacity={0.16} stroke="var(--rk-brass-bright)" strokeWidth={5} className="rk-lit" />}
      {mark === "also" && <circle r={ring} fill="none" stroke="var(--rk-brass)" strokeOpacity={0.75} strokeWidth={3} strokeDasharray="7 6" />}
      {mark === "selected" && <circle r={ring} fill="var(--rk-brass-bright)" fillOpacity={0.3} stroke="var(--rk-brass-bright)" strokeWidth={8} />}
      {focused && <circle r={ring + 9} fill="none" stroke="var(--rk-brass-bright)" strokeWidth={4} strokeDasharray="12 8" className="rk-focus-ring" />}
      <path d={shapePath(SEAT_LOOKS[owner].shape, MARKER)} fill={seatColour(owner)} stroke="var(--rk-ink)" strokeWidth={3} strokeLinejoin="round" />
      <text y={MARKER * 0.04} textAnchor="middle" dominantBaseline="central" fontSize={label.length > 2 ? COUNT * 0.8 : COUNT} fontWeight={800} fill={`var(--rk-seat-ink-${owner})`}>
        {label}
      </text>
      <text y={MARKER / 2 + 8} textAnchor="middle" dominantBaseline="hanging" fontSize={NAME_SIZE} fontWeight={600} fill="var(--rk-parchment)" stroke="var(--rk-sea)" strokeWidth={5} strokeLinejoin="round" paintOrder="stroke">
        {shortName(id)}
      </text>
    </g>
  );
}

interface Props {
  view: GameView;
  marks: Marks;
  focus: TerritoryId | null;
  showFocus: boolean;
  onPick: (territory: TerritoryId) => void;
  onTouch: (kind: "touch" | "mouse") => void;
  /** What floats over the map, in its box's CSS pixels: the board is framed clear of them. */
  overlays: readonly Rect[];
}

export const GraphBoard = forwardRef<BoardHandle, Props>(function GraphBoard({ view, marks, focus, showFocus, onPick, onTouch, overlays }, ref) {
  const pickable = [...marks.choices, ...marks.also];
  const onTap = (point: Point, camera: Camera) => {
    // A tap takes the nearest territory on offer, in whichever copy of the board it fell on,
    // within half a border's length of it.
    const period = GRAPH_WIDTH * camera.scale;
    const targets = pickable.flatMap((id) => [-1, 0, 1].map((k) => ({ id, outline: [], anchor: toScreen({ ...camera, left: camera.left + k * period }, locate(id)) })));
    const hit = pickTarget(targets, point, (GRAPH_UNIT / 2) * camera.scale) as TerritoryId | null;
    if (hit) onPick(hit);
  };
  const { box, size, frame } = useBoardCamera({ ref, board: BOARD, footprints: FOOTPRINTS, touch: TOUCH_SCALE, overlays, locate, revealMargin: 64, onTouch, onTap });

  const markOf = (id: TerritoryId): Mark => {
    if (marks.selected.includes(id)) return "selected";
    if (marks.choices.has(id)) return "choice";
    if (marks.also.has(id)) return "also";
    return marks.picking ? "dim" : null;
  };

  // The borders that matter now: from the source to each target on offer, and the chosen one (or,
  // fortifying further than next door, the way the armies march).
  const from = marks.selected.at(0);
  const to = marks.selected.at(1);
  const lit: { a: TerritoryId; b: TerritoryId; chosen: boolean }[] = [];
  if (from !== undefined && to === undefined) for (const id of marks.choices) if (ADJACENCY[from].includes(id)) lit.push({ a: from, b: id, chosen: false });
  if (from !== undefined && to !== undefined) {
    const path = ADJACENCY[from].includes(to) ? [from, to] : (pathThrough(view.territories, from, to) ?? []);
    for (let i = 1; i < path.length; i++) lit.push({ a: path[i - 1], b: path[i], chosen: true });
  }
  const held = CONTINENTS.map((c) => holder(view, c.id) ?? "").join(",");

  // Panning across, the copies of the board meet edge to edge; otherwise the lines across the
  // edge stop at it.
  const wraps = frame?.pan.axis === "x";
  // The deal plays once, as the board first shows: a copy that panning brings into view later
  // is the same board, already dealt.
  const [dealt, setDealt] = useState(false);

  return (
    <div ref={box} data-testid="risk-board" className="absolute inset-0 touch-none overflow-clip bg-(--rk-sea) select-none" style={{ cursor: marks.picking ? "pointer" : "grab" }}>
      {size && frame && (
        <svg width={size.width} height={size.height} className="absolute inset-0" role="img" aria-label="The board: territories and their borders">
          <defs>
            <clipPath id="rk-board-edge">
              <rect width={GRAPH_WIDTH} height={GRAPH_HEIGHT} />
            </clipPath>
          </defs>
          {copies(frame, BOARD, size).map((left, copy) => (
            <g key={copy} transform={`translate(${left} ${frame.camera.top}) scale(${frame.camera.scale})`} clipPath={wraps ? undefined : "url(#rk-board-edge)"} aria-hidden={copy > 0 || undefined}>
              <Regions held={held} />
              <Borders />
              <g pointerEvents="none" strokeLinecap="round">
                {lit.flatMap(({ a, b, chosen }) =>
                  borderLines(a, b).map(([p, q], i) => (
                    <line key={`${a}|${b}|${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="var(--rk-brass-bright)" strokeWidth={chosen ? 13 : 8} strokeOpacity={chosen ? 1 : 0.85} data-path={chosen && copy === 0 ? "" : undefined} />
                  )),
                )}
              </g>
              {/* A game screen only ever mounts on a game already dealt, so the deal is shown as it mounts. */}
              <g>
                {IDS.map((id, i) => {
                  const t = view.territories[id];
                  return (
                    <g
                      key={id}
                      className={dealt ? undefined : "rk-deal"}
                      style={dealt ? undefined : { animationDelay: `${i * 25}ms` }}
                      onAnimationEnd={(event) => {
                        if (event.target === event.currentTarget && i === IDS.length - 1) setDealt(true);
                      }}
                      data-territory={copy === 0 ? id : undefined} data-mark={copy === 0 ? (markOf(id) ?? undefined) : undefined}>
                      <Node id={id} owner={t.owner} armies={t.armies} mark={markOf(id)} focused={showFocus && focus === id} />
                    </g>
                  );
                })}
              </g>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
});
