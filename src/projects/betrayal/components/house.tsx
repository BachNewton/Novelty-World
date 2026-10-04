import type { CSSProperties } from "react";
import type { Action, Edge, FloorId, PlacedTile } from "../types";
import {
  COMPASS,
  neighbourCell,
  openings,
  opposite,
  roomAt,
  sideName,
  turn,
} from "../engine/board";
import type { Engine } from "../engine/step-loop";
import type { Focus } from "./focus";
import type { GameView } from "../engine/view";
import { SEAT_BG } from "./theme";

/** A figure's colour: its owning seat's, or a neutral one when no seat owns it. */
const figureBg = (owner: number | null) =>
  owner === null ? "bg-(--bt-muted)" : SEAT_BG[owner];

/** Top of the house first, the way the floors stack. */
const FLOOR_ORDER: FloorId[] = ["roof", "upper", "ground", "basement"];

const FLOOR_NAMES: Record<FloorId, string> = {
  roof: "Roof",
  upper: "Upper floor",
  ground: "Ground floor",
  basement: "Basement",
};

/** A door's mark straddles the edge, reaching into the gap toward the next room. */
const DOOR_POSITION: Record<Edge, string> = {
  top: "-top-1.5 left-1/2 h-3 w-5 -translate-x-1/2",
  bottom: "-bottom-1.5 left-1/2 h-3 w-5 -translate-x-1/2",
  left: "-left-1.5 top-1/2 h-5 w-3 -translate-y-1/2",
  right: "-right-1.5 top-1/2 h-5 w-3 -translate-y-1/2",
};

/** Where a token on a wall sits: a quarter of the way along the wall, clear
 *  of a door's mark, or on the corner. */
const WALL_POSITION: Record<Edge, string> = {
  top: "top-0 left-1/4",
  bottom: "bottom-0 right-1/4",
  left: "left-0 bottom-1/4",
  right: "right-0 top-1/4",
};
const CORNER_POSITION: Record<string, string> = {
  "top,right": "top-0 right-0",
  "right,bottom": "bottom-0 right-0",
  "bottom,left": "bottom-0 left-0",
  "left,top": "top-0 left-0",
};

const GAP_REM = 0.5;

function wallPosition(tile: PlacedTile, wall: Edge[]): string {
  const sides = wall.map((edge) => turn(edge, tile.rotation));
  if (sides.length === 1) return WALL_POSITION[sides[0]];
  const key = Object.keys(CORNER_POSITION).find((k) =>
    sides.every((side) => k.split(",").includes(side)),
  );
  if (key === undefined) throw new Error(`No corner of ${sides.join(", ")}`);
  return CORNER_POSITION[key];
}

export function House({
  engine,
  view,
  focus,
  onAction,
}: {
  engine: Engine;
  view: GameView;
  focus: Focus;
  onAction: (action: Action) => void;
}) {
  const floors = FLOOR_ORDER.filter(
    (floor) =>
      view.board.tiles.some((t) => t.floor === floor) ||
      focus.cells.some((c) => c.floor === floor),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 2xl:grid-cols-2">
        {floors.map((floor) => (
          <Floor
            key={floor}
            engine={engine}
            view={view}
            floor={floor}
            focus={focus}
            onAction={onAction}
          />
        ))}
      </div>
      <Legend view={view} />
    </div>
  );
}

