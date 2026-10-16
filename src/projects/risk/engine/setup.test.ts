import { describe, expect, it } from "vitest";
import type { GameEvent, Seat } from "../contract";
import { TERRITORIES, type TerritoryId } from "../map";
import { referenceEngine as engine } from ".";
import { FULL_DECK } from "../cards";
import { inside } from "./test-kit";

function dealtOwners(events: readonly GameEvent[]): Record<TerritoryId, Seat> {
  const dealt = events.find((e) => e.kind === "dealt");
  if (dealt?.kind !== "dealt") throw new Error("no deal");
  return dealt.owners;
}

function startingArmies(events: readonly GameEvent[]): Record<TerritoryId, number> {
  const starting = events.find((e) => e.kind === "starting-armies");
  if (starting?.kind !== "starting-armies") throw new Error("no starting armies");
  return starting.armies;
}

const count = (owners: Record<TerritoryId, Seat>, owner: Seat) =>
  Object.values(owners).filter((o) => o === owner).length;

const STARTING = { 3: 35, 4: 30, 5: 25, 6: 20 } as const;

describe("setup", () => {
  it("SETUP-1: the game is for 3 to 6 players", () => {
    for (const players of [0, 1, 2, 7, 3.5]) expect(() => engine.newGame({ players }, "x")).toThrow();
  });

  it("SETUP-3: the seat order is drawn at random, every ordering equally likely", () => {
    const seen = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const order = engine.view(engine.newGame({ players: 3 }, `order-${i}`).state, null).turnOrder.join();
      seen.set(order, (seen.get(order) ?? 0) + 1);
    }
    expect(seen.size).toBe(6);
    for (const n of seen.values()) expect(n).toBeGreaterThan(60);
  });

  it("SETUP-4: the 42 territories are dealt round the seat order from the first player", () => {
    for (const [players, sizes] of [[3, [14, 14, 14]], [4, [11, 11, 10, 10]], [5, [9, 9, 8, 8, 8]], [6, [7, 7, 7, 7, 7, 7]]] as const) {
      const { state, events } = engine.newGame({ players }, `deal-${players}`);
      const v = engine.view(state, null);
      const owners = dealtOwners(events);
      expect(Object.keys(owners)).toHaveLength(42);
      expect(v.turnOrder.map((seat) => count(owners, seat))).toEqual(sizes);
      for (const t of TERRITORIES) expect(v.territories[t.id].owner).toBe(owners[t.id]);
    }
  });

  it("SETUP-4: the deal differs from seed to seed", () => {
    const a = dealtOwners(engine.newGame({ players: 4 }, "a").events);
    const b = dealtOwners(engine.newGame({ players: 4 }, "b").events);
    expect(a).not.toEqual(b);
  });

  it("SETUP-5: every starting army is on the board, at least 1 on each territory, as the event tells", () => {
    for (const players of [3, 4, 5, 6] as const) {
      const { state, events } = engine.newGame({ players }, `armies-${players}`);
      const v = engine.view(state, null);
      const armies = startingArmies(events);
      for (const t of TERRITORIES) {
        expect(v.territories[t.id].armies).toBe(armies[t.id]);
        expect(armies[t.id]).toBeGreaterThanOrEqual(1);
      }
      expect(v.seats.map((seat) => seat.armies)).toEqual(v.seats.map(() => STARTING[players]));
    }
  });

  it("SETUP-5: each remaining army goes to a uniformly random territory of its owner's", () => {
    // 3 players: 14 territories each and 21 armies to place, so 1.5 extra on each territory a
    // game. Over 300 games each territory's total extra is about 450, give or take 20.
    const games = 300;
    const extra = new Map<TerritoryId, number>();
    for (let i = 0; i < games; i++) {
      const armies = startingArmies(engine.newGame({ players: 3 }, `spread-${i}`).events);
      for (const t of TERRITORIES) extra.set(t.id, (extra.get(t.id) ?? 0) + armies[t.id] - 1);
    }
    for (const total of extra.values()) {
      expect(total).toBeGreaterThan(games * 1.5 - 100);
      expect(total).toBeLessThan(games * 1.5 + 100);
    }
  });

  it("SETUP-6, SETUP-7, SETUP-9: the game starts at the first player's turn 1, the full deck shuffled, with no setup decision", () => {
    for (const players of [3, 4, 5, 6] as const) {
      const { state, events } = engine.newGame({ players }, `done-${players}`);
      const s = inside(state);
      const v = engine.view(state, null);
      expect(events.map((e) => e.kind).slice(0, 5)).toEqual(["turn-order", "dealt", "starting-armies", "deck-reshuffled", "turn-started"]);
      expect(events.some((e) => e.kind === "deck-reshuffled" && e.rule === "SETUP-6")).toBe(true);
      expect(s.deck).toHaveLength(44);
      expect(s.deck).not.toEqual(FULL_DECK);
      expect([...s.deck].sort()).toEqual([...FULL_DECK].sort());
      expect(v.turn).toBe(1);
      expect(v.active).toBe(v.turnOrder[0]);
      expect(v.phase).toBe("reinforce");
      expect(engine.options(state, v.active)?.kind).toBe("reinforce");
      expect(v.seats.every((seat) => seat.handSize === 0)).toBe(true);
      expect(v.cards).toMatchObject({ deck: 44, traded: [] });
    }
  });

  it("INV-10: setup is a function of the seed", () => {
    expect(engine.newGame({ players: 5 }, "same")).toEqual(engine.newGame({ players: 5 }, "same"));
  });
});
