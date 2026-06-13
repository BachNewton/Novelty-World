"use client";

import { createClient } from "@/shared/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { GameState } from "./types";

// One row per game in public.monopoly_games (see supabase/monopoly.sql).
// The host is the only writer; every client subscribes via postgres-changes.
const TABLE = "monopoly_games";

// Object-literal type (not interface) so it satisfies the index-signature
// constraint on RealtimePostgresChangesPayload's generic.
type GameRow = {
  id: string;
  state: GameState;
  updated_at: string;
};

/** Read the current GameState for a game, or null if the row doesn't exist
 *  yet. Throws on a real query error so the caller can surface it. */
export async function loadGame(gameId: string): Promise<GameState | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("state")
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw error;
  return data ? (data.state as GameState) : null;
}

/** Write the authoritative GameState for a game. Upsert so the first write
 *  creates the row and later writes replace it. Host-only. */
export async function saveGame(
  gameId: string,
  state: GameState,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: gameId, state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Subscribe to authoritative state changes for a game. `onState` fires for
 *  every insert/update to the row with the new GameState. Returns a cleanup
 *  function that tears down the channel — call it on unmount or when the
 *  game id changes. Mirrors the channel lifecycle in webrtc/signaling.ts. */
export function subscribeGame(
  gameId: string,
  onState: (state: GameState) => void,
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(`monopoly:${gameId}`);
  let closed = false;

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: TABLE,
      filter: `id=eq.${gameId}`,
    },
    (payload: RealtimePostgresChangesPayload<GameRow>) => {
      // DELETE carries no new row; inserts and updates do. Narrow on
      // eventType so we don't poke at a possibly-empty `new`.
      if (payload.eventType === "DELETE") return;
      onState(payload.new.state);
    },
  );

  channel.subscribe();

  return () => {
    if (closed) return;
    closed = true;
    void supabase.removeChannel(channel);
  };
}
