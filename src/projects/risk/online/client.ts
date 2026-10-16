"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/shared/lib/supabase/client";
import { summarize, type LobbyChange, type SummaryRow, type TableSummary } from "./lobby";
import type { Request, Response } from "./protocol";
import type { GameRow } from "./table";

export interface GameListener {
  /** Every write. */
  onRow: (row: GameRow) => void;
  /** The game was deleted. */
  onGone: () => void;
  /** Whenever the subscription (re)connects. */
  onConnected: () => void;
}

/** How a phone reaches a game: read and subscribe with the anon key, write through the route. */
export interface GameIo {
  load: (id: string) => Promise<GameRow | null>;
  subscribe: (id: string, listener: GameListener) => () => void;
  post: (request: Request) => Promise<Response>;
}

/** Traces the game's connection and the rows it hears, in development with `?risk-diag` in the
 *  address. It is for a page that once sat on "Waiting…" while the bots' moves reached the
 *  database: its subscription said SUBSCRIBED, yet no write reached it again. The trace says
 *  which part went quiet: the channel's status changes, Realtime's own word on the database
 *  subscription (a "system" message), each row heard (with its version), and each row the store
 *  takes against the version it holds. */
export function riskDiag(...parts: unknown[]): void {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return;
  if (!new URLSearchParams(window.location.search).has("risk-diag")) return;
  console.info("[risk-diag]", ...parts);
}

const TABLE = "risk_games";
const COLUMNS = "id, version, status, seats, game";

type Row = GameRow & { [column: string]: unknown };

export const browserIo: GameIo = {
  load: async (id) => {
    const { data, error } = await createClient().from(TABLE).select(COLUMNS).eq("id", id).maybeSingle<GameRow>();
    if (error) throw new Error(`Loading Risk game ${id}: ${error.message}`);
    return data;
  },
  subscribe: (id, { onRow, onGone, onConnected }) => {
    const supabase = createClient();
    const channel = supabase.channel(`risk:${id}`);
    riskDiag("subscribe", id);
    channel.on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `id=eq.${id}` }, (payload: RealtimePostgresChangesPayload<Row>) => {
      riskDiag("realtime row", payload.eventType, payload.eventType === "DELETE" ? "" : payload.new.version);
      // Realtime doesn't filter deletes, and a delete carries only the row's key.
      if (payload.eventType !== "DELETE") onRow(payload.new);
      else if (payload.old.id === id) onGone();
    });
    channel.on("system", {}, (payload: unknown) => riskDiag("realtime system", payload));
    channel.subscribe((status, error) => {
      riskDiag("channel status", status, error?.message ?? "");
      if (status === "SUBSCRIBED") onConnected();
    });
    return () => {
      riskDiag("unsubscribe", id);
      void supabase.removeChannel(channel);
    };
  },
  post: async (request) => {
    const response = await fetch("/api/risk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok && response.status !== 400) throw new Error(`The Risk server answered ${response.status.toString()}`);
    return (await response.json()) as Response;
  },
};

/** How the lobby reaches every game: read and subscribe to the whole table with the anon key. */
export interface LobbyIo {
  /** Every game, its state aside. */
  list: () => Promise<TableSummary[]>;
  subscribe: (listener: LobbyListener) => () => void;
}

export interface LobbyListener {
  /** Every write and delete to any game. */
  onChange: (change: LobbyChange) => void;
  /** Whenever the subscription (re)connects: the time to load the list. */
  onConnected: () => void;
  /** The subscription failed; Supabase retries it, and `onConnected` follows when it is back. */
  onError: () => void;
}

const LOBBY_COLUMNS = "id, version, status, seats, updated_at";

type LobbyRow = SummaryRow & { [column: string]: unknown };

export const browserLobbyIo: LobbyIo = {
  list: async () => {
    const { data, error } = await createClient().from(TABLE).select(LOBBY_COLUMNS).order("updated_at", { ascending: false }).returns<SummaryRow[]>();
    if (error) throw new Error(`Listing Risk games: ${error.message}`);
    return data.map(summarize);
  },
  subscribe: ({ onChange, onConnected, onError }) => {
    const supabase = createClient();
    const channel = supabase.channel("risk:lobby");
    channel.on("postgres_changes", { event: "*", schema: "public", table: TABLE }, (payload: RealtimePostgresChangesPayload<LobbyRow>) => {
      // A delete carries only the row's key.
      if (payload.eventType === "DELETE") {
        if (typeof payload.old.id !== "string") throw new Error("A Risk game's delete came without its id");
        onChange({ kind: "deleted", id: payload.old.id });
      } else onChange({ kind: "written", table: summarize(payload.new) });
    });
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") onConnected();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`Risk lobby subscription ${status}`, error);
        onError();
      }
    });
    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
