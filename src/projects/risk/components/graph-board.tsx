"use client";

import { Skull } from "lucide-react";
import { forwardRef, memo, useState, type CSSProperties } from "react";
import { pickTarget, type Point } from "@/shared/lib/input";
import { borderLines, DRAWS, isWrap, layoutAt, LIT_RING, locate, MARKER, NAME_SIZE, NAME_Y, pathThrough, TOUCH_SCALE, type Layout } from "../board/graph";
import { BORDERS, GRAPH_HEIGHT, GRAPH_UNIT, GRAPH_WIDTH } from "../board/graph-layout";
import type { GameView, Seat } from "../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES, type ContinentId, type TerritoryId } from "../map";
import { copies, toScreen, type Frame, type Rect, type Size } from "../ui/camera";
import { territoryName } from "../ui/describe";
import type { Beat, Effect } from "../ui/playback";
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
const PLACES = IDS.map(locate);
const DRAWN_ROUND = IDS.map((id) => DRAWS[id]);
const CONTINENT_OF = new Map<TerritoryId, ContinentId>(TERRITORIES.map((t) => [t.id, t.continent]));
const COUNT = 30;

/** A territory not on offer while a pick is wanted is muted, never see-through: its colours
 *  sink towards the sea's, so it still reads plainly. */
const muted = (colour: string) => `color-mix(in srgb, ${colour} 45%, var(--rk-sea))`;

/** Who holds a whole continent, if anyone. */
function holder(view: GameView, continent: ContinentId): Seat | null {
  const owners = new Set(IDS.filter((id) => CONTINENT_OF.get(id) === continent).map((id) => view.territories[id].owner));
  return owners.size === 1 ? [...owners][0] : null;
}

const Regions = memo(function Regions({ held, layout }: { held: string; layout: Layout }) {
  const holders = held.split(",").map((h) => (h === "" ? null : Number(h)));
  return (
    <g pointerEvents="none">
      {CONTINENTS.map((continent, i) => {
        const seat = holders[i];
        return <path key={continent.id} d={layout.regions[continent.id]} fill={`var(--rk-region-${continent.id})`} stroke={seat === null ? `var(--rk-region-edge-${continent.id})` : seatColour(seat)} strokeOpacity={seat === null ? 0.55 : 1} strokeWidth={seat === null ? 3 : 7} />;
      })}
    </g>
  );
});

/** Where the screen's edges fall, in board units, while it shows the whole board: Alaska–Kamchatka
 *  runs out to them. Null while the board wraps, when the border meets the copy across the edge. */
type Reach = readonly [number, number] | null;

function linesOf(a: TerritoryId, b: TerritoryId, layout: Layout, reach: Reach) {
  if (!reach || !isWrap(a, b)) return borderLines(a, b, layout);
  const { alaska, kamchatka } = layout.nodes;
  return [
    [alaska, [reach[0], alaska[1]]],
    [kamchatka, [reach[1], kamchatka[1]]],
  ] as const;
}

