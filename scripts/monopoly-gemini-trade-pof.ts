// Monopoly LLM-bot POF #2: tricky trade vote via Gemini API key.
// Reads GEMINI_API_KEY from .env.local (never logs it), builds a
// trade-pending state from repo code, and POSTs to Generative Language API.
// Run: npx tsx scripts/monopoly-gemini-trade-pof.ts
import { readFileSync } from "node:fs";
import { freshGame } from "../src/projects/monopoly/mocks";
import { SPACES, HOUSE_COST } from "../src/projects/monopoly/data";
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

const MODEL_FALLBACKS = [
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
];

// Build the trade-vote state from repo code: mid-game, bot p2 (Alex, $800)
// holds brown monopoly + 2/3 orange; p3 (Sam, $1200) offers the orange
// completer (New York Ave, pos 19) for $400 cash.
const base = freshGame("pof-trade-1", undefined, 4);
const [p1, p2, p3, p4] = base.players;
const state = {
  ...base,
  players: base.players.map((p) =>
    p.id === p2.id ? { ...p, cash: 800 } :
    p.id === p3.id ? { ...p, cash: 1200 } :
    p.id === p4.id ? { ...p, cash: 1000 } : p,
  ),
  ownership: { 1: p2.id, 3: p2.id, 16: p2.id, 18: p2.id, 19: p3.id, 21: p4.id },
  turn: {
    ...base.turn,
    playerId: p1.id,
    phase: "trade-pending" as const,
    pendingTrade: {
      id: "t1",
      proposerId: p3.id,
      propertyTo: { 19: p2.id },
      gojfTo: {},
      cashDelta: { [p2.id]: -400, [p3.id]: 400 },
      approvals: { [p2.id]: false, [p3.id]: true },
    },
  },
};

const ny = SPACES[19];
if (ny.kind !== "property") throw new Error("SPACES[19] is not a property");

const accept = { kind: "accept-trade", playerId: p2.id, tradeId: "t1" } as const;
const decline = { kind: "decline-trade", playerId: p2.id, tradeId: "t1" } as const;
console.log(
  `pre-check isLegal accept=${isLegal(state, accept)} decline=${isLegal(state, decline)}`,
);

const userPrompt =
  `You are seat ${p2.id} (Alex) in a 4-player Monopoly game. It is mid-game and you must vote on a trade offer. ` +
  `Your cash: $800. Your properties: Mediterranean Ave (pos 1, brown), Baltic Ave (pos 3, brown) = completed brown monopoly, ` +
  `St. James Place (pos 16, orange), Tennessee Ave (pos 18, orange) = one short of the orange monopoly. No houses/mortgages anywhere. ` +
  `Offer from Sam (${p3.id}, cash $1200): you RECEIVE New York Avenue (pos 19, orange, price $200, rent base $16, houses 80/220/600/800, hotel $1000), ` +
  `completing your orange monopoly; you PAY $400 cash to Sam. After the trade you would hold $400 cash. ` +
  `Context: building one house tier on orange costs $${HOUSE_COST.orange} per property (3 needed for even build); ` +
  `rival Sam gets $400 cash but no new monopoly; other seats: Kyle $${1500}, Jordan $${1000} (owns Kentucky Ave). ` +
  `Legal actions (pick exactly one): 1. ${JSON.stringify(accept)} 2. ${JSON.stringify(decline)}. ` +
  `Weigh: monopoly completion value and buildability with $400 left vs staying liquid and denying Sam nothing (he gains no set). ` +
  `Reply with STRICT JSON only: {"intent": <one of the above>, "note": "<one tight sentence>"}`;

let modelId = MODEL_FALLBACKS[0];
let data: {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
} | null = null;
for (const candidate of MODEL_FALLBACKS) {
  const attempt = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: 'You are a cutthroat Monopoly bot. Reply with STRICT JSON only: {"intent": object, "note": string}. The intent must be exactly one of the legal actions given.',
            },
          ],
        },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    },
  );
  if (attempt.ok) {
    modelId = candidate;
    data = (await attempt.json()) as NonNullable<typeof data>;
    break;
  }
  const errBody = (await attempt.text()).slice(0, 200);
  console.log(`model ${candidate} HTTP ${attempt.status}: ${errBody.split("\n")[0]}`);
  if (attempt.status !== 503 && attempt.status !== 429) {
    process.exit(1);
  }
}
if (!data) {
  console.error("all models unavailable, try again later");
  process.exit(1);
}
const content =
  data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
console.log(`--- model: ${modelId} ---`);
console.log(content);

try {
  const parsed = JSON.parse(content) as { intent?: unknown; note?: unknown };
  console.log(`note: ${typeof parsed.note === "string" ? parsed.note : "(none)"}`);
  const intent = parsed.intent as Parameters<typeof isLegal>[1];
  console.log(`isLegal: ${isLegal(state, intent)}`);
} catch {
  console.log("isLegal: unparseable (not strict JSON)");
}
