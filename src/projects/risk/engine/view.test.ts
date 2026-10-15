import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import { shuffleArray } from "@/shared/lib/utils";
import type { CardId, GameEvent, GameState, Seat } from "../contract";
import { referenceEngine as engine } from ".";
import { inside, playRandomGame } from "./test-kit";
import { wrap } from "./state";

/** States from one random game, with cards in hands and in both piles. */
function sampleStates(): GameState[] {
  const states: GameState[] = [];
  let step = 0;
  playRandomGame({
    players: 4,
    seed: "views",
    engine,
    maxSteps: 50_000,
    onStep: (state) => {
      if (step++ % 25 === 0) states.push(state);
    },
  });
  return states;
}

/** The same game with everything `viewer` may not see changed: the deck's order, the other
 *  hands' cards (their sizes kept) and the random source. */
function scramble(state: GameState, viewer: Seat | null, seed: number): GameState {
  const s = structuredClone(inside(state));
  const others = s.hands.map((_, seat) => seat).filter((seat) => seat !== viewer);
  const pool: CardId[] = shuffleArray([...s.drawPile, ...others.flatMap((seat) => s.hands[seat])], createRng(seed).next);
  s.drawPile = pool.splice(0, s.drawPile.length);
  for (const seat of others) s.hands[seat] = pool.splice(0, s.hands[seat].length);
  s.rng = seed;
  return wrap(s);
}

describe("views (CARDS-2, note public-cards)", () => {
  const states = sampleStates();

  it("show nothing hidden: a view is the same whatever the deck order and the other hands hold", () => {
    let withHiddenCards = 0;
    for (const [i, state] of states.entries()) {
      for (const viewer of [null, 0, 1, 2, 3] as const) {
        const scrambled = scramble(state, viewer, i + 1);
        expect(engine.view(scrambled, viewer)).toEqual(engine.view(state, viewer));
        if (JSON.stringify(inside(scrambled).hands) !== JSON.stringify(inside(state).hands)) withHiddenCards++;
      }
    }
    // The check means something only if the scrambles really moved hidden cards.
    expect(withHiddenCards).toBeGreaterThan(20);
  });

  it("show the viewer's own hand, a spectator none, and every hand's size", () => {
    const state = states.find((s) => inside(s).hands.some((h) => h.length > 0)) as GameState;
    const s = inside(state);
    for (let seat = 0; seat < 4; seat++) {
      const v = engine.view(state, seat);
      expect(v.cards.hand).toEqual(s.hands[seat]);
      expect(v.seats.map((x) => x.handSize)).toEqual(s.hands.map((h) => h.length));
    }
    expect(engine.view(state, null).cards.hand).toBeNull();
  });

  it("show the public card state: draw pile size, discard pile, trades and the next value", () => {
    const state = states.at(-1) as GameState;
    const s = inside(state);
    expect(engine.view(state, 0).cards).toMatchObject({
      drawPile: s.drawPile.length,
      discardPile: s.discardPile,
      setsTraded: s.setsTraded,
    });
  });

  it("hold exactly the contract's fields", () => {
    const v = engine.view(states[0], 0);
    expect(Object.keys(v).sort()).toEqual(
      ["active", "armiesToPlace", "cards", "occupying", "phase", "seats", "territories", "turn", "turnOrder", "viewer", "winner"].sort(),
    );
    expect(Object.keys(v.cards).sort()).toEqual(["discardPile", "drawPile", "hand", "nextSetValue", "setsTraded"]);
  });

  it("refuse a seat that is not at the table", () => {
    expect(() => engine.view(states[0], 4)).toThrow();
  });
});

describe("redact", () => {
  const drawn: GameEvent = { rule: "CARDS-1", kind: "card-drawn", seat: 1, card: "japan" };
  const battle: GameEvent = {
    rule: "COMBAT-4",
    kind: "battle",
    from: "japan",
    to: "kamchatka",
    attackerDice: [6],
    defenderDice: [1],
    attackerLosses: 0,
    defenderLosses: 1,
  };

  it("removes the face of a card drawn by anyone else, for players and spectators", () => {
    for (const viewer of [0, 2, null]) {
      expect(engine.redact([drawn, battle], viewer)).toEqual([{ rule: "CARDS-1", kind: "card-drawn", seat: 1 }, battle]);
    }
  });

  it("keeps the face for the seat that drew it", () => {
    expect(engine.redact([drawn], 1)).toEqual([drawn]);
  });

  it("leaves no drawn card's face in any other seat's events over a whole game", () => {
    const game = playRandomGame({ players: 3, seed: "redact", engine, maxSteps: 50_000 });
    expect(game.events.some((e) => e.kind === "card-drawn")).toBe(true);
    for (const viewer of [0, 1, 2, null]) {
      for (const e of engine.redact(game.events, viewer)) {
        if (e.kind === "card-drawn" && e.seat !== viewer) expect(e.card).toBeUndefined();
      }
    }
  });
});
