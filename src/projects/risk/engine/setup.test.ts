import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import type { GameEvent, GameState, Seat } from "../contract";
import { TERRITORIES, type TerritoryId } from "../map";
import { referenceEngine as engine } from ".";
import { FULL_DECK } from "./cards";
import { inside, play, randomLegalMove } from "./test-kit";

function dealtOwners(events: readonly GameEvent[]): Record<TerritoryId, Seat> {
  const dealt = events.find((e) => e.kind === "dealt");
  if (dealt?.kind !== "dealt") throw new Error("no deal");
  return dealt.owners;
}

const count = (owners: Record<TerritoryId, Seat>, owner: Seat) =>
  Object.values(owners).filter((o) => o === owner).length;

/** Plays setup out with random legal placements, recording who placed each time. */
function playSetup(state: GameState): { state: GameState; placers: Seat[]; events: GameEvent[] } {
  const rng = createRng("setup");
  const placers: Seat[] = [];
  const events: GameEvent[] = [];
  for (;;) {
    const v = engine.view(state, null);
    if (v.phase !== "setup-place") return { state, placers, events };
    const options = engine.options(state, v.active);
    if (!options) throw new Error("no options in setup");
    placers.push(v.active);
    const result = play(engine, state, v.active, randomLegalMove(options, engine.view(state, v.active), rng));
    events.push(...result.events);
    state = result.state;
  }
}

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

  it("SETUP-4: the 42 territories are dealt round the seat order, 1 army on each", () => {
    for (const [players, sizes] of [[3, [14, 14, 14]], [4, [11, 11, 10, 10]], [5, [9, 9, 8, 8, 8]], [6, [7, 7, 7, 7, 7, 7]]] as const) {
      const { state, events } = engine.newGame({ players }, `deal-${players}`);
      const v = engine.view(state, null);
      const owners = dealtOwners(events);
      expect(Object.keys(owners)).toHaveLength(42);
      expect(v.turnOrder.map((seat) => count(owners, seat))).toEqual(sizes);
      for (const t of TERRITORIES) expect(v.territories[t.id]).toEqual({ owner: owners[t.id], armies: 1 });
    }
  });

  it("SETUP-4: the deal differs from seed to seed", () => {
    const a = dealtOwners(engine.newGame({ players: 4 }, "a").events);
    const b = dealtOwners(engine.newGame({ players: 4 }, "b").events);
    expect(a).not.toEqual(b);
  });

  it("SETUP-1: each player has their starting armies to place, less the dealt ones", () => {
    const { state } = engine.newGame({ players: 4 }, "armies");
    const s = inside(state);
    const order = s.turnOrder;
    expect(order.map((seat) => s.setupArmiesLeft?.[seat])).toEqual([19, 19, 20, 20]);
  });

  it("SETUP-5: placement starts after the player dealt the last territory, one army a turn, skipping players with none left", () => {
    const { state } = engine.newGame({ players: 4 }, "placement");
    const order = engine.view(state, null).turnOrder;
    // The 42nd card goes to the second in order, so the third places first. The first two
    // have 19 to place, the others 20: 19 full rounds, then the last two once more.
    const { placers } = playSetup(state);
    const round = [order[2], order[3], order[0], order[1]];
    expect(placers).toEqual([...Array.from({ length: 19 }, () => round).flat(), order[2], order[3]]);
  });

  it("SETUP-5: exactly one army, on a territory the player owns", () => {
    const { state } = engine.newGame({ players: 3 }, "one-army");
    const v = engine.view(state, null);
    const own = TERRITORIES.map((t) => t.id).filter((t) => v.territories[t].owner === v.active);
    const other = TERRITORIES.map((t) => t.id).find((t) => v.territories[t].owner !== v.active) as TerritoryId;
    expect(engine.apply(state, v.active, { kind: "place", territory: own[0], armies: 2 }).ok).toBe(false);
    expect(engine.apply(state, v.active, { kind: "place", territory: other, armies: 1 }).ok).toBe(false);
    expect(engine.apply(state, v.active, { kind: "end-turn" }).ok).toBe(false);
    const placed = play(engine, state, v.active, { kind: "place", territory: own[0], armies: 1 });
    expect(engine.view(placed.state, null).territories[own[0]].armies).toBe(2);
    expect(engine.view(placed.state, null).active).not.toBe(v.active);
  });

  it("SETUP-6, SETUP-7, SETUP-9: after placement the full deck is shuffled and the first player takes turn 1", () => {
    for (const players of [3, 4, 5, 6]) {
      const started = engine.newGame({ players }, `done-${players}`);
      const { state, events } = playSetup(started.state);
      const s = inside(state);
      const v = engine.view(state, null);
      expect(events.some((e) => e.kind === "deck-reshuffled" && e.rule === "SETUP-6")).toBe(true);
      expect(s.drawPile).toHaveLength(44);
      expect(s.drawPile).not.toEqual(FULL_DECK);
      expect([...s.drawPile].sort()).toEqual([...FULL_DECK].sort());
      expect(v.turn).toBe(1);
      expect(v.active).toBe(v.turnOrder[0]);
      expect(v.phase).toBe("reinforce");
      const starting = { 3: 35, 4: 30, 5: 25, 6: 20 }[players];
      expect(v.seats.map((seat) => seat.armies)).toEqual(v.seats.map(() => starting));
      expect(v.seats.every((seat) => seat.handSize === 0)).toBe(true);
      expect(v.cards.setsTraded).toBe(0);
    }
  });
});
