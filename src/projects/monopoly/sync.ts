"use client";

import { createClient } from "@/shared/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { MonopolyAction, MonopolyResult } from "./protocol";
import type { GameState, Player } from "./types";

// One row per game in public.monopoly_games (see supabase/monopoly.sql).
// The /api/monopoly route is the only writer; every client reads here and
// subscribes via postgres-changes.
const TABLE = "monopoly_games";

// Object-literal type (not interface) so it satisfies the index-signature
// constraint on RealtimePostgresChangesPayload's generic.
type GameRow = {
  id: string;
  state: GameState;
  version: number;
  updated_at: string;
};

/** A loaded game row: the authoritative state plus its optimistic-concurrency
 *  version. */
export interface LoadedGame {
  state: GameState;
  version: number;
}

/** Lightweight view of a game for the lobby browser, derived from the row's
 *  state JSON. Only what the list needs — full state is loaded on open. */
export interface GameSummary {
  id: string;
  status: GameState["status"];
  /** Seated players, in play order, for the roster preview. */
  players: readonly Player[];
  /** Row `updated_at` (ISO 8601) — when the game was last touched/played. */
  updatedAt: string;
}

/** List joinable / watchable games for the lobby: every row that is still a
 *  `lobby` or in play (`active`), newest first. Finished games are kept in
 *  the table for history but excluded here. The reserved `dev` sandbox is
 *  hidden too — it's reachable only via the direct `?game=dev` link. */
export async function listGames(): Promise<GameSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, state, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data as { id: string; state: GameState; updated_at: string }[];
  return rows
    .filter(
      (r) =>
        r.id !== "dev" &&
        (r.state.status === "lobby" || r.state.status === "active"),
    )
    .map((r) => ({
      id: r.id,
      status: r.state.status,
      players: r.state.players,
      updatedAt: r.updated_at,
    }));
}

/** Read the current game, or null if the row doesn't exist yet. Throws on a
 *  real query error so the caller can surface it. */
export async function loadGame(gameId: string): Promise<LoadedGame | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("state, version")
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { state: data.state as GameState, version: data.version as number };
}

/** Submit an action to the authoritative route. Clients can't write the table
 *  directly (RLS); every mutation goes through here. Network/parse failures
 *  surface as a rejected result rather than throwing, so callers have a single
 *  shape to handle. */
export async function submitAction(
  gameId: string,
  action: MonopolyAction,
): Promise<MonopolyResult> {
  try {
    const res = await fetch("/api/monopoly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId, action }),
    });
    return (await res.json()) as MonopolyResult;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Subscribe to authoritative state changes for a game. `onState` fires for
 *  every insert/update to the row with the new state and version. Returns a
 *  cleanup function that tears down the channel — call it on unmount or when
 *  the game id changes. Mirrors the channel lifecycle in webrtc/signaling.ts. */
export function subscribeGame(
  gameId: string,
  onState: (state: GameState, version: number) => void,
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
      onState(payload.new.state, payload.new.version);
    },
  );

  channel.subscribe();

  return () => {
    if (closed) return;
    closed = true;
    void supabase.removeChannel(channel);
  };
}
