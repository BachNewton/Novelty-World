import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { parseBackground, parseByStakes, parseSubmission, isProfileId, isRecord, personKey, type SharedResult } from "@/projects/ai-compass/results";
import { scoreAnswers, scoreByStakes } from "@/projects/ai-compass/quiz";

const TABLE = "ai_compass_results";
const COLUMNS = "id, profile_id, name, scope, ownership, background, by_stakes";

interface Row {
  id: string;
  profile_id: string;
  name: string;
  scope: number;
  ownership: number;
  background: unknown;
  by_stakes: unknown;
}

async function shared(row: Row): Promise<SharedResult> {
  const background = parseBackground(row.background);
  const byStakes = parseByStakes(row.by_stakes);
  if (background === null || byStakes === null) throw new Error(`AI Compass result ${row.id} doesn't parse`);
  return {
    id: row.id,
    person: await personKey(row.profile_id),
    name: row.name,
    scope: row.scope,
    ownership: row.ownership,
    background,
    byStakes,
  };
}

/** Every shared result, without anyone's profile id. */
export async function GET() {
  const { data, error } = await createAdminClient().from(TABLE).select(COLUMNS).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ results: await Promise.all((data as Row[]).map(shared)) });
}

/** A finished quiz, shared by the person who took it. The point is scored
 *  here, from the answers, so it can only be one the quiz gives. Each profile
 *  has one point on the map, so sharing again replaces it. */
export async function POST(request: NextRequest) {
  const submission = parseSubmission(await request.json());
  if (submission === null) return NextResponse.json({ error: "That isn't a finished quiz" }, { status: 400 });
  const point = scoreAnswers(submission.answers);
  const { data, error } = await createAdminClient()
    .from(TABLE)
    .upsert(
      {
        profile_id: submission.profileId,
        name: submission.name,
        scope: point.scope,
        ownership: point.ownership,
        answers: submission.answers,
        background: submission.background,
        by_stakes: scoreByStakes(submission.answers),
      },
      { onConflict: "profile_id" },
    )
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ result: await shared(data as Row) });
}

/** Takes a shared result back off the map. Only the profile that shared it
 *  can, since only it knows its profile id. */
export async function DELETE(request: NextRequest) {
  const body: unknown = await request.json();
  if (!isRecord(body) || !isProfileId(body.profileId) || typeof body.id !== "string") {
    return NextResponse.json({ error: "Which result?" }, { status: 400 });
  }
  const { error } = await createAdminClient().from(TABLE).delete().eq("id", body.id).eq("profile_id", body.profileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
