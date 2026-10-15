"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/shared/lib/supabase/client";
import type { Request, Response } from "./protocol";
import type { GameRow } from "./table";

/** How a phone reaches a game: read and subscribe with the anon key, write through the route. */
export interface GameIo {
  load: (id: string) => Promise<GameRow | null>;
  /** Calls `onRow` for every write, and `onConnected` whenever the subscription (re)connects. */
  subscribe: (id: string, onRow: (row: GameRow) => void, onConnected: () => void) => () => void;
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
  subscribe: (id, onRow, onConnected) => {
    const supabase = createClient();
    const channel = supabase.channel(`risk:${id}`);
    riskDiag("subscribe", id);
    channel.on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `id=eq.${id}` }, (payload: RealtimePostgresChangesPayload<Row>) => {
      riskDiag("realtime row", payload.eventType, payload.eventType === "DELETE" ? "" : payload.new.version);
      if (payload.eventType !== "DELETE") onRow(payload.new);
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
