import { readFileSync } from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { spaceName } from "../logic";
import { SPACES } from "../data";
import type { GameState, TradeMoves } from "../types";

/** `npm run game:offers` — the L5 offer-outcome sweep (see bots/LEAPS.md L5):
 *  pull EVERY stored game and tally every trade proposal by who proposed it,
 *  who answered, and what happened — the empirical base for a future
 *  human-counterparty model. The 4q3y6i review found bots converted ~7% of
 *  offers to humans while humans converted ~40% against bots; this tool turns
 *  that single-game anecdote into a corpus statistic. Reads only (anon key).
 *
 *  Usage:
 *    npm run game:offers             # aggregate corpus stats
 *    npm run game:offers -- --dump   # + one line per offer (for fitting)
 */

const TABLE = "monopoly_games";

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

type SeatKind = "human" | "bot";

interface OfferRecord {
  gameId: string;
  turn: number;
  accepted: boolean;
  proposer: SeatKind;
  proposerName: string;
  /** The answering side: for a decline, the seat that killed it; for an
   *  execute, every non-proposer party (summarized by kind). */
  responders: SeatKind[];
  responderNames: string[];
  /** Net cash the proposer PAYS (negative = proposer receives cash). */
  proposerCashOut: number;
  /** Printed-price book value moving TO the proposer minus moving FROM the
   *  proposer — the asset side of what the proposer gains. */
  proposerBookDelta: number;
  properties: string[];
}

function bookValue(pos: number): number {
  const s = SPACES[pos];
  return "price" in s ? s.price : 0;
}

/** Direction label for the tally: who is asking whom. A mixed responder set
 *  (bot AND human parties in one N-way deal) is counted under "mixed". */
function direction(o: OfferRecord): string {
  const kinds = new Set(o.responders);
  const to = kinds.size === 2 ? "mixed" : (kinds.has("human") ? "human" : "bot");
  return `${o.proposer}→${to}`;
}

function collectOffers(gameId: string, state: GameState): OfferRecord[] {
  const kindById = new Map<string, SeatKind>(
    state.players.map((p) => [p.id, p.botStrategy === null ? "human" : "bot"]),
  );
  const nameById = new Map(state.players.map((p) => [p.id, p.name]));
  const offers: OfferRecord[] = [];
  for (const group of state.turns) {
    for (const e of group.events) {
      if (e.kind !== "trade" && e.kind !== "trade-declined") continue;
      const moves: TradeMoves = e;
      const parties = new Set<string>();
      for (const owner of Object.values(moves.propertyFrom)) parties.add(owner);
      for (const to of Object.values(moves.propertyTo)) parties.add(to);
      for (const [pid, delta] of Object.entries(moves.cashDelta)) {
        if (delta !== 0) parties.add(pid);
      }
      const responderIds =
        e.kind === "trade-declined"
          ? [e.declinedBy]
          : [...parties].filter((pid) => pid !== moves.proposerId);
      let proposerBookDelta = 0;
      const properties: string[] = [];
      for (const [posStr, to] of Object.entries(moves.propertyTo)) {
        const pos = Number(posStr);
        properties.push(spaceName(pos));
        if (to === moves.proposerId) proposerBookDelta += bookValue(pos);
        if (moves.propertyFrom[pos] === moves.proposerId) proposerBookDelta -= bookValue(pos);
      }
      offers.push({
        gameId,
        turn: group.turn,
        accepted: e.kind === "trade",
        proposer: kindById.get(moves.proposerId) ?? "bot",
        proposerName: nameById.get(moves.proposerId) ?? moves.proposerId,
        responders: responderIds.map((pid) => kindById.get(pid) ?? "bot"),
        responderNames: responderIds.map((pid) => nameById.get(pid) ?? pid),
        proposerCashOut: -(moves.cashDelta[moves.proposerId] ?? 0),
        proposerBookDelta,
        properties,
      });
    }
  }
  return offers;
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const dump = process.argv.includes("--dump");
  const { data, error } = await client()
    .from(TABLE)
    .select("id, state")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as { id: string; state: GameState }[];

  const all: OfferRecord[] = [];
  let mixedGames = 0;
  for (const r of rows) {
    const kinds = new Set(r.state.players.map((p) => (p.botStrategy === null ? "human" : "bot")));
    if (kinds.size === 2) mixedGames++;
    all.push(...collectOffers(r.id, r.state));
  }

  console.log(
    `\n${rows.length.toString()} stored game(s), ${mixedGames.toString()} with humans AND bots; ` +
      `${all.length.toString()} trade proposal(s) total\n`,
  );

  const byDirection = new Map<string, OfferRecord[]>();
  for (const o of all) {
    const dir = direction(o);
    const list = byDirection.get(dir) ?? [];
    list.push(o);
    byDirection.set(dir, list);
  }

  console.log("--- Conversion by direction (proposer→responder) ---");
  for (const [dir, offers] of [...byDirection.entries()].sort()) {
    const accepted = offers.filter((o) => o.accepted).length;
    console.log(
      `  ${dir.padEnd(12)} ${accepted.toString().padStart(3)}/${offers.length.toString().padEnd(4)} accepted (${pct(accepted, offers.length)})`,
    );
  }

  // The exploit metric from the 4q3y6i review: when a HUMAN proposes and a BOT
  // accepts, what does the proposer net in book value for their cash?
  const humanWins = all.filter(
    (o) => o.accepted && o.proposer === "human" && o.responders.includes("bot"),
  );
  if (humanWins.length > 0) {
    console.log("\n--- Accepted human→bot deals: what the human proposer netted ---");
    for (const o of humanWins) {
      console.log(
        `  [${o.gameId} T${o.turn.toString()}] ${o.proposerName}: book ${o.proposerBookDelta >= 0 ? "+" : ""}$${o.proposerBookDelta.toString()} for cash $${o.proposerCashOut.toString()} — ${o.properties.join(", ") || "(cash only)"}`,
      );
    }
  }

  // Per-human read: how each named human answers bot offers (the reservation-
  // price signal a human-counterparty model would be fit on).
  const toHumans = all.filter((o) => o.proposer === "bot" && o.responders.includes("human"));
  const byHuman = new Map<string, { seen: number; accepted: number }>();
  for (const o of toHumans) {
    o.responders.forEach((kind, i) => {
      if (kind !== "human") return;
      const name = o.responderNames[i];
      const t = byHuman.get(name) ?? { seen: 0, accepted: 0 };
      t.seen++;
      if (o.accepted) t.accepted++;
      byHuman.set(name, t);
    });
  }
  if (byHuman.size > 0) {
    console.log("\n--- Bot offers answered by each human ---");
    for (const [name, t] of [...byHuman.entries()].sort((a, b) => b[1].seen - a[1].seen)) {
      console.log(`  ${name.padEnd(10)} ${t.accepted.toString()}/${t.seen.toString()} accepted (${pct(t.accepted, t.seen)})`);
    }
  }

  if (dump) {
    console.log("\n--- Every offer (dump) ---");
    for (const o of all) {
      console.log(
        `${o.gameId}\tT${o.turn.toString()}\t${direction(o)}\t${o.accepted ? "ACCEPT" : "decline"}\t` +
          `${o.proposerName}→${o.responderNames.join("+")}\tbook ${o.proposerBookDelta.toString()}\tcash ${o.proposerCashOut.toString()}\t${o.properties.join(",")}`,
      );
    }
  }
  console.log("");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
