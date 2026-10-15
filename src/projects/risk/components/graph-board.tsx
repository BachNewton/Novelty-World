"use client";

import { forwardRef, memo } from "react";
import { pickTarget, type Point } from "@/shared/lib/input";
import { borderLines, DRAWN, isWrap, locate, pathThrough, READABLE_SCALE } from "../board/graph";
import { GRAPH_HEIGHT, GRAPH_UNIT, GRAPH_WIDTH, NODES, REGIONS, WRAP_GHOSTS } from "../board/graph-layout";
import type { GameView, Seat } from "../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES, type ContinentId, type TerritoryId } from "../map";
import { toScreen, type Camera, type Size } from "../ui/camera";
import { territoryName } from "../ui/describe";
import { SEAT_LOOKS, seatColour, seatName, shapePath } from "../ui/seats";
import { shortName } from "../ui/short-names";
import { useBoardCamera, type BoardHandle, type Marks } from "./use-board-camera";

/*
 * The board as a graph: each territory a node in its owner's colour and shape with its armies,
 * each border an edge, each continent a tinted region with its name and bonus. The layout is
 * fixed (`board/graph-layout.ts`), so players learn it. Alaska–Kamchatka runs off both sides, to
 * a ghost of the territory across the edge. Everything is in board units, so it all scales with
 * the zoom; what picking does is the screen's (`ui/selection.ts`).
 */

const BOARD: Size = { width: GRAPH_WIDTH, height: GRAPH_HEIGHT };
const IDS = TERRITORIES.map((t) => t.id);
const CONTINENT_OF = new Map<TerritoryId, ContinentId>(TERRITORIES.map((t) => [t.id, t.continent]));

/** A marker's size, its count's and its name's, in board units (a neighbour is `GRAPH_UNIT` away). */
const NODE = 62;
const COUNT = 30;
const NAME = 21;
/** Names show while they are at least this many CSS pixels high. */
const NAME_LEAST = 8;

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
        const region = REGIONS[continent.id];
        const seat = holders[i];
        const [x, y] = region.label;
        return (
          <g key={continent.id}>
            <path d={region.path} fill={`var(--rk-region-${continent.id})`} stroke={seat === null ? `var(--rk-region-edge-${continent.id})` : seatColour(seat)} strokeOpacity={seat === null ? 0.55 : 1} strokeWidth={seat === null ? 3 : 7} />
            <text x={x} y={region.side === "above" ? y : y + 26} textAnchor="middle" fontSize={30} fontWeight={700} fill={`var(--rk-region-edge-${continent.id})`} className="font-(family-name:--rk-font-display)" letterSpacing={1.5}>
              <title>{`${continent.name}: hold all of it for ${continent.bonus} more armies a turn${seat === null ? "" : `. ${seatName(seat)} holds it`}`}</title>
              {continent.name.toUpperCase()}
              <tspan dx={14} fill={seat === null ? "var(--rk-brass)" : seatColour(seat)}>
                +{continent.bonus}
              </tspan>
            </text>
          </g>
        );
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

