import { describe, expect, it } from "vitest";
import { isLegal } from "../../engine";
import { freshGame } from "../../mocks";
import type { GameState } from "../../types";
import type { Bot } from "../decision";
import { VERSIONS } from "./index";

// The ARCHIVE-WIDE conformance suite: the contracts EVERY registered bot owes,
// asserted over every label in `VERSIONS` from one place.
//
// Why this exists rather than a copy per snapshot: these are not claims about a
// version's strategy — they are the Bot contract itself (`bots/decision.ts`), so
// per-version copies made coverage ACCIDENTAL. Whoever wrote a version wrote the
// checks they happened to think of, which is how legality ended up asserted on
// exactly one bot and determinism on five, while the bots players actually field
// had neither. A table over `VERSIONS` inverts that: a new snapshot is covered the
// moment it is registered, and a bot that cannot hold these has to say so HERE, out
// loud, rather than by quietly omitting a file.
//
// What belongs here: contracts true of ALL bots (determinism, legality). What does
// NOT: a version's own hypothesis — that stays in its `versions/<label>/*.test.ts`,
// where it grades one claim against one measurement.
//
// The two contracts:
//   - DETERMINISM. A bot is a pure function of (state, playerId) — the engine's
//     replay guarantee depends on it, and any randomness must be drawn from the
//     injected RNG, never `Math.random` (see bots/CLAUDE.md "Randomness & the RNG
//     seam"). Repeated calls on one state must agree.
//   - LEGALITY. A bot may only emit intents the engine validates — this is what
//     makes it "structurally incapable of cheating" (EVOLUTION.md "The core idea").
//     Every non-null decision must be legal on the state it was handed.

const base = freshGame("conformance");

function withTurn(turn: Partial<GameState["turn"]>, patch: Partial<GameState> = {}): GameState {
  return { ...base, ...patch, turn: { ...base.turn, ...turn } };
}

function setPlayer(
  state: GameState,
  id: string,
  patch: Partial<GameState["players"][number]>,
): GameState {
  return { ...state, players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** The decision phases a bot is consulted in, each as a non-trivial board — a state
 *  where the choice is real, so a bot that stubs the phase is visible. Oranges =
 *  {16,18,19}. */
const FIXTURES: readonly { readonly name: string; readonly make: () => GameState }[] = [
  {
    name: "buy-decision",
    make: () => withTurn({ phase: "buy-decision", pendingBuy: 19 }, { ownership: { 16: "p1", 18: "p1" } }),
  },
  {
    name: "trade-pending",
    make: () =>
      withTurn(
        {
          phase: "trade-pending",
          pendingTrade: {
            id: "t1",
            proposerId: "p3",
            propertyTo: { 19: "p1" },
            gojfTo: {},
            cashDelta: { p1: -100, p3: 100 },
            approvals: { p3: true, p1: false },
          },
        },
        { ownership: { 16: "p1", 18: "p1", 19: "p3" } },
      ),
  },
  {
    name: "auction",
    make: () =>
      withTurn(
        {
          phase: "auction",
          auction: {
            position: 19,
            active: ["p1", "p2"],
            highBid: 100,
            leaderId: "p2",
            bids: { p2: 100 },
            resume: { kind: "landing" },
          },
        },
        { ownership: { 16: "p1", 18: "p1" } },
      ),
  },
  {
    name: "jail-decision",
    make: () =>
      setPlayer(
        withTurn(
          { phase: "jail-decision" },
          { ownership: { 16: "p2", 18: "p2", 19: "p2" }, houses: { 16: 3, 18: 3, 19: 3 } },
        ),
        "p1",
        { inJail: true, jailTurns: 1 },
      ),
  },
  {
    name: "pre-roll",
    make: () =>
      withTurn({ phase: "pre-roll" }, { ownership: { 16: "p1", 18: "p1", 19: "p3", 11: "p3" } }),
  },
  {
    name: "must-raise-cash",
    make: () =>
      setPlayer(
        withTurn(
          { phase: "must-raise-cash", raiseCash: "pre-roll" },
          { ownership: { 16: "p1", 18: "p1", 19: "p1", 11: "p1" } },
        ),
        "p1",
        { cash: -400 },
      ),
  },
];

const LABELS = Object.keys(VERSIONS).sort();

describe.each(LABELS)("%s — Bot contract", (label) => {
  const bot: Bot = VERSIONS[label];

  describe.each(FIXTURES.map((f) => [f.name, f.make] as const))("at %s", (_name, make) => {
    it("is deterministic across repeated calls", () => {
      const state = make();
      const a = bot(state, "p1");
      const b = bot(state, "p1");
      expect(b).toEqual(a);
    });

    it("emits only intents the engine accepts", () => {
      const state = make();
      const decision = bot(state, "p1");
      // `null` is a legal answer everywhere — it means "nothing to do", and the pacer
      // drives the mechanical beat instead.
      if (!decision) return;
      expect(isLegal(state, decision.intent), `illegal ${decision.intent.kind}`).toBe(true);
    });
  });
});

describe("the archive itself", () => {
  it("registers every label as a callable bot", () => {
    const broken = LABELS.filter((l) => typeof VERSIONS[l] !== "function");
    expect(broken, `labels that don't resolve to a bot: ${broken.join(", ")}`).toEqual([]);
  });
});

// The legality contract above is only worth anything if the fixtures actually elicit
// intents — every bot answering `null` would make it pass while asserting nothing.
// So pin that each fixture is LIVE. `pre-roll` is deliberately excluded: arming a
// trade/build there is optional, so a bot declining to arm is correct behavior, not
// a dead fixture.
describe("the fixtures are live (guards the legality contract from going vacuous)", () => {
  const OPTIONAL = new Set(["pre-roll"]);

  it.each(FIXTURES.filter((f) => !OPTIONAL.has(f.name)).map((f) => [f.name, f.make] as const))(
    "%s elicits a real decision from most of the archive",
    (_name, make) => {
      const deciding = LABELS.filter((l) => VERSIONS[l](make(), "p1") !== null);
      // kyle-v1 is a deliberate null stub (it defers to the engine's legal default),
      // so a healthy fixture is "nearly all", not "all".
      expect(deciding.length).toBeGreaterThan(LABELS.length - 4);
    },
  );
});
