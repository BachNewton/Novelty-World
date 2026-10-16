"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { LIVE_TABLE, type LiveRow } from "@/shared/lib/bot-lab/live-row";
import { createClient } from "@/shared/lib/supabase/client";

/** The runs the page lists: the latest ones. */
const LISTED = 30;

/** Reads the latest runs, and calls `onRow` with every write after. `onRows` hears
 *  the whole list each time the subscription (re)connects, so a write missed while
 *  it was down still shows. */
export function watchRuns(handlers: {
  onRows: (rows: LiveRow[]) => void;
  onRow: (row: LiveRow) => void;
  onError: (message: string) => void;
}): () => void {
  const supabase = createClient();
  const channel = supabase.channel("bot-lab-runs");
  channel.on("postgres_changes", { event: "*", schema: "public", table: LIVE_TABLE }, (payload: RealtimePostgresChangesPayload<LiveRow>) => {
    if (payload.eventType !== "DELETE") handlers.onRow(payload.new);
  });
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") {
      void supabase
        .from(LIVE_TABLE)
        .select("*")
        .order("started_at", { ascending: false })
        .limit(LISTED)
        .returns<LiveRow[]>()
        .then(({ data, error: readError }) => {
          if (readError) handlers.onError(`Reading the runs: ${readError.message}`);
          else handlers.onRows(data);
        });
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      handlers.onError(`Live updates: ${error?.message ?? status}`);
    }
  });
  return () => {
    void supabase.removeChannel(channel);
  };
}
