import { describe, expect, it } from "vitest";
import { apply, autoStep } from "../../engine";
import { hasMonopoly } from "../../logic";
import { freshGame } from "../../mocks";
import { driveOp, type BotResolver } from "../../pacing";
import type { GameState, PropertyColor } from "../../types";
import { botFor } from "../registry";
import { simulateGame, type Contender } from "../eval/simulate";
import { bestTrade } from "./trade-search";
import type { ValueFn } from "./value-net-stub";
import { valuePolicyBot, valuePolicyStubBot } from "./value-policy";

const COLORS: readonly PropertyColor[] = [
  "brown",
  "light-blue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "dark-blue",
];

const CLAUDE: Contender = { label: "claude-v2", bot: botFor("claude-v2") };

/** A value that strictly rewards owning more houses — isolates the develop
 *  WIRING from the heuristic's tuning (does the agent build when value says to?). */
const houseLovingValue: ValueFn = (state, pid) => {
  let houses = 0;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner === pid) houses += state.houses[Number(posStr)] ?? 0;
  }
  const cash = state.players.find((p) => p.id === pid)?.cash ?? 0;
  return houses * 1000 + cash;
};

function applyOrThrow(state: GameState, intent: Parameters<typeof apply>[1]): GameState {
  const r = apply(state, intent);
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

describe("value policy (full-capability agent)", () => {
  it("opens a build window and develops an owned monopoly", () => {
    const base = freshGame("vp-build", undefined, 2);
    const me = base.players[0].id;
    const state0: GameState = {
      ...base,
      ownership: { ...base.ownership, 1: me, 3: me }, // full brown set
      players: base.players.map((p) => (p.id === me ? { ...p, cash: 1500 } : p)),
    };
    expect(state0.turn.phase).toBe("pre-roll");
    expect(state0.turn.playerId).toBe(me);

    const bot = valuePolicyBot(houseLovingValue);

    // 1. At pre-roll it arms a manage window (the structural "open the window").
    const arm = bot(state0, me);
    expect(arm?.intent.kind).toBe("set-queue");

    // 2. Draining the queue opens the managing intermission for it.
    const state1 = applyOrThrow(state0, arm!.intent);
    const state2 = autoStep(state1).state;
    expect(state2.turn.phase).toBe("managing");
    expect(state2.turn.managerId).toBe(me);

    // 3. Inside managing the value loop commits a real build.
    const commit = bot(state2, me);
    expect(commit?.intent.kind).toBe("manage");
    const state3 = applyOrThrow(state2, commit!.intent);
    // House-loving value maxes the set out to hotels.
    expect(state3.houses[1]).toBe(5);
    expect(state3.houses[3]).toBe(5);
  });

  it("constructs, proposes, and executes a monopoly-completing trade", () => {
    const base = freshGame("vp-trade", undefined, 2);
    const p0 = base.players[0].id;
    const p1 = base.players[1].id;
    // A mutual completion: p0 is one short of brown (p1 holds pos 1); p1 is one
    // short of dark-blue (p0 holds pos 39). Swapping completes a set for each.
    const state0: GameState = {
      ...base,
      players: base.players.map((p) => ({ ...p, cash: 1500, botStrategy: "value-policy" })),
      ownership: { ...base.ownership, 1: p1, 3: p0, 37: p1, 39: p0 },
    };

    // A value that rewards owning monopolies — isolates the trade WIRING from the
    // heuristic's asset tuning (a swap that completes a set for both is a clear win
    // for both, so it constructs, proposes, and is accepted).
    const value: ValueFn = (s, pid) => {
      let monos = 0;
      for (const color of COLORS) if (hasMonopoly(s, color, pid)) monos++;
      const cash = s.players.find((p) => p.id === pid)?.cash ?? 0;
      return monos * 100_000 + cash;
    };

    // The search finds the mutual-completion swap.
    const found = bestTrade(state0, p0, value);
    expect(found).not.toBeNull();
    expect(found?.terms.propertyTo[1]).toBe(p0);
    expect(found?.terms.propertyTo[39]).toBe(p1);

    // Driving both seats with the policy carries it through arm → build draft →
    // propose → vote → execute.
    const bot = valuePolicyBot(value);
    const resolver: BotResolver = () => bot;
    let state = state0;
    for (let i = 0; i < 50 && state.status === "active"; i++) {
      const op = driveOp(state, true, null, resolver);
      if (op === null) break;
      state = op.kind === "step" ? autoStep(state).state : applyOrThrow(state, op.intent);
      if (state.ownership[1] === p0 && state.ownership[39] === p1) break;
    }
    expect(state.ownership[1]).toBe(p0);
    expect(state.ownership[39]).toBe(p1);
  });

  it("plays a full, legal game to completion vs claude-v2", () => {
    const result = simulateGame({
      seed: "vp-vs-claude",
      seats: [{ label: "value-policy", bot: valuePolicyStubBot }, CLAUDE],
    });
    expect(result.terminated).toBe(true);
    expect(result.standings.some((s) => s.label === "value-policy")).toBe(true);
  });
});
