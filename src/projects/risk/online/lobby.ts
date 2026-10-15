import { MAX_PLAYERS, seatOf, type GameRow } from "./table";

/*
 * The lobby: every game in `risk_games`, most recently active first, kept
 * live by a subscription to the whole table. The rows are the one source of
 * truth: the list is built from a load and the writes and deletes heard
 * since, each row kept at the newest version seen, so a load that answers
 * after a newer write never takes the list back.
 */

/** A game as the lobby lists it: its row without the game itself. */
export interface TableSummary extends Omit<GameRow, "game"> {
  /** When it was last written, as an ISO time: orders the list. */
  updatedAt: string;
}

/** A row as the database keeps it, game aside. */
export type SummaryRow = Omit<GameRow, "game"> & { updated_at: string };

export function summarize({ id, version, status, seats, updated_at }: SummaryRow): TableSummary {
  return { id, version, status, seats, updatedAt: updated_at };
}

/** What the lobby hears: a load of every game, one game written, or one deleted. */
export type LobbyChange = { kind: "loaded"; tables: readonly TableSummary[] } | { kind: "written"; table: TableSummary } | { kind: "deleted"; id: string };

export interface LobbyState {
  /** False until the first load answers. */
  loaded: boolean;
  byId: ReadonlyMap<string, TableSummary>;
  /** Games heard deleted, so a load already under way can't bring one back. */
  deleted: ReadonlySet<string>;
}

export const EMPTY_LOBBY: LobbyState = { loaded: false, byId: new Map(), deleted: new Set() };

const newer = (held: TableSummary | undefined, next: TableSummary) => !held || next.version > held.version;

export function applyLobbyChange(state: LobbyState, change: LobbyChange): LobbyState {
  switch (change.kind) {
    case "loaded": {
      const byId = new Map(state.byId);
      for (const table of change.tables) if (!state.deleted.has(table.id) && newer(byId.get(table.id), table)) byId.set(table.id, table);
      return { ...state, loaded: true, byId };
    }
    case "written": {
      const { table } = change;
      // A write after a delete is a new game that drew the same id.
      const deleted = new Set(state.deleted);
      deleted.delete(table.id);
      if (!state.deleted.has(table.id) && !newer(state.byId.get(table.id), table)) return state;
      return { ...state, byId: new Map(state.byId).set(table.id, table), deleted };
    }
    case "deleted": {
      const byId = new Map(state.byId);
      byId.delete(change.id);
      return { ...state, byId, deleted: new Set(state.deleted).add(change.id) };
    }
  }
}

/** Every game, most recently active first. */
export function lobbyTables(state: LobbyState): TableSummary[] {
  return [...state.byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

/** What tapping a game does for this player: take a seat at a gathering table, come back to
 *  their own, or watch (a game in play, a full table, or a game that is over). */
export type OpenAction = "join" | "rejoin" | "watch";

export function openAction(table: Pick<GameRow, "status" | "seats">, profileId: string): OpenAction {
  if (table.status === "over") return "watch";
  if (seatOf(table, profileId) !== null) return "rejoin";
  return table.status === "lobby" && table.seats.length < MAX_PLAYERS ? "join" : "watch";
}
