import { describe, expect, it } from "vitest";
import type { GameView } from "../contract";
import { ENGINE } from "../play-engine";
import { expectedWin, K, NEW_LEDGER, outcomeOf, parseLedger, ratingChange, seatElo, settle, shownChange, START_ELO } from "./rating";
import { eloOf } from "./seat-bots";

const ALICE = { id: "alice", name: "Alice" };

describe("the expected win", () => {
  it("is a seat's share of the table's strength", () => {
    expect(expectedWin([1000, 1000, 1000, 1000], 2)).toBeCloseTo(1 / 4);
    // 400 Elo is ten times the strength: 10 / (10 + 1 + 1).
    expect(expectedWin([1400, 1000, 1000], 0)).toBeCloseTo(10 / 12);
    expect(expectedWin([1400, 1000, 1000], 1)).toBeCloseTo(1 / 12);
  });

  it("sums to one over the table", () => {
    const elos = [1445, 980, 1092, 1210, 1000];
    expect(elos.reduce((sum, _, seat) => sum + expectedWin(elos, seat), 0)).toBeCloseTo(1);
  });
});

describe("a game's change", () => {
  it("is K times the surprise", () => {
    expect(ratingChange([1000, 1000, 1000, 1000], 0, true)).toBeCloseTo(K * 0.75);
    expect(ratingChange([1000, 1000, 1000, 1000], 0, false)).toBeCloseTo(-K * 0.25);
  });

  it("balances out at par: a player who wins their share gains nothing on average", () => {
    const elos = [1000, 1300, 950];
    const p = expectedWin(elos, 0);
    expect(p * ratingChange(elos, 0, true) + (1 - p) * ratingChange(elos, 0, false)).toBeCloseTo(0);
  });

  it("rewards beating strong bots more than weak ones", () => {
    const strong = ratingChange([1000, eloOf("rule-v3"), eloOf("rule-v3")], 0, true);
    const weak = ratingChange([1000, eloOf("gd-defensive"), eloOf("gd-defensive")], 0, true);
    expect(strong).toBeGreaterThan(weak);
  });
});

describe("a seat's Elo", () => {
  it("is a bot's measured one, a person's brought one, or a newcomer's", () => {
    expect(seatElo({ kind: "bot", bot: "greedy" })).toBe(1000);
    expect(seatElo({ kind: "bot", bot: "rule-v1" })).toBe(eloOf("rule-v1"));
    expect(seatElo({ kind: "human", profile: ALICE, elo: 1234 })).toBe(1234);
    expect(seatElo({ kind: "human", profile: ALICE })).toBe(START_ELO);
  });
});

describe("a seat's outcome", () => {
  const view = ENGINE.view(ENGINE.newGame({ players: 3 }, "seed").state, 0);
  const eliminated = (seat: number): GameView => ({ ...view, seats: view.seats.map((s) => (s.seat === seat ? { ...s, eliminated: true } : s)) });

  it("is unknown while the seat plays on", () => {
    expect(outcomeOf(view, 0, false)).toBeNull();
    expect(outcomeOf(eliminated(1), 0, false)).toBeNull();
  });

  it("is lost once the seat is eliminated", () => {
    expect(outcomeOf(eliminated(0), 0, false)).toBe("lost");
  });

  it("is won once the server has the game over with the seat holding the world", () => {
    const won = { ...view, winner: 0 };
    expect(outcomeOf(won, 0, false)).toBeNull();
    expect(outcomeOf(won, 0, true)).toBe("won");
  });
});

describe("the ledger", () => {
  const table = [1000, 1000, 1000, 1000];

  it("starts at 1000", () => {
    expect(NEW_LEDGER.elo).toBe(1000);
  });

  it("scores a game once, however often it is settled", () => {
    const once = settle(NEW_LEDGER, "game-1", table, 0, "won");
    expect(once.elo).toBeCloseTo(1000 + K * 0.75);
    expect(once.games["game-1"]).toEqual({ from: 1000, to: once.elo });
    expect(settle(once, "game-1", table, 0, "won")).toBe(once);
    expect(settle(once, "game-1", table, 0, "lost")).toBe(once);
  });

  it("carries the rating from game to game", () => {
    const first = settle(NEW_LEDGER, "game-1", table, 0, "won");
    const second = settle(first, "game-2", table, 2, "lost");
    expect(second.games["game-2"]).toEqual({ from: first.elo, to: first.elo - K * 0.25 });
    expect(second.elo).toBeCloseTo(1000 + K * 0.5);
  });

  it("reads back what it saved, and refuses anything else", () => {
    const saved = settle(NEW_LEDGER, "game-1", table, 0, "won");
    expect(parseLedger(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(parseLedger(null)).toBe(NEW_LEDGER);
    for (const bad of [1000, [], { elo: "1000", games: {} }, { elo: 1000 }, { elo: 1000, games: { g: { from: 1 } } }]) {
      expect(() => parseLedger(bad)).toThrow();
    }
  });
});

describe("the change shown", () => {
  it("is signed, in the whole points the player sees", () => {
    expect(shownChange({ from: 1000, to: 1024 })).toBe("+24");
    expect(shownChange({ from: 1024, to: 1016 })).toBe("−8");
    expect(shownChange({ from: 1000.4, to: 1000.2 })).toBe("±0");
    // 1000.4 shows as 1000 and 1008.6 as 1009: the change shown is 9, not 8.2.
    expect(shownChange({ from: 1000.4, to: 1008.6 })).toBe("+9");
  });
});
