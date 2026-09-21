// Monopoly LLM-bot POF: first-buy decision via Gemini API key.
// Reads GEMINI_API_KEY from .env.local (never logs it), builds the
// buy-decision state from repo code, and POSTs to Generative Language API.
// Run: npx tsx scripts/monopoly-gemini-pof.ts
import { readFileSync } from "node:fs";
import { freshGame } from "../src/projects/monopoly/mocks";
import { SPACES } from "../src/projects/monopoly/data";
import { isLegal } from "../src/projects/monopoly/engine";

// Minimal .env.local parser (no new deps): KEY=VALUE, skips blanks/#comments.
function loadEnvLocal(): void {
  let text = "";
  try {
    text = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();
const key = process.env.GEMINI_API_KEY;
if (!key || key === "your-gemini-key") {
  console.error("Missing GEMINI_API_KEY in .env.local.");
  process.exit(1);
}

// Build the POF state from repo code: fresh 4p game, bot p2 lands on pos 1.
const base = freshGame("pof-1", undefined, 4);
const botId = base.players[1].id;
const space = SPACES[1];
if (space.kind !== "property") throw new Error("SPACES[1] is not a property");
const cashLine = base.players.map((p) => `${p.id}=${p.cash}`).join(", ");

// Pick a model: list available, prefer a flash model.
const listRes = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=50",
  { headers: { "x-goog-api-key": key } },
);
if (!listRes.ok) {
  console.error(`models.list HTTP ${listRes.status}: ${(await listRes.text()).slice(0, 300)}`);
  process.exit(1);
}
const listed = (await listRes.json()) as { models?: { name?: string }[] };
const names = (listed.models ?? []).map((m) => m.name ?? "").filter(Boolean);
const pick =
  names.find((n) => n === "models/gemini-3.6-flash") ??
  names.find((n) => n === "models/gemini-flash-latest") ??
  names.find((n) => n.includes("flash")) ??
  names[0] ??
  "models/gemini-3.6-flash";
const modelId = pick.replace(/^models\//, "");
console.log(`--- model: ${modelId} (${names.length} available) ---`);

const userPrompt =
  `You are seat ${botId} (Alex) in a 4-player Monopoly game. Decide ONLY this decision. ` +
  `State: buy-decision, you landed on ${space.name} (pos 1, ${space.color}, price $${space.price}, ` +
  `rent base $${space.rent.base}, houses ${space.rent.houses.join("/")}, hotel ${space.rent.hotel}). ` +
  `Cash: ${cashLine}. Ownership: none. No mortgages/houses. ` +
  `Legal actions (pick exactly one): 1. {"kind":"buy","playerId":"${botId}"} ` +
  `2. {"kind":"decline-buy","playerId":"${botId}"} (goes to auction). ` +
  `Rules: brown needs Mediterranean + Baltic (pos 3) for monopoly. Early game, $60 is 4% of cash. ` +
  `Reply with STRICT JSON only: {"intent": <one of the above>, "note": "<one tight sentence>"}`;

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: 'You are a Monopoly bot. Reply with STRICT JSON only: {"intent": object, "note": string}. The intent must be exactly one of the legal actions given.',
          },
        ],
      },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  },
);

if (!res.ok) {
  console.error(`generate HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}
const data = (await res.json()) as {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};
const content =
  data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
console.log(content);

// Validate the returned intent against the engine (no state write).
try {
  const parsed = JSON.parse(content) as { intent?: unknown; note?: unknown };
  console.log(`note: ${typeof parsed.note === "string" ? parsed.note : "(none)"}`);
  const checkState = {
    ...base,
    players: base.players.map((p) =>
      p.id === botId ? { ...p, position: 1 } : p,
    ),
    turn: { ...base.turn, playerId: botId, phase: "buy-decision" as const, pendingBuy: 1 },
  };
  const intent = parsed.intent as Parameters<typeof isLegal>[1];
  console.log(`isLegal: ${isLegal(checkState, intent)}`);
} catch {
  console.log("isLegal: unparseable (not strict JSON)");
}
