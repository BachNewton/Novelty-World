import { describe, expect, it } from "vitest";
import { BOT_NAMES } from "./bot-names";
import { PLAYER_COLORS, PLAYER_ICONS } from "./data";
import {
  addBot,
  createLobby,
  joinLobby,
  lobbyReduce,
  MAX_PLAYERS,
  removePlayer,
  setPlayerColor,
  setPlayerIcon,
  setPlayerName,
  startGame,
  type LobbyResult,
} from "./lobby";
import { DEFAULT_BOT_VERSION } from "./bots/roles";
import type { GameState } from "./types";

const HOST = { id: "host", name: "Kyle" };

function lobby(): GameState {
  return createLobby(HOST, "seed-1");
}

/** Unwrap a LobbyResult, failing the test if it rejected. */
function ok(result: LobbyResult): GameState {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.state;
}

describe("createLobby", () => {
  it("seats the host alone as a human with the first color + icon", () => {
    const state = lobby();
    expect(state.status).toBe("lobby");
    expect(state.players).toHaveLength(1);
    const [host] = state.players;
    expect(host).toMatchObject({
      id: "host",
      name: "Kyle",
      color: PLAYER_COLORS[0],
      icon: PLAYER_ICONS[0],
      botStrategy: null,
      cash: 1500,
      position: 0,
    });
    expect(state.preferences[host.id]).toBeDefined();
  });
});

describe("joinLobby", () => {
  it("auto-assigns the next free color + icon", () => {
    const state = ok(joinLobby(lobby(), { id: "p2", name: "Alex" }));
    const joined = state.players[1];
    expect(joined).toMatchObject({
      id: "p2",
      color: PLAYER_COLORS[1],
      icon: PLAYER_ICONS[1],
      botStrategy: null,
    });
  });

  it("never reuses a color or icon already in the lobby", () => {
    let state = lobby();
    for (let i = 2; i <= MAX_PLAYERS; i++) {
      state = ok(joinLobby(state, { id: `p${i.toString()}`, name: `P${i.toString()}` }));
    }
    expect(state.players).toHaveLength(MAX_PLAYERS);
    expect(new Set(state.players.map((p) => p.color)).size).toBe(MAX_PLAYERS);
    expect(new Set(state.players.map((p) => p.icon)).size).toBe(MAX_PLAYERS);
  });

  it("is idempotent for an already-seated profile", () => {
    const first = ok(joinLobby(lobby(), { id: "p2", name: "Alex" }));
    const again = ok(joinLobby(first, { id: "p2", name: "Alex" }));
    expect(again.players).toHaveLength(2);
  });

  it("rejects joining a full lobby", () => {
    let state = lobby();
    for (let i = 2; i <= MAX_PLAYERS; i++) {
      state = ok(joinLobby(state, { id: `p${i.toString()}`, name: `P${i.toString()}` }));
    }
    expect(joinLobby(state, { id: "p9", name: "Overflow" })).toMatchObject({
      ok: false,
      reason: "lobby full",
    });
  });

  it("rejects joining a started game", () => {
    const started = ok(startGame(ok(addBot(lobby()))));
    expect(joinLobby(started, { id: "p2", name: "Alex" }).ok).toBe(false);
  });
});

describe("addBot", () => {
  it("seats a bot with a synthetic id, a name, and a free color + icon", () => {
    const state = ok(addBot(lobby()));
    const bot = state.players[1];
    // Defaults to the overall-best bot (highest Elo) — the opponent for a real game.
    expect(bot.botStrategy).toBe(DEFAULT_BOT_VERSION);
    expect(bot.id).toBe("bot-1");
    // Name is drawn from the 100-name pool (seed-deterministic).
    expect(BOT_NAMES).toContain(bot.name);
    expect(bot.color).toBe(PLAYER_COLORS[1]);
    expect(bot.icon).toBe(PLAYER_ICONS[1]);
  });

  it("draws a distinct, in-pool name for each added bot", () => {
    let state = lobby();
    for (let i = 0; i < 6; i++) state = ok(addBot(state));
    const botNames = state.players.slice(1).map((p) => p.name);
    expect(botNames.every((name) => BOT_NAMES.includes(name))).toBe(true);
    expect(new Set(botNames).size).toBe(botNames.length);
  });

  it("can seat a specific strategy", () => {
    expect(ok(addBot(lobby(), "dumb")).players[1].botStrategy).toBe("dumb");
  });

  it("gives each added bot a distinct id", () => {
    const state = ok(addBot(ok(addBot(lobby()))));
    expect(state.players.map((p) => p.id)).toEqual(["host", "bot-1", "bot-2"]);
  });

  // A pinned-id add is ABSOLUTE: re-applying it (as the optimistic overlay does
  // when a realtime echo replays a still-pending op on a head that already
  // seated the bot) is a no-op, never a second seat. Guards the double-add bug.
  it("is idempotent on a pinned id already seated", () => {
    const once = ok(addBot(lobby(), "claude", "bot-1"));
    const twice = ok(addBot(once, "claude", "bot-1"));
    expect(twice.players).toHaveLength(2);
    expect(twice).toBe(once);
  });
});

describe("setPlayerStrategy", () => {
  it("switches a bot seat's strategy", () => {
    const withBot = ok(addBot(lobby())); // claude by default
    const switched = ok(
      lobbyReduce(withBot, { type: "setStrategy", playerId: "bot-1", strategy: "dumb" }),
    );
    expect(switched.players[1].botStrategy).toBe("dumb");
  });

  it("rejects switching a human seat (no strategy)", () => {
    expect(
      lobbyReduce(lobby(), { type: "setStrategy", playerId: "host", strategy: "dumb" }).ok,
    ).toBe(false);
  });
});

