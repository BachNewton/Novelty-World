import { describe, expect, it } from "vitest";
import { driverRole } from "./driver";
import { freshGame } from "./mocks";
import type { GameState } from "./types";

// freshGame seats p1 as the human and p2-p4 as bots, with p1 active.
const base = freshGame();

function activePlayer(id: string): GameState {
  return { ...base, turn: { ...base.turn, playerId: id } };
}

describe("driverRole", () => {
  it("drives the local human's own turn as self", () => {
    expect(driverRole(activePlayer("p1"), "p1")).toBe("self");
  });

  it("leaves another connected human's turn to them (none)", () => {
    // p2..p4 are bots in freshGame; mark p2 human to model a second player.
    const withHuman: GameState = {
      ...activePlayer("p2"),
      players: base.players.map((p) =>
        p.id === "p2" ? { ...p, botStrategy: null } : p,
      ),
    };
    expect(driverRole(withHuman, "p1")).toBe("none");
  });

  it("proxies a bot seat regardless of who this client is", () => {
    expect(driverRole(activePlayer("p2"), "p1")).toBe("proxy");
    expect(driverRole(activePlayer("p2"), null)).toBe("proxy");
  });

  it("lets a spectator proxy bots but not seated humans", () => {
    expect(driverRole(activePlayer("p2"), null)).toBe("proxy");
    expect(driverRole(activePlayer("p1"), null)).toBe("none");
  });

  it("is none when the active id matches no seat", () => {
    expect(driverRole(activePlayer("ghost"), "p1")).toBe("none");
  });

  it("resolves the dev sandbox (1 human + bots) to self / proxy", () => {
    // freshGame is exactly this shape: p1 human, p2-p4 bots.
    expect(driverRole(activePlayer("p1"), "p1")).toBe("self");
    expect(driverRole(activePlayer("p3"), "p1")).toBe("proxy");
  });
});