const Borders = memo(function Borders({ west, east, layout }: { west: number | null; east: number | null; layout: Layout }) {
  const reach = west === null || east === null ? null : ([west, east] as const);
  return (
    <g pointerEvents="none" strokeLinecap="round">
      {BORDERS.flatMap(([a, b]) =>
        linesOf(a, b, layout, reach).map(([p, q]) => {
          const between = CONTINENT_OF.get(a) !== CONTINENT_OF.get(b);
          return <line key={`${a}|${b}|${p.join()}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={between ? "var(--rk-edge-between)" : "var(--rk-edge)"} strokeOpacity={between ? 0.8 : 0.55} strokeWidth={between ? 6 : 3.5} strokeDasharray={isWrap(a, b) ? "10 9" : undefined} />;
        }),
      )}
    </g>
  );
});

type Mark = "choice" | "also" | "selected" | "dim" | null;

function Node({ id, at: [x, y], owner, armies, mark, focused }: { id: TerritoryId; at: readonly [number, number]; owner: Seat; armies: number; mark: Mark; focused: boolean }) {
  const label = String(armies);
  const ring = LIT_RING;
  const tone = (colour: string) => (mark === "dim" ? muted(colour) : colour);
  return (
    <g transform={`translate(${x} ${y})`}>
      <title>{`${territoryName(id)}: ${seatName(owner)}, ${armies} ${armies === 1 ? "army" : "armies"}`}</title>
      {mark === "choice" && <circle r={ring} fill="var(--rk-brass-bright)" fillOpacity={0.16} stroke="var(--rk-brass-bright)" strokeWidth={5} className="rk-lit" />}
      {mark === "also" && <circle r={ring} fill="none" stroke="var(--rk-brass)" strokeOpacity={0.75} strokeWidth={3} strokeDasharray="7 6" />}
      {mark === "selected" && <circle r={ring} fill="var(--rk-brass-bright)" fillOpacity={0.3} stroke="var(--rk-brass-bright)" strokeWidth={8} />}
      {focused && <circle r={ring + 9} fill="none" stroke="var(--rk-brass-bright)" strokeWidth={4} strokeDasharray="12 8" className="rk-focus-ring" />}
      <path d={shapePath(SEAT_LOOKS[owner].shape, MARKER)} fill={tone(seatColour(owner))} stroke="var(--rk-ink)" strokeWidth={3} strokeLinejoin="round" />
      <text y={MARKER * 0.04} textAnchor="middle" dominantBaseline="central" fontSize={label.length > 2 ? COUNT * 0.8 : COUNT} fontWeight={800} fill={tone(`var(--rk-seat-ink-${owner})`)}>
        {label}
      </text>
      <text y={NAME_Y} textAnchor="middle" dominantBaseline="hanging" fontSize={NAME_SIZE} fontWeight={600} fill={mark === "dim" ? "var(--rk-muted)" : "var(--rk-parchment)"} stroke="var(--rk-sea)" strokeWidth={5} strokeLinejoin="round" paintOrder="stroke">
        {shortName(id)}
      </text>
    </g>
  );
}

/** Each effect lasts the beat it belongs to: the pacing sets its animation's duration. */
const lasting = (ms: number, delay = 0): CSSProperties => ({ animationDuration: `${ms}ms`, animationDelay: `${delay}ms` });

function Rising({ at: [x, y], text, fill, ms }: { at: readonly [number, number]; text: string; fill: string; ms: number }) {
  return (
    <g transform={`translate(${x} ${y - MARKER * 0.75})`}>
      <text className="rk-fx-rise" style={lasting(ms)} textAnchor="middle" dominantBaseline="central" fontSize={COUNT * 1.15} fontWeight={800} fill={fill} stroke="var(--rk-sea)" strokeWidth={6} strokeLinejoin="round" paintOrder="stroke">
        {text}
      </text>
    </g>
  );
}

function Ring({ at: [x, y], colour, ms, burst }: { at: readonly [number, number]; colour: string; ms: number; burst?: boolean }) {
  return <circle cx={x} cy={y} r={burst ? LIT_RING * 1.2 : LIT_RING} fill="none" stroke={colour} strokeWidth={burst ? 12 : 8} className={burst ? "rk-fx-burst" : "rk-fx-ring"} style={lasting(ms)} />;
}

/** What the map shows of one effect of a move as it plays out (`ui/playback.ts`). */
function EffectMarks({ effect, ms, layout, reach }: { effect: Effect; ms: number; layout: Layout; reach: Reach }) {
  const at = (id: TerritoryId) => layout.nodes[id];
  switch (effect.kind) {
    case "arrive":
      return (
        <>
          <Ring at={at(effect.territory)} colour={seatColour(effect.seat)} ms={ms} />
          <Rising at={at(effect.territory)} text={`+${effect.armies}`} fill="var(--rk-brass-bright)" ms={ms} />
        </>
      );
    case "fight":
      return (
        <>
          {linesOf(effect.from, effect.to, layout, reach).map(([p, q], i) => (
            <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="var(--rk-danger)" strokeWidth={14} strokeLinecap="round" className="rk-fx-flash" style={lasting(ms)} />
          ))}
          <Ring at={at(effect.to)} colour="var(--rk-danger)" ms={ms} />
          {effect.attackerLosses > 0 && <Rising at={at(effect.from)} text={`−${effect.attackerLosses}`} fill="var(--rk-danger)" ms={ms} />}
          {effect.defenderLosses > 0 && <Rising at={at(effect.to)} text={`−${effect.defenderLosses}`} fill="var(--rk-danger)" ms={ms} />}
        </>
      );
    case "capture":
      return <Ring at={at(effect.territory)} colour={seatColour(effect.seat)} ms={ms} burst />;
    case "march": {
      // The armies march border by border, a token in the owner's colour along each in turn.
      const legs = effect.path.slice(1).flatMap((id, i) => linesOf(effect.path[i], id, layout, reach));
      const leg = (ms * 0.9) / legs.length;
      return (
        <>
          {legs.map(([p, q], i) => (
            <line key={`path${i}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="var(--rk-brass-bright)" strokeWidth={10} strokeLinecap="round" className="rk-fx-flash" style={lasting(ms)} />
          ))}
          {legs.map(([p, q], i) => (
            <g key={`token${i}`} className="rk-fx-hop" style={{ ...lasting(leg, i * leg), "--fx-x0": `${p[0]}px`, "--fx-y0": `${p[1]}px`, "--fx-x1": `${q[0]}px`, "--fx-y1": `${q[1]}px` } as CSSProperties}>
              <circle r={MARKER * 0.36} fill={seatColour(effect.seat)} stroke="var(--rk-ink)" strokeWidth={3} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={COUNT * 0.8} fontWeight={800} fill={`var(--rk-seat-ink-${effect.seat})`}>
                {effect.armies}
              </text>
            </g>
          ))}
        </>
      );
    }
    case "continent":
      return <path d={layout.regions[effect.continent]} fill="none" stroke={seatColour(effect.seat)} strokeWidth={16} strokeLinejoin="round" className="rk-fx-flash" style={lasting(ms)} />;
    case "fallen": {
      if (effect.territory === null) return null;
      const [x, y] = at(effect.territory);
      return (
        <>
          <Ring at={[x, y]} colour={seatColour(effect.seat)} ms={ms} burst />
          <g transform={`translate(${x} ${y - MARKER * 1.1})`}>
            <g className="rk-fx-rise" style={lasting(ms)}>
              <circle r={MARKER * 0.55} fill="var(--rk-ink)" stroke={seatColour(effect.seat)} strokeWidth={5} />
              <Skull x={-MARKER * 0.32} y={-MARKER * 0.32} width={MARKER * 0.64} height={MARKER * 0.64} color={seatColour(effect.seat)} strokeWidth={2.4} />
            </g>
          </g>
        </>
      );
    }
  }
}

/** The latest beat's effects, drawn afresh with each beat so their animations start over. */
function Effects({ beat, layout, reach }: { beat: Beat; layout: Layout; reach: Reach }) {
  return (
    <g pointerEvents="none" aria-hidden>
      {beat.effects.map((effect, i) => (
        <EffectMarks key={i} effect={effect} ms={beat.ms} layout={layout} reach={reach} />
      ))}
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
  /** The move playing out now, whose effects the map shows. */
  beat: Beat | null;
}

export const GraphBoard = forwardRef<BoardHandle, Props>(function GraphBoard({ view, marks, focus, showFocus, onPick, onTouch, overlays, beat }, ref) {
  const pickable = [...marks.choices, ...marks.also];
  const onTap = (point: Point, at: Frame) => {
    // A tap takes the nearest territory on offer, in whichever copy of the board it fell on,
    // within half a border's length of it.
    const { camera } = at;
    const period = GRAPH_WIDTH * at.stretch.x * camera.scale;
    const targets = pickable.flatMap((id) => [-1, 0, 1].map((k) => ({ id, outline: [], anchor: toScreen({ ...at, camera: { ...camera, left: camera.left + k * period } }, locate(id)) })));
    const hit = pickTarget(targets, point, (GRAPH_UNIT / 2) * camera.scale) as TerritoryId | null;
    if (hit) onPick(hit);
  };
  const { box, size, frame } = useBoardCamera({ ref, board: BOARD, places: PLACES, draws: DRAWN_ROUND, touch: TOUCH_SCALE, overlays, locate, revealMargin: 64, onTouch, onTap });

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
  const layout = layoutAt(frame?.stretch ?? { x: 1, y: 1 });

  // Panning across, the copies of the board meet edge to edge; otherwise the line across the
  // edge runs out to the screen's.
  const reach: Reach = frame && size && frame.pan.axis !== "x" ? [-frame.camera.left / frame.camera.scale, (size.width - frame.camera.left) / frame.camera.scale] : null;
  // The deal plays once, as the board first shows: a copy that panning brings into view later
  // is the same board, already dealt.
  const [dealt, setDealt] = useState(false);

  return (
    <div ref={box} data-testid="risk-board" className="absolute inset-0 touch-none overflow-clip bg-(--rk-sea) select-none" style={{ cursor: marks.picking ? "pointer" : "grab" }}>
      {size && frame && (
        <svg width={size.width} height={size.height} className="absolute inset-0" role="img" aria-label="The board: territories and their borders">
          {copies(frame, BOARD, size).map((left, copy) => (
            <g key={copy} transform={`translate(${left} ${frame.camera.top}) scale(${frame.camera.scale})`} aria-hidden={copy > 0 || undefined}>
              <Regions held={held} layout={layout} />
              <Borders west={reach && Math.floor(reach[0])} east={reach && Math.ceil(reach[1])} layout={layout} />
              <g pointerEvents="none" strokeLinecap="round">
                {lit.flatMap(({ a, b, chosen }) =>
                  linesOf(a, b, layout, reach).map(([p, q], i) => (
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
                      <Node id={id} at={layout.nodes[id]} owner={t.owner} armies={t.armies} mark={markOf(id)} focused={showFocus && focus === id} />
                    </g>
                  );
                })}
              </g>
              {beat && <Effects key={beat.key} beat={beat} layout={layout} reach={reach} />}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
});
