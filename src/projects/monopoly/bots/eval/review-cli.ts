import { readFileSync } from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { netWorth } from "../../engine";
import { spaceName } from "../../logic";
import type { GameEvent, GameState, Player } from "../../types";
import { renderHighlight, type NameOf } from "./render-log";

/** `npm run game:review` — pull a REAL (human + bot) finished or in-progress game
 *  straight from the Supabase row and print it for analysis: the full annotated
 *  play-by-play, final standings, per-seat holdings, and a money-flow tally. The
 *  point is to compile a played game into something a human (or Claude) can read
 *  and learn from — especially "why did the bots lose?" The script does NO
 *  analysis itself; it just lays the game out. Reads only (anon key); the table
 *  is RLS read-open.
 *
 *  Usage:
 *    npm run game:review                  # list every game, newest first
 *    npm run game:review -- --list        # same
 *    npm run game:review -- <id>          # full review of one game
 *    npm run game:review -- <id> --quiet  # skip the dice/rent noise, decisions only
 */

const TABLE = "monopoly_games";

/** Decision/structural event kinds — everything that isn't dice-and-rent noise.
 *  `--quiet` keeps only these (mirrors what `npm run sim --log` shows). */
const DECISION_KINDS: ReadonlySet<GameEvent["kind"]> = new Set([
  "bot-note",
  "buy",
  "auction",
  "build",
  "sell-building",
  "mortgage",
  "unmortgage",
  "trade",
  "trade-declined",
  "bankrupt",
  "winner",
]);

/** Load .env.local into process.env (without clobbering already-set vars) so the
 *  Supabase keys are available when run via `tsx` outside Next.js. Best-effort —
 *  if the file is absent the vars may already be in the environment. */
function loadEnvLocal(): void {
  let text: string;
  try {
    text = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    if (key in process.env) continue;
    process.env[key] = m[2].replace(/^["']|["']$/g, "");
  }
}

interface GameRow {
  id: string;
  state: GameState;
  updated_at: string;
}

function client(): ReturnType<typeof createClient> {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY " +
        "(set them in .env.local or the environment).",
    );
  }
  return createClient(url, key);
}

function seatLabel(p: Player): string {
  return p.botStrategy === null ? `${p.name} (human)` : `${p.name} [bot: ${p.botStrategy}]`;
}

async function listGames(): Promise<void> {
  const { data, error } = await client()
    .from(TABLE)
    .select("id, state, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as GameRow[];
  console.log(`\n${rows.length} game(s):\n`);
  for (const r of rows) {
    const s = r.state;
    const roster = s.players.map(seatLabel).join(", ");
    console.log(`  ${r.id}  [${s.status}]  ${r.updated_at}`);
    console.log(`      ${roster}`);
  }
  console.log("\nReview one with:  npm run game:review -- <id>\n");
}

function devLevel(level: number | undefined): string {
  if (level === undefined || level === 0) return "";
  return level === 5 ? " 🏨hotel" : ` 🏠×${level}`;
}

/** One owner's deeds, grouped by board order, with development + mortgage flags. */
function holdings(state: GameState, ownerId: string): string[] {
  return Object.entries(state.ownership)
    .filter(([, owner]) => owner === ownerId)
    .map(([pos]) => Number(pos))
    .sort((a, b) => a - b)
    .map((pos) => {
      const mort = state.mortgaged[pos] ? " (mortgaged)" : "";
      return `${spaceName(pos)}${devLevel(state.houses[pos])}${mort}`;
    });
}

interface Flow {
  rentPaid: number;
  rentReceived: number;
  taxPaid: number;
  bought: number;
  built: number;
}

/** Tally each seat's money flow across the whole event stream — cheap, high-signal
 *  context for "where did the game turn?". */
function moneyFlow(state: GameState): Map<string, Flow> {
  const flow = new Map<string, Flow>(
    state.players.map((p) => [p.id, { rentPaid: 0, rentReceived: 0, taxPaid: 0, bought: 0, built: 0 }]),
  );
  for (const group of state.turns) {
    const actor = flow.get(group.playerId);
    for (const e of group.events) {
      if (e.kind === "rent") {
        if (actor) actor.rentPaid += e.amount;
        const owner = flow.get(e.ownerId);
        if (owner) owner.rentReceived += e.amount;
      } else if (e.kind === "tax" && actor) {
        actor.taxPaid += e.amount;
      } else if (e.kind === "buy" && actor) {
        actor.bought += 1;
      } else if (e.kind === "build") {
        const builder = flow.get(e.playerId);
        if (builder) builder.built += 1;
      }
    }
  }
  return flow;
}

async function reviewGame(id: string, quiet: boolean): Promise<void> {
  const { data, error } = await client()
    .from(TABLE)
    .select("state, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { state: GameState; updated_at: string } | null;
  if (!row) {
    console.error(`No game with id "${id}". Run with --list to see them.`);
    process.exitCode = 1;
    return;
  }
  const state = row.state;
  const nameById = new Map(state.players.map((p) => [p.id, p.name]));
  const nameOf: NameOf = (pid) => (pid === null ? "the bank" : nameById.get(pid) ?? pid);

  console.log(`\n=== Game ${id} — ${state.status} (last touched ${row.updated_at}) ===`);
  console.log(`Seed: "${state.rngSeed}"   Turns: ${state.turns.length}\n`);
  console.log("Seats:");
  for (const p of state.players) console.log(`  • ${seatLabel(p)}`);

  console.log("\n--- Play-by-play ---");
  for (const group of state.turns) {
    for (const e of group.events) {
      if (quiet && !DECISION_KINDS.has(e.kind)) continue;
      console.log(renderHighlight({ turn: group.turn, actorId: group.playerId, event: e }, nameOf));
    }
  }

  console.log("\n--- Final standings (objective net worth) ---");
  const ranked = [...state.players].sort((a, b) => {
    if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
    return netWorth(state, b.id) - netWorth(state, a.id);
  });
  ranked.forEach((p, i) => {
    const status = p.bankrupt ? "BANKRUPT" : `net worth $${netWorth(state, p.id)}, cash $${p.cash}`;
    console.log(`  ${i + 1}. ${seatLabel(p)} — ${status}`);
  });

  console.log("\n--- Holdings ---");
  for (const p of ranked) {
    const held = holdings(state, p.id);
    console.log(`  ${p.name}: ${held.length === 0 ? "(none)" : held.join(", ")}`);
  }

  console.log("\n--- Money flow ---");
  const flow = moneyFlow(state);
  for (const p of ranked) {
    const f = flow.get(p.id);
    if (!f) continue;
    console.log(
      `  ${p.name}: rent received $${f.rentReceived}, rent paid $${f.rentPaid}, ` +
        `tax $${f.taxPaid}, bought ${f.bought}, builds ${f.built}`,
    );
  }
  console.log("");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const quiet = argv.includes("--quiet");
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (positional.length === 0 || argv.includes("--list")) {
    await listGames();
    return;
  }
  await reviewGame(positional[0], quiet);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
