import process from "node:process";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { LIVE_TABLE } from "./live-row";
import type { LiveSink } from "./live";

/** The live page's sink: `bot_lab_runs`, written with the service-role key read
 *  from `envFile` (the checkout's `.env.local`). Without the keys the run plays
 *  unpublished, and says so once. */
export function liveSinkFromEnv(envFile: string): LiveSink | null {
  try {
    process.loadEnvFile(envFile);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("  Live page: no Supabase keys in .env.local, so this run isn't published.");
    return null;
  }
  const db = createAdminClient();
  return {
    write: async (row) => {
      const { error } = await db.from(LIVE_TABLE).upsert(row);
      if (error) throw new Error(error.message);
    },
  };
}
