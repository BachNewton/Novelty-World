import { describe, expect, it } from "vitest";
import { PLAYER_COLORS, PLAYER_ICONS } from "./data";
import {
  addBot,
  createLobby,
  joinLobby,
  MAX_PLAYERS,
  removePlayer,
  setPlayerColor,
  setPlayerIcon,
  setPlayerName,
  startGame,
  type LobbyResult,
} from "./lobby";
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
      isBot: false,
      cash: 1500,
      position: 0,
    });
    expect(state.preferences[host.id]).toBeDefined();
    expect(state.armedPauses[host.id]).toBeDefined();
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
      isBot: false,
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
    expect(bot.isBot).toBe(true);
    expect(bot.id).toBe("bot-1");
    expect(bot.name).toBe("Alex");
    expect(bot.color).toBe(PLAYER_COLORS[1]);
    expect(bot.icon).toBe(PLAYER_ICONS[1]);
  });

  it("gives each added bot a distinct id", () => {
    const state = ok(addBot(ok(addBot(lobby()))));
    expect(state.players.map((p) => p.id)).toEqual(["host", "bot-1", "bot-2"]);
  });
});

describe("removePlayer", () => {
  it("drops the seat and its dense records", () => {
    const withBot = ok(addBot(lobby()));
    const state = ok(removePlayer(withBot, "bot-1"));
    expect(state.players).toHaveLength(1);
    expect(state.preferences["bot-1"]).toBeUndefined();
    expect(state.armedPauses["bot-1"]).toBeUndefined();
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

describe("startGame", () => {
  it("flips to active and opens turn 1 for the first seat", () => {
    const state = ok(startGame(ok(addBot(lobby()))));
    expect(state.status).toBe("active");
    expect(state.turn).toMatchObject({ playerId: "host", phase: "pre-roll" });
    expect(state.turns).toEqual([{ turn: 1, playerId: "host", events: [] }]);
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
