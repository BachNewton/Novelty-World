import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import type { CardId, GameEvent, Seat } from "../contract";
import { BOTS } from "./bots";
import { botInput } from "./drive-input";
import { applyAnswer, newOnlineGame, pendingSeat, type OnlineGame } from "./game";
import { stubEngine } from "./stub-engine";

const ENGINE = stubEngine;

/** A game played by bots until some seat holds cards and the last write drew one. */
function gameWithHands(seed: string): OnlineGame {
  let game = newOnlineGame(ENGINE, 4, seed);
  for (let i = 0; i < 5000; i++) {
    const seat = pendingSeat(ENGINE, game);
    if (seat === null) break;
    const move = BOTS.random.bot(botInput(ENGINE, game, seat, `${seed}/${i.toString()}`));
    const result = applyAnswer(ENGINE, game, { decision: game.decision, seat, move });
    if (!result.ok) throw new Error(result.reason);
    game = result.game;
    const drew = game.lastEvents.some(({ event }) => event.kind === "card-drawn");
    const view = ENGINE.view(game.engine, null);
    if (drew && view.seats.filter((s) => s.handSize > 0).length >= 2) return game;
  }
  throw new Error("No game reached hands worth hiding");
}

interface Hidden {
  deck: CardId[];
  hands: CardId[][];
}

/** The same game with everything `viewer` can't see dealt differently: the deck's order, other
 *  hands' cards, and the cards other seats drew in the last write. */
function redealtFor(game: OnlineGame, viewer: Seat, seed: string): OnlineGame {
  const state = structuredClone(game.engine.engineState) as Hidden;
  const others = state.hands.map((_, seat) => seat).filter((seat) => seat !== viewer);
  const pool = [...state.deck, ...others.flatMap((seat) => state.hands[seat])];
  const rng = createRng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const seat of others) state.hands[seat] = pool.splice(0, state.hands[seat].length);
  state.deck = pool;
  const lastEvents = game.lastEvents.map(({ id, event }): { id: string; event: GameEvent } =>
    event.kind === "card-drawn" && event.seat !== viewer ? { id, event: { ...event, card: "wild-2" } } : { id, event },
  );
  return { ...game, engine: { engineState: state }, lastEvents };
}

describe("what a bot is given", () => {
  it.each(["a", "b", "c"])("is the same whatever it can't see: other hands, the deck and others' draws (%s)", (seed) => {
    const game = gameWithHands(seed);
    const seat = pendingSeat(ENGINE, game);
    if (seat === null) throw new Error("The game is over");
    const other = redealtFor(game, seat, `redeal/${seed}`);
    expect(JSON.stringify(other.engine)).not.toBe(JSON.stringify(game.engine));
    expect(botInput(ENGINE, other, seat, "x")).toEqual(botInput(ENGINE, game, seat, "x"));
  });

  it("holds its own hand and the public board, and no state", () => {
    const game = gameWithHands("own");
    const seat = pendingSeat(ENGINE, game);
    if (seat === null) throw new Error("The game is over");
    const input = botInput(ENGINE, game, seat, "x");
    expect(input.view.viewer).toBe(seat);
    expect(input.view.cards.hand).toEqual((game.engine.engineState as Hidden).hands[seat]);
    expect(Object.keys(input).sort()).toEqual(["events", "options", "seat", "seed", "view"]);
    expect(JSON.stringify(input)).not.toContain("engineState");
  });
});
