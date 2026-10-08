import { describe, expect, it } from "vitest";
import type { AiDecisionRecord } from "../../../types";
import { claimAi } from "../decide";
import type { CallMetrics, ModelAdapter, ModelResult } from "../model/adapter";
import { aiStrategyId } from "../strategy";
import { AI_VERSION_LABELS } from "../versions";
import { AI, RIVAL } from "./board";
import { runScenario } from "./run";
import { movementClaim } from "./scenario";
import { SCENARIOS } from "./scenarios";
import { quantile, scoreboard } from "./scoreboard";

const METRICS: CallMetrics = { ms: 1000, thinkMs: null, answerMs: 1000, promptTokens: 10, completionTokens: 5, thinkHitBudget: null };
const NOTES = { privateNote: "thinking", publicNote: "Hello.", plan: "Win." };

function fakeModel(answer: unknown): ModelAdapter {
  const result: ModelResult = { ok: true, answer, raw: JSON.stringify(answer), thoughts: "", metrics: METRICS };
  return { complete: () => Promise.resolve(result), identify: () => Promise.resolve("fake.gguf") };
}

const byId = (id: string) => {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`no scenario ${id}`);
  return scenario;
};

describe("scenario positions", () => {
  it("has unique ids", () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  for (const version of AI_VERSION_LABELS) {
    for (const scenario of SCENARIOS) {
      it(`${version}: ${scenario.id} owes exactly "${scenario.decision}"`, () => {
        const state = scenario.build(aiStrategyId({ profile: "ai:local", version }));
        expect(claimAi(state, AI)?.decision).toBe(scenario.decision);
      });
    }
  }
});

describe("scenario kinds", () => {
  it("gives every error scenario an error check, and no judgment scenario one", () => {
    for (const s of SCENARIOS) expect(s.error !== undefined).toBe(s.kind === "error");
  });

  it("disguises every error family with at least one variant", () => {
    const families = new Map<string, number>();
    for (const s of SCENARIOS.filter((x) => x.kind === "error")) {
      const family = s.id.split("-").slice(0, 3).join("-");
      families.set(family, (families.get(family) ?? 0) + 1);
    }
    for (const [family, count] of families) expect(count, family).toBeGreaterThan(1);
  });
});

describe("scenario checks, on canned answers", () => {
  const llmV2 = { profile: "ai:local" as const, version: "llm-v2" as const };

  it("errors when the set-completing lot goes to auction, and records the choice", async () => {
    const yes = await runScenario(byId("buy-completes-set"), llmV2, fakeModel({ ...NOTES, choice: "buy", mortgage: [] }), 0, null);
    const no = await runScenario(byId("buy-completes-set-pink"), llmV2, fakeModel({ ...NOTES, choice: "auction", mortgage: [] }), 0, null);
    expect(yes.check).toEqual({ kind: "error", choice: "buy", error: null });
    expect(no.check).toEqual({ kind: "error", choice: "auction", error: "sent the lot that completes its own set to auction" });
  });

  it("records a judgment choice without grading it", async () => {
    const wild = await runScenario(byId("auction-boardwalk"), llmV2, fakeModel({ ...NOTES, maxBid: 1400 }), 0, null);
    expect(wild.check).toEqual({ kind: "judgment", choice: "max $1400", error: null });
  });

  it("errors on a sale below the mortgage value, not on a decline", async () => {
    const accept = await runScenario(byId("vote-below-mortgage-railroad"), llmV2, fakeModel({ ...NOTES, vote: "accept" }), 0, null);
    const decline = await runScenario(byId("vote-below-mortgage-railroad"), llmV2, fakeModel({ ...NOTES, vote: "decline" }), 0, null);
    expect(accept.check?.error).toBe("sold Reading Railroad for under its $100 mortgage value");
    expect(decline.check).toEqual({ kind: "error", choice: "decline", error: null });
  });

  it("counts an unusable answer as an error even in a judgment scenario", async () => {
    const record = await runScenario(byId("buy-first-of-set"), llmV2, fakeModel({ ...NOTES, choice: "maybe" }), 2, null);
    expect(record.check?.kind).toBe("judgment");
    expect(record.check?.choice).toBe("unusable");
    expect(record.check?.error).toMatch(/^unusable answer:/);
    expect(record.source).toEqual({ kind: "scenario", scenario: "buy-first-of-set", rep: 2 });
    expect(record.request?.user).toContain("St. James");
    expect(record.result).toMatchObject({ ok: true, raw: expect.stringContaining("maybe") as unknown as string });
  });

  it("leaves the houses standing when mortgages cover the debt", async () => {
    const record = await runScenario(byId("debt-keeps-houses"), llmV2, fakeModel({ ...NOTES, mortgage: [5, 28], sellBuildings: [] }), 0, null);
    expect(record.settle?.kind).toBe("commit");
    expect(record.check?.error).toBeNull();
    expect(record.check?.choice).toBe("mortgages Reading Railroad + Water Works, raises $175");
  });

  it("errors on selling houses while a spare lot stays unmortgaged, not once both are mortgaged", async () => {
    const llmV4 = { profile: "ai:local" as const, version: "llm-v4" as const };
    const scenario = byId("debt-must-sell-houses");
    const both = await runScenario(scenario, llmV4, fakeModel({ ...NOTES, mortgage: [5, 28], sellHouses: { orange: 2 } }), 0, null);
    const one = await runScenario(scenario, llmV4, fakeModel({ ...NOTES, mortgage: [5], sellHouses: { orange: 4 } }), 0, null);
    expect(both.check?.error).toBeNull();
    expect(one.check?.error).toBe("sold houses while Water Works stayed unmortgaged");
  });
});

describe("a trade's terms against its message, in every scenario", () => {
  const llmV6 = { profile: "ai:local" as const, version: "llm-v6" as const };
  // The fake answers both calls alike, so one object carries the vote and the
  // counter's terms. The AI holds New York; Sam offers $400 and holds the
  // other two oranges.
  const counter = (publicNote: string, give: string, take: string, cashYouReceive: number) =>
    fakeModel({
      ...NOTES,
      publicNote,
      vote: "counter",
      termsInWords: "",
      yourLots: { "#19 New York Avenue": give },
      theirLots: { "#16 St. James Place": take, "#18 Tennessee Avenue": take },
      cashYouPay: 0,
      cashYouReceive,
      yourCashAfter: 700 + cashYouReceive,
    });
  const run = (model: ModelAdapter) => runScenario(byId("vote-arms-rival-monopoly"), llmV6, model, 0, null);
  const ask = "I'd like $600 for New York Avenue.";

  it("passes terms that match the message", async () => {
    expect((await run(counter(ask, "hand over", "leave", 600))).check?.error).toBeNull();
  });

  it("errors, even in a judgment scenario, when the cash the message names never reaches the terms", async () => {
    const record = await run(counter(ask, "hand over", "take", 0));
    expect(record.check?.kind).toBe("judgment");
    expect(record.check?.error).toBe(`the message names $600 but the terms move no cash ("${ask}")`);
  });

  it("errors on a lot the terms move that the message never mentions", async () => {
    expect((await run(counter(ask, "hand over", "take", 600))).check?.error).toMatch(/^the terms move St\. James Place \+ Tennessee Avenue, which the message never mentions/);
  });

  it("errors on terms that ask cash and hand nothing over", async () => {
    expect((await run(counter(ask, "keep", "leave", 600))).check?.error).toMatch(/^the terms ask \$600 and hand nothing over/);
  });

  it("gates it in the counter-message family", async () => {
    const record = await runScenario(
      byId("vote-counter-message-red"),
      llmV6,
      fakeModel({
        ...NOTES,
        publicNote: "Illinois is worth more to you; $500 and it's yours.",
        vote: "counter",
        termsInWords: "",
        yourLots: { "#24 Illinois Avenue": "hand over" },
        theirLots: { "#21 Kentucky Avenue": "take", "#23 Indiana Avenue": "leave" },
        cashYouPay: 0,
        cashYouReceive: 500,
        yourCashAfter: 1200,
      }),
      0,
      null,
    );
    expect(record.check?.kind).toBe("error");
    expect(record.check?.error).toMatch(/^the terms move Kentucky Avenue, which the message never mentions/);
  });
});

describe("a note or plan that claims control over movement", () => {
  // Verbatim from games 46181f and 5x1c6j.
  const claims = [
    "Use the cash to buy unowned lots and trade with Kyle for the greens or light blues; avoid landing on Väinö's reds.",
    "Avoid reds, lift green mortgages when cash allows, then rebuild.",
    "Keep building green; avoid Väinö's railroads and reds; lift Electric mortgage later.",
    "Lift North Carolina and Pennsylvania as cash allows, then build houses on green; avoid the reds.",
    "Stay liquid, keep building light blue when cash allows, avoid Frank's orange.",
  ];
  const choices = [
    "Pursue Indiana Avenue for the red set and build houses; avoid trades that complete another player's set.",
    "If he declines, keep reds and look for other trades or build elsewhere; avoid handing him a monopoly cheaply.",
    "Keep building houses on the reds with incoming rent and avoid mortgaging.",
    "Collect red rent, lift mortgages, keep building reds, avoid giving Kyle orange.",
    "Only $275, so one house ($200) is affordable and boosts green rent. Risk on reds is small this roll, and selling the house plus mortgaging Electric covers the worst case.",
    "Red squares are far from my position, so building one house ($200) and keeping $180 is safe enough.",
    "Keep $400 in reserve while red has houses.",
    "Staying in jail is safe from Dev's railroads.",
  ];

  for (const text of claims) it(`flags "${text}"`, () => expect(movementClaim(text)).not.toBeNull());
  for (const text of choices) it(`passes "${text}"`, () => expect(movementClaim(text)).toBeNull());

  const llmV6 = { profile: "ai:local" as const, version: "llm-v6" as const };
  const debt = { mortgage: [], stillOwed: 330, sellHouses: { green: 2 }, privateNote: "thinking", publicNote: "Selling up." };

  it("errors on a plan that repeats the claim, in its error family", async () => {
    // Selling both houses and mortgaging all three greens is the one plan that covers $530.
    const answer = { ...debt, mortgage: [31, 32, 34], plan: "Avoid reds, lift green mortgages when cash allows, then rebuild." };
    const record = await runScenario(byId("debt-after-built-rival-set"), llmV6, fakeModel(answer), 0, null);
    expect(record.settle?.kind).toBe("commit");
    expect(record.check?.error).toBe(`its plan claims control over where it lands ("Avoid reds, lift green mortgages when cash allows, then rebuild.")`);
  });

  it("checks every scenario, judgment ones included", async () => {
    const record = await runScenario(byId("buy-first-of-set"), llmV6, fakeModel({ ...NOTES, choice: "buy", mortgage: [], plan: "Dodge the railroads." }), 0, null);
    expect(record.check?.kind).toBe("judgment");
    expect(record.check?.error).toMatch(/^its plan claims control over where it lands/);
  });
});

describe("a pitch that credits the other side with what it doesn't have", () => {
  const llmV6 = { profile: "ai:local" as const, version: "llm-v6" as const };
  // The seat buys Tennessee (#18) from Sam for $620.
  const propose = (publicNote: string, cash = 1399) =>
    fakeModel({
      ...NOTES,
      publicNote,
      buildHouses: {},
      sellHouses: {},
      mortgage: [],
      unmortgage: [],
      proposeTrade: true,
      trade: {
        dealInWords: "",
        counterparty: RIVAL,
        youGive: { properties: [], jailCards: [] },
        youGet: { properties: [18], jailCards: [] },
        cashYouPay: 620,
        cashYouReceive: 0,
        yourCashAfter: cash - 620,
      },
    });
  const pitch = "Sam, $620 for Tennessee is more than three times its price, and it funds your builds elsewhere.";

  it("errors when the other side holds no full set", async () => {
    const record = await runScenario(byId("turn-start-propose-pitch-orange"), llmV6, propose(pitch), 0, null);
    expect(record.check?.error).toBe(`its pitch credits the other side with building it can't do ("${pitch}")`);
  });

  it("passes a negated claim, and a pitch that doesn't mention building", async () => {
    for (const note of [
      "Sam, $620 for Tennessee, a lot you can't build on alone.",
      "Sam, $620 for Tennessee is over three times its price.",
      "Sam, $620 for Tennessee, so you can fund your next purchases.",
    ]) {
      expect((await runScenario(byId("turn-start-propose-pitch-orange"), llmV6, propose(note), 0, null)).check?.error).toBeNull();
    }
  });

  it("passes the same pitch when the other side does hold a full set", async () => {
    const record = await runScenario(byId("turn-start-propose-pitch-full-set"), llmV6, propose(pitch, 1200), 0, null);
    expect(record.check?.error).toBeNull();
  });
});

describe("scoreboard", () => {
  it("takes nearest-rank quantiles", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([3, 1, 2, 4], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });

  it("counts errors only, and tallies choices", () => {
    const scenario = byId("buy-completes-set");
    const record = (error: string | null) => ({
      source: { kind: "scenario" as const, scenario: scenario.id, rep: 0 },
      at: "",
      seat: AI,
      decision: "buy" as AiDecisionRecord["decision"],
      version: "llm-v2",
      server: null,
      request: null,
      result: null,
      metrics: METRICS,
      settle: null,
      check: { kind: "error" as const, choice: error ? "auction" : "buy", error },
    });
    const board = scoreboard("llm-v2", "now", 2, null, [scenario], [record(null), record("sent it to auction")]);
    expect(board.scenarios[0]).toMatchObject({ errors: 1, runs: 2, choices: { buy: 1, auction: 1 }, errorReasons: ["sent it to auction"] });
    expect(board.errorScenarios).toEqual({ errors: 1, runs: 2 });
    expect(board.byPhase.early).toEqual({ errors: 1, runs: 2 });
  });
});