function Floor({
  engine,
  view,
  floor,
  focus,
  onAction,
}: {
  engine: Engine;
  view: GameView;
  floor: FloorId;
  focus: Focus;
  onAction: (action: Action) => void;
}) {
  const tiles = view.board.tiles.filter((t) => t.floor === floor);
  const cells = focus.cells.filter((c) => c.floor === floor);
  const spots = [...tiles, ...cells];
  const minX = Math.min(...spots.map((t) => t.x));
  const minY = Math.min(...spots.map((t) => t.y));
  const columns = Math.max(...spots.map((t) => t.x)) - minX + 1;
  // Rooms shrink to fit the panel, down to a size their names still fit;
  // a wider floor than that scrolls sideways.
  const size = {
    "--cell": `clamp(4.5rem, calc((100cqw - ${(columns - 1) * GAP_REM}rem) / ${columns}), 7.5rem)`,
    gridTemplateColumns: `repeat(${columns}, var(--cell))`,
    gridAutoRows: "var(--cell)",
    gap: `${GAP_REM}rem`,
  } as CSSProperties;
  return (
    <section className="@container min-w-0">
      <h3 className="mb-1 text-sm font-semibold text-(--bt-muted)">
        {FLOOR_NAMES[floor]}{" "}
        <span className="font-normal">
          ({tiles.length} room{tiles.length === 1 ? "" : "s"})
        </span>
      </h3>
      <div className="overflow-x-auto p-2">
        <div className="grid w-max" style={size}>
          {tiles.map((tile) => (
            <Room
              key={tile.tile}
              engine={engine}
              view={view}
              tile={tile}
              column={tile.x - minX + 1}
              row={tile.y - minY + 1}
              focus={focus}
              onAction={onAction}
            />
          ))}
          {cells.map((cell) => {
            const name = engine.catalog.rooms[cell.tile].name;
            const style = {
              gridColumn: cell.x - minX + 1,
              gridRow: cell.y - minY + 1,
            };
            const className =
              "flex items-center justify-center rounded border-2 border-dashed border-(--bt-accent) bg-(--bt-focus) p-1 text-center text-[0.65rem] leading-tight";
            const action = cell.action;
            return action ? (
              <button
                key={`${cell.x},${cell.y}`}
                type="button"
                className={`${className} hover:bg-(--bt-room)`}
                style={style}
                title={`Put the ${name} here`}
                onClick={() => {
                  onAction(action);
                }}
              >
                The {name} can go here
              </button>
            ) : (
              <div key={`${cell.x},${cell.y}`} className={className} style={style}>
                The {name} can go here (choose how below)
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type Door = "joined" | "walled" | "unexplored";

/** What the door on this board edge of a room opens onto. */
function doorKind(engine: Engine, view: GameView, tile: PlacedTile, edge: Edge): Door {
  const cell = neighbourCell(tile, edge);
  const next = roomAt(view.board, tile.floor, cell.x, cell.y);
  if (!next) return "unexplored";
  return openings(engine.catalog, next).includes(opposite(edge)) ? "joined" : "walled";
}

const DOOR_LOOK: Record<Door, { className: string; title: string }> = {
  joined: { className: "bg-(--bt-door)", title: "door" },
  walled: { className: "bg-(--bt-line)", title: "door onto a wall: leads nowhere" },
  unexplored: {
    className: "border border-dashed border-(--bt-door) bg-(--bt-bg)",
    title: "door, not yet explored",
  },
};

function Room({
  engine,
  view,
  tile,
  column,
  row,
  focus,
  onAction,
}: {
  engine: Engine;
  view: GameView;
  tile: PlacedTile;
  column: number;
  row: number;
  focus: Focus;
  onAction: (action: Action) => void;
}) {
  const room = engine.catalog.rooms[tile.tile];
  const here = Object.values(view.figures).filter((f) => f.place?.room === tile.tile);
  const pile = view.piles[tile.tile] ?? [];
  const tokens = view.tokens.filter((t) => t.room === tile.tile);
  const tokenName = (id: string) => engine.catalog.tokens[id].name;
  const stairs = room.links.filter((link) =>
    view.board.tiles.some((t) => t.tile === link),
  );
  const offered = focus.rooms.has(tile.tile);
  const action = focus.rooms.get(tile.tile) ?? null;
  const current = view.turn?.seat;
  const explorable = focus.doorways.filter((d) => d.room === tile.tile);

  const body = (
    <>
      <span className="font-semibold">{room.name}</span>
      {tokens.some((t) => !t.wall) && (
        <span className="text-(--bt-muted)">
          {tokens
            .filter((t) => !t.wall)
            .map((t) => tokenName(t.token))
            .join(", ")}
        </span>
      )}
      {stairs.length > 0 && (
        <span className="text-(--bt-muted)">
          ↕ {stairs.map((s) => engine.catalog.rooms[s].name).join(", ")}
        </span>
      )}
      {pile.length > 0 && (
        <span className="text-(--bt-muted)">
          {pile.length} item{pile.length === 1 ? "" : "s"} here
        </span>
      )}
      <span className="mt-auto flex flex-wrap gap-0.5">
        {here.map((f) => {
          const name = f.name;
          const side = f.place?.side
            ? `, ${sideName(view.board, tile.tile, f.place.side)} side`
            : "";
          const theirs = f.owner !== null && f.owner === current;
          return (
            <span
              key={f.id}
              className={`rounded px-1 font-semibold text-(--bt-bg) ${figureBg(f.owner)} ${theirs ? "ring-2 ring-(--bt-ink)" : ""}`}
              title={`${f.owner === null ? "" : `${view.seats[f.owner].name}: `}${name}${side}${theirs ? " (their turn)" : ""}`}
            >
              {theirs ? "▶ " : ""}
              {name.split(" ")[0]}
            </span>
          );
        })}
      </span>
    </>
  );

  const frame = `relative flex min-w-0 flex-col gap-0.5 rounded-sm border p-1.5 text-left text-[0.65rem] leading-tight ${
    offered
      ? "border-2 border-(--bt-accent) bg-(--bt-focus)"
      : "border-(--bt-line) bg-(--bt-room)"
  }`;
  const style = { gridColumn: column, gridRow: row };
  const title = `${room.name}, turned ${tile.rotation * 90}°`;

  return (
    <div className="relative" style={style}>
      {action ? (
        <button
          type="button"
          className={`${frame} size-full hover:bg-(--bt-room)`}
          title={`${title}: move here`}
          onClick={() => {
            onAction(action);
          }}
        >
          {body}
        </button>
      ) : (
        <div className={`${frame} size-full`} title={title}>
          {body}
        </div>
      )}
      {openings(engine.catalog, tile).map((edge) => {
        const explore = explorable.find((d) => d.direction === edge);
        if (explore)
          return (
            <button
              key={edge}
              type="button"
              className={`absolute z-10 rounded-sm bg-(--bt-accent) ${DOOR_POSITION[edge]}`}
              title={`Explore through the ${COMPASS[edge]} door`}
              aria-label={`Explore through the ${COMPASS[edge]} door of the ${room.name}`}
              onClick={() => {
                onAction(explore.action);
              }}
            />
          );
        const look = DOOR_LOOK[doorKind(engine, view, tile, edge)];
        return (
          <span
            key={edge}
            className={`absolute z-10 rounded-sm ${DOOR_POSITION[edge]} ${look.className}`}
            title={`${COMPASS[edge]} ${look.title}`}
          />
        );
      })}
      {tokens.flatMap((t) =>
        t.wall
          ? [
              <span
                key={`${t.token}-${t.wall.join()}`}
                className={`absolute z-10 size-2 bg-(--bt-accent) ${wallPosition(tile, t.wall)}`}
                title={`${tokenName(t.token)} token on this wall`}
              />,
            ]
          : [],
      )}
    </div>
  );
}

function Legend({ view }: { view: GameView }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--bt-muted)">
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-4 rounded-sm bg-(--bt-door)" /> door
        joining two rooms
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-4 rounded-sm border border-dashed border-(--bt-door)" />{" "}
        door to explore
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-4 rounded-sm bg-(--bt-accent)" />{" "}
        highlighted: the pending choice (click to choose)
      </span>
      {Object.values(view.figures).map((f) => (
        <span key={f.id} className="flex items-center gap-1">
          <span className={`inline-block size-2.5 rounded-full ${figureBg(f.owner)}`} />
          {f.owner === null ? "" : `${view.seats[f.owner].name}: `}
          {f.name}
        </span>
      ))}
    </div>
  );
}
