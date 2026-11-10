"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/shared/lib/supabase/client";
import type { SpotWindow } from "./logic";

const TABLE = "spot_windows";

/** Reads every window that ends after `since`, and calls `onWindow` with every
 *  write after. `onWindows` hears the whole list each time the subscription
 *  (re)connects, so a write missed while it was down still shows. */
export function watchWindows(
  since: number,
  handlers: {
    onWindows: (windows: SpotWindow[]) => void;
    onWindow: (window: SpotWindow) => void;
    onError: (message: string) => void;
  },
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(`spot-windows-${since.toString()}`);
  channel.on("postgres_changes", { event: "*", schema: "public", table: TABLE }, (payload: RealtimePostgresChangesPayload<SpotWindow>) => {
    if (payload.eventType !== "DELETE") handlers.onWindow(payload.new);
  });
  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") {
      void supabase
        .from(TABLE)
        .select("*")
        .gte("ended_at", new Date(since).toISOString())
        .order("started_at", { ascending: true })
        .returns<SpotWindow[]>()
        .then(({ data, error: readError }) => {
          if (readError) handlers.onError(`Reading the windows: ${readError.message}`);
          else handlers.onWindows(data);
        });
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      handlers.onError(`Live updates: ${error?.message ?? status}`);
    }
  });
  return () => {
    void supabase.removeChannel(channel);
  };
}
