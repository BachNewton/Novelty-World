import { after, NextResponse, type NextRequest } from "next/server";
import { generateRoomCode } from "@/shared/lib/peer/protocol";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { ENGINE } from "@/projects/risk/online/engine";
import { parseRequest, type Response } from "@/projects/risk/online/protocol";
import { drive, handle, type ServerDeps } from "@/projects/risk/online/server";
import { botToMove } from "@/projects/risk/online/table";
import { supabaseStore } from "@/projects/risk/online/supabase-store";

// Bots play inside this function after its response has gone (`after`). A drive
// makes a bounded number of decisions, then hands on to a fresh request, so this
// is a ceiling for one drive, not a turn's time limit.
export const maxDuration = 300;

function deps(): ServerDeps {
  return {
    engine: ENGINE,
    store: supabaseStore(createAdminClient()),
    newId: generateRoomCode,
    newSeed: () => crypto.randomUUID(),
  };
}

/** Plays the bot seats once this response is out. When a drive runs out of decisions it
 *  nudges the route again, so the next stretch runs in a request of its own. */
function driveAfter(server: ServerDeps, gameId: string, origin: string) {
  after(async () => {
    if ((await drive(server, gameId)) === "more") {
      await fetch(new URL("/api/risk", origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "nudge", game: gameId }),
      });
    }
  });
}

export async function POST(request: NextRequest): Promise<NextResponse<Response>> {
  const parsed = parseRequest(await request.json());
  if (!parsed) return NextResponse.json({ ok: false, reason: "That isn't a Risk request", row: null }, { status: 400 });
  const server = deps();
  const response = await handle(server, parsed);
  if (response.row && botToMove(server.engine, response.row)) driveAfter(server, response.row.id, request.nextUrl.origin);
  return NextResponse.json(response);
}
