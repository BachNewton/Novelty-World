import type { createAdminClient } from "@/shared/lib/supabase/server-admin";
import type { RowChange, RowStore } from "./server";
import type { GameRow, LoggedMove } from "./table";

/** `risk_games` (`supabase/risk.sql`), read and written with the service role: server code only. */
export const TABLE = "risk_games";
export const COLUMNS = "id, version, status, seats, game";

type Db = ReturnType<typeof createAdminClient>;

/** Moves read per request: the API's default row limit. */
const MOVES_PAGE = 1000;

// Postgres's unique-violation code: the id is taken.
const UNIQUE_VIOLATION = "23505";

/** The row's write and the answer's log entry, in one transaction (`risk_commit_answer`). */
async function commitAnswer(db: Db, id: string, fromVersion: number, change: RowChange, answer: LoggedMove): Promise<GameRow | null> {
  const { data, error } = await db.rpc("risk_commit_answer", {
    p_id: id,
    p_from_version: fromVersion,
    p_status: change.status,
    p_seats: change.seats,
    p_game: change.game,
    p_decision: answer.decision,
    p_seat: answer.seat,
    p_controller: answer.controller,
    p_move: answer.move,
  });
  if (error) throw new Error(`Writing Risk game ${id}: ${error.message}`);
  return data as GameRow | null;
}

export function supabaseStore(db: Db): RowStore {
  const stamp = (change: RowChange) => ({ ...change, updated_at: new Date().toISOString() });
  return {
    read: async (id) => {
      const { data, error } = await db.from(TABLE).select(COLUMNS).eq("id", id).maybeSingle<GameRow>();
      if (error) throw new Error(`Reading Risk game ${id}: ${error.message}`);
      return data;
    },
    write: async (id, fromVersion, change, answer) => {
      if (answer) return commitAnswer(db, id, fromVersion, change, answer);
      const { data, error } = await db
        .from(TABLE)
        .update({ ...stamp(change), version: fromVersion + 1 })
        .eq("id", id)
        .eq("version", fromVersion)
        .select(COLUMNS)
        .maybeSingle<GameRow>();
      if (error) throw new Error(`Writing Risk game ${id}: ${error.message}`);
      return data;
    },
    insert: async (id, change) => {
      const { data, error } = await db
        .from(TABLE)
        .insert({ id, version: 0, ...stamp(change) })
        .select(COLUMNS)
        .single<GameRow>();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error) throw new Error(`Creating Risk game ${id}: ${error.message}`);
      return data;
    },
    // Read a page at a time: the API returns at most its row limit per request, and a long game
    // logs more moves than that.
    moves: async (id) => {
      const moves: LoggedMove[] = [];
      for (;;) {
        const { data, error } = await db
          .from("risk_moves")
          .select("decision, seat, controller, move")
          .eq("game_id", id)
          .order("decision")
          .range(moves.length, moves.length + MOVES_PAGE - 1)
          .returns<LoggedMove[]>();
        if (error) throw new Error(`Reading Risk game ${id}'s moves: ${error.message}`);
        moves.push(...data);
        if (data.length < MOVES_PAGE) return moves;
      }
    },
    // The move log goes with it (`on delete cascade`).
    remove: async (id) => {
      const { data, error } = await db.from(TABLE).delete().eq("id", id).select(COLUMNS).maybeSingle<GameRow>();
      if (error) throw new Error(`Deleting Risk game ${id}: ${error.message}`);
      return data;
    },
  };
}