function Node({ id, at, owner, armies, mark, focused, showName, ghost = false }: { id: TerritoryId; at: readonly [number, number]; owner: Seat; armies: number; mark: Mark; focused: boolean; showName: boolean; ghost?: boolean }) {
  const label = String(armies);
  const size = ghost ? NODE * 0.62 : NODE;
  const ring = size * 0.78;
  return (
    <g transform={`translate(${at[0]} ${at[1]})`} opacity={mark === "dim" ? 0.6 : 1}>
      <title>{`${territoryName(id)}: ${seatName(owner)}, ${armies} ${armies === 1 ? "army" : "armies"}${ghost ? " (across the Pacific)" : ""}`}</title>
      {mark === "choice" && <circle r={ring} fill="var(--rk-brass-bright)" fillOpacity={0.16} stroke="var(--rk-brass-bright)" strokeWidth={5} className="rk-lit" />}
      {mark === "also" && <circle r={ring} fill="none" stroke="var(--rk-brass)" strokeOpacity={0.75} strokeWidth={3} strokeDasharray="7 6" />}
      {mark === "selected" && <circle r={ring} fill="var(--rk-brass-bright)" fillOpacity={0.3} stroke="var(--rk-brass-bright)" strokeWidth={8} />}
      {focused && <circle r={ring + 9} fill="none" stroke="var(--rk-brass-bright)" strokeWidth={4} strokeDasharray="12 8" className="rk-focus-ring" />}
      <path d={shapePath(SEAT_LOOKS[owner].shape, size)} fill={seatColour(owner)} stroke="var(--rk-ink)" strokeWidth={ghost ? 2 : 3} strokeLinejoin="round" strokeDasharray={ghost ? "5 4" : undefined} />
      <text y={size * 0.04} textAnchor="middle" dominantBaseline="central" fontSize={(ghost ? 0.62 : 1) * (label.length > 2 ? COUNT * 0.8 : COUNT)} fontWeight={800} fill={`var(--rk-seat-ink-${owner})`}>
        {label}
      </text>
      {showName && !ghost && (
        <text y={size / 2 + 8} textAnchor="middle" dominantBaseline="hanging" fontSize={NAME} fontWeight={600} fill="var(--rk-parchment)" stroke="var(--rk-sea)" strokeWidth={5} strokeLinejoin="round" paintOrder="stroke">
          {shortName(id)}
        </text>
      )}
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
  /** Changes when the board was just dealt, to play the deal. */
  dealKey: number;
}

export const GraphBoard = forwardRef<BoardHandle, Props>(function GraphBoard({ view, marks, focus, showFocus, onPick, onTouch, dealKey }, ref) {
  const pickable = [...marks.choices, ...marks.also];
  const onTap = (point: Point, camera: Camera) => {
    // A tap takes the nearest territory on offer within half a border's length of it, or a
    // fingertip's reach when zoomed far out; a ghost across the edge counts as its territory.
    const targets = pickable.flatMap((id) => {
      const at = [{ id, outline: [], anchor: toScreen(camera, locate(id)) }];
      if (id === "alaska" || id === "kamchatka") at.push({ id, outline: [], anchor: toScreen(camera, { x: WRAP_GHOSTS[id][0], y: WRAP_GHOSTS[id][1] }) });
      return at;
    });
    const hit = pickTarget(targets, point, Math.max(24, (GRAPH_UNIT / 2) * camera.scale)) as TerritoryId | null;
    if (hit) onPick(hit);
  };
  const { box, size, camera } = useBoardCamera({ ref, board: BOARD, start: { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 }, readable: READABLE_SCALE, locate, revealMargin: 64, onTouch, onTap });

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

  return (
    <div ref={box} data-testid="risk-board" className="relative h-full w-full touch-none overflow-clip bg-(--rk-sea) select-none" style={{ cursor: marks.picking ? "pointer" : "grab" }}>
      {size && camera && (
        <svg width={size.width} height={size.height} className="absolute inset-0" role="img" aria-label="The board: territories and their borders">
          <g transform={`translate(${camera.left} ${camera.top}) scale(${camera.scale})`}>
            <Regions held={held} />
            <Borders />
            <g pointerEvents="none" strokeLinecap="round">
              {lit.flatMap(({ a, b, chosen }) =>
                borderLines(a, b).map(([p, q], i) => (
                  <line key={`${a}|${b}|${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="var(--rk-brass-bright)" strokeWidth={chosen ? 13 : 8} strokeOpacity={chosen ? 1 : 0.85} data-path={chosen ? "" : undefined} />
                )),
              )}
            </g>
            <g key={dealKey}>
              {IDS.map((id, i) => {
                const t = view.territories[id];
                return (
                  <g key={id} className="rk-deal" style={{ animationDelay: `${i * 25}ms` }} data-territory={id} data-mark={markOf(id) ?? undefined}>
                    <Node id={id} at={NODES[id]} owner={t.owner} armies={t.armies} mark={markOf(id)} focused={showFocus && focus === id} showName={NAME * camera.scale >= NAME_LEAST} />
                  </g>
                );
              })}
              {(["alaska", "kamchatka"] as const).map((id) => (
                <Node key={`ghost-${id}`} id={id} at={WRAP_GHOSTS[id]} owner={view.territories[id].owner} armies={view.territories[id].armies} mark={markOf(id)} focused={false} showName={false} ghost />
              ))}
            </g>
          </g>
        </svg>
      )}
    </div>
  );
});