describe("removePlayer", () => {
  it("drops the seat and its dense records", () => {
    const withBot = ok(addBot(lobby()));
    const state = ok(removePlayer(withBot, "bot-1"));
    expect(state.players).toHaveLength(1);
    expect(state.preferences["bot-1"]).toBeUndefined();
  });

  it("rejects an unknown player", () => {
    expect(removePlayer(lobby(), "ghost").ok).toBe(false);
  });
});

describe("setPlayerColor / setPlayerIcon", () => {
  it("changes a free color", () => {
    const state = ok(setPlayerColor(lobby(), "host", "emerald"));
    expect(state.players[0].color).toBe("emerald");
  });

  it("rejects a color another seat already holds", () => {
    const withJoin = ok(joinLobby(lobby(), { id: "p2", name: "Alex" }));
    const taken = withJoin.players[1].color;
    expect(setPlayerColor(withJoin, "host", taken)).toMatchObject({
      ok: false,
      reason: "color taken",
    });
  });

  it("rejects an icon another seat already holds", () => {
    const withJoin = ok(joinLobby(lobby(), { id: "p2", name: "Alex" }));
    const taken = withJoin.players[1].icon;
    expect(setPlayerIcon(withJoin, "host", taken).ok).toBe(false);
  });
});

describe("setPlayerName", () => {
  it("renames and trims", () => {
    const state = ok(setPlayerName(lobby(), "host", "  Kylie  "));
    expect(state.players[0].name).toBe("Kylie");
  });

  it("rejects a blank name", () => {
    expect(setPlayerName(lobby(), "host", "   ").ok).toBe(false);
  });
});

/** A lobby seating the host plus `count` bots, on the given rng seed. */
function lobbyWith(count: number, seed = "seed-1"): GameState {
  let state = createLobby(HOST, seed);
  for (let i = 0; i < count; i++) state = ok(addBot(state));
  return state;
}

describe("startGame", () => {
  it("flips to active and opens turn 1 for the new first seat", () => {
    const seated = ok(addBot(lobby()));
    const state = ok(startGame(seated));
    expect(state.status).toBe("active");
    // Play order is randomized, so whoever lands first drives turn 1 — but the
    // turn pointer and opening TurnGroup must agree with the shuffled roster.
    const first = state.players[0];
    expect(state.turn).toMatchObject({ playerId: first.id, phase: "pre-roll" });
    expect(state.turns).toEqual([{ turn: 1, playerId: first.id, events: [] }]);
    // The roster is a permutation of the lobby — same seats, no loss.
    expect(new Set(state.players.map((p) => p.id))).toEqual(
      new Set(seated.players.map((p) => p.id)),
    );
    expect(state.preferences[first.id]).toBeDefined();
  });

  it("randomizes play order off the lobby join order", () => {
    // Across a spread of seeds, at least one must reorder a 4-seat lobby —
    // otherwise turn order would still just be the join order.
    const reordered = Array.from({ length: 16 }, (_, i) => {
      const seated = lobbyWith(3, `shuffle-seed-${i.toString()}`);
      const joinOrder = seated.players.map((p) => p.id);
      const playOrder = ok(startGame(seated)).players.map((p) => p.id);
      return joinOrder.join() !== playOrder.join();
    });
    expect(reordered.some(Boolean)).toBe(true);
  });

  it("shuffles deterministically for a given rng seed", () => {
    const seated = lobbyWith(3);
    const a = ok(startGame(seated)).players.map((p) => p.id);
    const b = ok(startGame(seated)).players.map((p) => p.id);
    expect(a).toEqual(b);
  });

  it("requires at least two participants", () => {
    expect(startGame(lobby())).toMatchObject({
      ok: false,
      reason: "need at least 2 players",
    });
  });

  it("requires at least one human", () => {
    const botsOnly = ok(removePlayer(ok(addBot(ok(addBot(lobby())))), "host"));
    expect(startGame(botsOnly)).toMatchObject({
      ok: false,
      reason: "need at least one human",
    });
  });
});

describe("lobbyReduce", () => {
  // The dispatcher both the route and the client's optimistic overlay apply
  // through — each op must reach the same transform the helper would.
  it("dispatches each op to its matching helper", () => {
    expect(ok(lobbyReduce(lobby(), { type: "join", profile: { id: "p2", name: "Alex" } })).players)
      .toHaveLength(2);
    expect(ok(lobbyReduce(lobby(), { type: "addBot", botId: "bot-1" })).players[1].botStrategy).toBe(DEFAULT_BOT_VERSION);
    expect(ok(lobbyReduce(ok(addBot(lobby())), { type: "removePlayer", playerId: "bot-1" })).players)
      .toHaveLength(1);
    expect(ok(lobbyReduce(lobby(), { type: "setColor", playerId: "host", color: "emerald" })).players[0].color)
      .toBe("emerald");
    expect(ok(lobbyReduce(lobby(), { type: "setName", playerId: "host", name: "Kylie" })).players[0].name)
      .toBe("Kylie");
    expect(ok(lobbyReduce(ok(addBot(lobby())), { type: "start" })).status).toBe("active");
  });

  it("propagates a helper's rejection", () => {
    const withJoin = ok(joinLobby(lobby(), { id: "p2", name: "Alex" }));
    const taken = withJoin.players[1].color;
    expect(lobbyReduce(withJoin, { type: "setColor", playerId: "host", color: taken })).toMatchObject({
      ok: false,
      reason: "color taken",
    });
  });
});
