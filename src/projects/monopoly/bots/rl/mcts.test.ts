import { describe, expect, it } from "vitest";
import { freshGame } from "../../mocks";
import { simulateGame } from "../eval/simulate";
import { legalActions } from "./actions";
import { MonoNet } from "./net";
import { mctsBot, mctsSearch } from "./mcts";
import { tfjsUsable } from "./tfjs-usable";

describe.skipIf(!tfjsUsable)("MCTS over the policy+value net", () => {
  it("is a pure function of (state, net): same inputs → same chosen action", () => {
    const net = MonoNet.create();
    const state = freshGame("mcts-det", undefined, 4);
    const me = state.turn.playerId;
    const a = mctsSearch(state, me, net, { simulations: 24 });
    const b = mctsSearch(state, me, net, { simulations: 24 });
    expect(a).not.toBeNull();
    expect(a!.action.token).toBe(b!.action.token);
  });

  it("only ever returns a legal root action", () => {
    const net = MonoNet.create();
    const state = freshGame("mcts-legal", undefined, 4);
    const me = state.turn.playerId;
    const legal = new Set(legalActions(state, me).map((x) => x.token));
    const result = mctsSearch(state, me, net, { simulations: 16 });
    expect(result).not.toBeNull();
    expect(legal.has(result!.action.token)).toBe(true);
  });

  it("plays a full, only-legal game as a bot (random net)", () => {
    const net = MonoNet.create();
    const bot = mctsBot(net, { simulations: 6 });
    // The headless sim throws on any illegal move; a clean return proves MCTS
    // emits only legal atomic actions across a real game. A random net plays
    // weakly (likely a draw at the cap), which is fine — we test legality here.
    const result = simulateGame({
      seed: "mcts-game",
      seats: [
        { label: "mcts", bot },
        { label: "mcts", bot },
      ],
      maxTurns: 120,
    });
    expect(result.standings.length).toBe(2);
    expect(result.turns).toBeGreaterThan(5);
  }, 180_000);
});
