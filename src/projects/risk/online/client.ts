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
    channel.on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `id=eq.${id}` }, (payload: RealtimePostgresChangesPayload<Row>) => {
      if (payload.eventType !== "DELETE") onRow(payload.new);
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") onConnected();
    });
    return () => void supabase.removeChannel(channel);
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
