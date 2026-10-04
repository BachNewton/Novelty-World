import type { Edge, FloorId, GameState, PlacedTile } from "../types";
import { openings } from "../engine/board";
import type { Engine } from "../engine/step-loop";

/** Top of the house first, the way the floors stack. */
const FLOOR_ORDER: FloorId[] = ["roof", "upper", "ground", "basement"];

const FLOOR_NAMES: Record<FloorId, string> = {
  roof: "Roof",
  upper: "Upper floor",
  ground: "Ground floor",
  basement: "Basement",
};

const DOOR_POSITION: Record<Edge, string> = {
  top: "top-0 left-1/2 h-1 w-6 -translate-x-1/2",
  bottom: "bottom-0 left-1/2 h-1 w-6 -translate-x-1/2",
  left: "left-0 top-1/2 w-1 h-6 -translate-y-1/2",
  right: "right-0 top-1/2 w-1 h-6 -translate-y-1/2",
};

export function House({ engine, state }: { engine: Engine; state: GameState }) {
  const floors = FLOOR_ORDER.filter((floor) =>
    state.board.tiles.some((t) => t.floor === floor),
  );
  return (
    <div className="flex flex-col gap-4">
      {floors.map((floor) => (
        <Floor
          key={floor}
          engine={engine}
          state={state}
          floor={floor}
          tiles={state.board.tiles.filter((t) => t.floor === floor)}
        />
      ))}
    </div>
  );
}

function Floor({
  engine,
  state,
  floor,
  tiles,
}: {
  engine: Engine;
  state: GameState;
  floor: FloorId;
  tiles: PlacedTile[];
}) {
  const minX = Math.min(...tiles.map((t) => t.x));
  const minY = Math.min(...tiles.map((t) => t.y));
  const columns = Math.max(...tiles.map((t) => t.x)) - minX + 1;
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-(--bt-muted)">
        {FLOOR_NAMES[floor]}
      </h3>
      <div className="overflow-x-auto pb-1">
        <div
          className="grid w-max auto-rows-[6rem] gap-0.5"
          style={{ gridTemplateColumns: `repeat(${columns}, 6rem)` }}
        >
          {tiles.map((tile) => (
            <Room
              key={tile.tile}
              engine={engine}
              state={state}
              tile={tile}
              column={tile.x - minX + 1}
              row={tile.y - minY + 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Room({
  engine,
  state,
  tile,
  column,
  row,
}: {
  engine: Engine;
  state: GameState;
  tile: PlacedTile;
  column: number;
  row: number;
}) {
  const room = engine.catalog.rooms[tile.tile];
  const here = state.explorers.filter((e) => e.room === tile.tile);
  const pile = state.piles[tile.tile] ?? [];
  const stairs = room.links.filter((link) =>
    state.board.tiles.some((t) => t.tile === link),
  );
  return (
    <div
      className="relative flex w-24 flex-col gap-0.5 overflow-hidden border border-(--bt-line) bg-(--bt-room) p-1.5 text-[0.65rem] leading-tight"
      style={{ gridColumn: column, gridRow: row }}
      title={`${room.name} (${tile.x}, ${tile.y}) rotated ${tile.rotation * 90}°`}
    >
      {openings(engine.catalog, tile).map((edge) => (
        <span
          key={edge}
          className={`absolute bg-(--bt-door) ${DOOR_POSITION[edge]}`}
        />
      ))}
      <span className="font-semibold">{room.name}</span>
      {stairs.length > 0 && (
        <span className="text-(--bt-muted)">
          to {stairs.map((s) => engine.catalog.rooms[s].name).join(", ")}
        </span>
      )}
      {pile.length > 0 && (
        <span className="text-(--bt-muted)">
          {pile.length} item{pile.length === 1 ? "" : "s"} here
        </span>
      )}
      <span className="mt-auto flex flex-wrap gap-0.5">
        {here.map((e) => (
          <span
            key={e.seat}
            className="rounded bg-(--bt-accent) px-1 text-(--bt-bg)"
            title={engine.catalog.characters[e.character].name}
          >
            {e.seat}:{" "}
            {engine.catalog.characters[e.character].name.split(" ")[0]}
          </span>
        ))}
      </span>
    </div>
  );
}
