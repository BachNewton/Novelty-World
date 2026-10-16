import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, RiskEngine } from "../contract";
import { referenceEngine } from "../engine";
import type { Bot } from "../bots/bot";
import { greedyBot } from "../bots/greedy";
import { randomBot } from "../bots/random";
import { playGame, runSpec } from "./runner";

/** The reference engine, remembering the state of the latest write so a test can
 *  hold a bot's input against what the engine says that seat may see. */
function spyEngine(): { engine: RiskEngine; latest: () => { state: GameState; events: readonly GameEvent[]; all: readonly GameEvent[] } } {
  let state: GameState | null = null;
  let events: readonly GameEvent[] = [];
  const all: GameEvent[] = [];
  const engine: RiskEngine = {
    ...referenceEngine,
    newGame: (config, seed) => {
      const started = referenceEngine.newGame(config, seed);
      state = started.state;
      events = started.events;
      all.push(...events);
      return started;
    },
    apply: (s, seat, move) => {
      const result = referenceEngine.apply(s, seat, move);
      if (result.ok) {
        state = result.state;
        events = result.events;
        all.push(...events);
      }
      return result;
    },
  };
  return {
    engine,
    latest: () => {
      if (state === null) throw new Error("no game started");
      return { state, events, all };
    },
  };
}

describe("playGame", () => {
  it("gives a bot only its seat's view, options and redacted history, and a seed of its own", () => {
    const spy = spyEngine();
    let checked = 0;
    const watching: Bot = (input) => {
      const { state, events, all } = spy.latest();
      expect(Object.keys(input).sort()).toEqual(["events", "history", "humans", "options", "seat", "seed", "view"]);
      expect(input.history).toEqual(referenceEngine.redact(all, input.seat));
      expect(input.humans).toEqual([false, false, false, false]);
      expect(input.view).toEqual(referenceEngine.view(state, input.seat));
      expect(input.view.viewer).toBe(input.seat);
      expect(input.options).toEqual(referenceEngine.options(state, input.seat));
      expect(input.events).toEqual(referenceEngine.redact(events, input.seat));
      for (const e of input.events) {
        if (e.kind === "card-drawn" && e.seat !== input.seat) expect(e).not.toHaveProperty("card");
      }
      expect(input.seed).not.toContain("view-only");
      checked++;
      return greedyBot(input);
    };
    const game = playGame({ seed: "view-only", bots: [watching, watching, watching, watching], maxTurns: 600, engine: spy.engine });
    expect(game.winner).not.toBeNull();
    expect(checked).toBe(game.decisions);
  });

  it("is a pure function of its seed and seating", () => {
    const bots = [greedyBot, randomBot, greedyBot, randomBot, greedyBot];
    const a = playGame({ seed: "same", bots, maxTurns: 600 });
    const b = playGame({ seed: "same", bots, maxTurns: 600 });
    expect(b).toEqual(a);
    expect(playGame({ seed: "other", bots, maxTurns: 600 })).not.toEqual(a);
  });

  it("ranks every seat by when it was eliminated, the winner first", () => {
    const game = playGame({ seed: "places", bots: [greedyBot, greedyBot, randomBot, greedyBot, randomBot, greedyBot], maxTurns: 600 });
    expect(game.winner).not.toBeNull();
    expect(game.places[game.winner as number]).toBe(1);
    expect([...game.places].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("calls a game at the turn cap a draw, its survivors sharing first place", () => {
    const game = playGame({ seed: "capped", bots: [randomBot, randomBot, randomBot], maxTurns: 12 });
    expect(game.winner).toBeNull();
    expect(game.turns).toBe(12);
    expect(game.places).toEqual([1, 1, 1]);
  });

  it("throws on a bot's illegal move", () => {
    const cheat: Bot = () => ({ kind: "end-turn" });
    expect(() => playGame({ seed: "cheat", bots: [cheat, cheat, cheat], maxTurns: 600 })).toThrow(/illegal move/);
  });
});

describe("runSpec", () => {
  it("reports a game that threw as an error, not a result", () => {
    const cheat: Bot = () => ({ kind: "end-turn" });
    const r = runSpec({ index: 3, seed: "s", labels: ["a", "b", "c"], maxTurns: 600 }, () => cheat);
    expect(r.index).toBe(3);
    expect(r.winner).toBeNull();
    expect(r.error).toMatch(/illegal move/);
  });

  it("names unknown bots loudly", () => {
    expect(runSpec({ index: 0, seed: "s", labels: ["greedy", "nobody", "greedy"], maxTurns: 600 }).error).toMatch(/no Risk bot/);
  });

  it("resolves labels through the registry by default", () => {
    const r = runSpec({ index: 0, seed: "registry", labels: ["greedy", "random", "random"], maxTurns: 600 });
    expect(r.error).toBeUndefined();
    expect(r.labels[r.winner as number]).toBe("greedy");
  });
});
