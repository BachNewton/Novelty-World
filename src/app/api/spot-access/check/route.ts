import { createHash, timingSafeEqual } from "node:crypto";
import { Socket } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/server-admin";
import { planCheck, type SpotWindow } from "@/projects/spot-access/logic";

const TABLE = "spot_windows";
const TIMEOUT_MS = 5000;

/** Errors that mean the port isn't taking connections. Anything else (a host
 *  that doesn't resolve, say) is a broken setting, not a busy machine. */
const UNAVAILABLE = new Set(["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT"]);

/** Whether a TCP connection to the port opens. Nothing is ever sent on it. */
function portOpens(host: string, port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const settle = (finish: () => void) => {
      socket.destroy();
      finish();
    };
    socket.setTimeout(TIMEOUT_MS, () => settle(() => resolve(false)));
    socket.once("connect", () => settle(() => resolve(true)));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      settle(() => (error.code !== undefined && UNAVAILABLE.has(error.code) ? resolve(false) : reject(error))),
    );
    socket.connect(port, host);
  });
}

function sameSecret(given: string, expected: string): boolean {
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

function settings() {
  const host = process.env.SPOT_HOST;
  const port = Number(process.env.SPOT_PORT);
  const secret = process.env.SPOT_CHECK_SECRET;
  if (!host || !Number.isInteger(port) || !secret) {
    throw new Error("Spot Access needs SPOT_HOST, SPOT_PORT and SPOT_CHECK_SECRET");
  }
  return { host, port, secret };
}

/** One availability check, called every minute by pg_cron (supabase/spot-access.sql). */
export async function POST(request: NextRequest) {
  const { host, port, secret } = settings();
  if (!sameSecret(request.headers.get("x-spot-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  const up = await portOpens(host, port);
  const supabase = createAdminClient();
  const { data: latest, error: readError } = await supabase
    .from(TABLE)
    .select("*")
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle<SpotWindow>();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  const write = planCheck(latest, up, Date.now());
  if (write.update) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ended_at: write.update.endedAt })
      .eq("id", write.update.id)
      .eq("ended_at", write.update.expectedEndedAt)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data.length === 0) return NextResponse.json({ error: "Another check wrote first" }, { status: 409 });
  }
  if (write.insert) {
    const { startedAt, endedAt } = write.insert;
    const { error } = await supabase.from(TABLE).insert({ up, started_at: startedAt, ended_at: endedAt });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ up, newWindow: write.insert !== null });
}
