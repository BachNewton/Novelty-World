import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { isRecord, parseWorld } from "@/projects/whisker-hollow/parse";

const WORLD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TABLE = "whisker_hollow_worlds";

/** The saved garden, or null when none has been planted yet. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("world");
  if (id === null || !WORLD_ID.test(id)) return NextResponse.json({ error: "Which world?" }, { status: 400 });
  const { data, error } = await createAdminClient().from(TABLE).select("world").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ world: (data as { world: unknown } | null)?.world ?? null });
}

/** The host's newest garden, checked whole before it is kept. */
export async function POST(request: NextRequest) {
  const body: unknown = await request.json();
  if (!isRecord(body) || typeof body.world !== "string" || !WORLD_ID.test(body.world)) {
    return NextResponse.json({ error: "Which world?" }, { status: 400 });
  }
  const world = parseWorld(body.state);
  if (world === null) return NextResponse.json({ error: "That isn't a garden" }, { status: 400 });
  const { error } = await createAdminClient()
    .from(TABLE)
    .upsert({ id: body.world, world, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
