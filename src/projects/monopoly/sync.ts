"use client";

import { createClient } from "@/shared/lib/supabase/client";
import { isLocalhost } from "@/shared/lib/utils";
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

/** List games for the lobby browser: every row, newest first — joinable
 *  (`lobby`), in play (`active`), and `finished` alike. Finished games stay in
 *  the list so players can reopen the final board and review the log (or delete
 *  it); the row renders with an "ended" badge. The reserved `dev` sandbox is
 *  hidden in production — reachable only via the direct `?game=dev` link — but
 *  surfaced in the list on localhost so it's one tap away while developing. */
export async function listGames(): Promise<GameSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, state, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data as { id: string; state: GameState; updated_at: string }[];
  const showDev = isLocalhost();
  return rows
    .filter((r) => r.id !== "dev" || showDev)
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

/** Permanently delete a game via the authoritative route (clients can't delete
 *  the row directly — RLS). Returns `null` on success, or an error message to
 *  surface. A destructive op; callers must confirm with the user first. */
export async function deleteGame(gameId: string): Promise<string | null> {
  const res = await submitAction(gameId, { type: "delete" });
  if (res.ok) return null;
  return res.reason ?? "Failed to delete game";
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

/** Subscribe to changes across the whole games table — any insert, update, or
 *  delete. `onChange` fires (with no payload) on every such event; the lobby
 *  browser uses it to re-run `listGames` so the open-games list stays live
 *  without a manual refresh. Returns a cleanup function that tears down the
 *  channel. Unlike `subscribeGame` this has no `id` filter, so it sees every
 *  row. */
export function subscribeGames(onChange: () => void): () => void {
  const supabase = createClient();
  const channel = supabase.channel("monopoly:all");
  let closed = false;

  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: TABLE },
    () => { onChange(); },
  );

  channel.subscribe();

  return () => {
    if (closed) return;
    closed = true;
    void supabase.removeChannel(channel);
  };
}
