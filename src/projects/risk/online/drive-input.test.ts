import { describe, expect, it } from "vitest";
import { createRng } from "@/shared/lib/seeded-random";
import type { GameEvent, Seat } from "../contract";
import { wrap } from "../engine/state";
import { inside } from "../engine/test-kit";
import { randomBot } from "../bots/random";
import { botInput, extendHistory, replayHistory, type History } from "./drive-input";
import { applyAnswer, newOnlineGame, pendingSeat, type OnlineGame } from "./game";
import type { LoggedMove } from "./table";
import { ENGINE } from "../play-engine";

const HUMANS = [true, false, false, false];

interface Played {
  game: OnlineGame;
  history: History;
  log: LoggedMove[];
}

/** A game played by bots until some seat holds cards and the last write drew one. */
function gameWithHands(seed: string): Played {
  let game = newOnlineGame(ENGINE, 4, seed);
  let history = replayHistory(ENGINE, game, []);
  const log: LoggedMove[] = [];
  for (let i = 0; i < 5000; i++) {
    const seat = pendingSeat(ENGINE, game);
    if (seat === null) break;
    const move = randomBot(botInput(ENGINE, game, history, HUMANS, seat, `${seed}/${i.toString()}`));
    const result = applyAnswer(ENGINE, game, { decision: game.decision, seat, move });
    if (!result.ok) throw new Error(result.reason);
    log.push({ decision: game.decision, seat, controller: { kind: "bot", bot: "random" }, move });
    game = result.game;
    const extended = extendHistory(history, game);
    if (!extended) throw new Error("The history fell behind the game");
    history = extended;
    const drew = game.lastEvents.some(({ event }) => event.kind === "card-drawn");
    const view = ENGINE.view(game.engine, null);
    if (drew && view.seats.filter((s) => s.handSize > 0).length >= 2) return { game, history, log };
  }
  throw new Error("No game reached hands worth hiding");
}

/** The same game with everything `viewer` can't see dealt differently: the deck's order, other
 *  hands' cards, and the cards other seats drew, in the last write and the whole history. */
function redealtFor({ game, history }: Played, viewer: Seat, seed: string): { game: OnlineGame; history: History } {
  const state = structuredClone(inside(game.engine));
  const others = state.hands.map((_, seat) => seat).filter((seat) => seat !== viewer);
  const pool = [...state.deck, ...others.flatMap((seat) => state.hands[seat])];
  const rng = createRng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const seat of others) state.hands[seat] = pool.splice(0, state.hands[seat].length);
  state.deck = pool;
  const hide = (event: GameEvent): GameEvent =>
    event.kind === "card-drawn" && event.seat !== viewer ? { ...event, card: "wild-2" } : event;
  const lastEvents = game.lastEvents.map(({ id, event }) => ({ id, event: hide(event) }));
  return { game: { ...game, engine: wrap(state), lastEvents }, history: { ...history, events: history.events.map(hide) } };
}

describe("what a bot is given", () => {
  it.each(["a", "b", "c"])("is the same whatever it can't see: other hands, the deck and others' draws (%s)", (seed) => {
    const played = gameWithHands(seed);
    const seat = pendingSeat(ENGINE, played.game);
    if (seat === null) throw new Error("The game is over");
    const other = redealtFor(played, seat, `redeal/${seed}`);
    expect(JSON.stringify(other.game.engine)).not.toBe(JSON.stringify(played.game.engine));
    expect(JSON.stringify(other.history)).not.toBe(JSON.stringify(played.history));
    expect(botInput(ENGINE, other.game, other.history, HUMANS, seat, "x")).toEqual(
      botInput(ENGINE, played.game, played.history, HUMANS, seat, "x"),
    );
  });

  it("holds its own hand, the public board and history, who is a person, and no state", () => {
    const { game, history } = gameWithHands("own");
    const seat = pendingSeat(ENGINE, game);
    if (seat === null) throw new Error("The game is over");
    const input = botInput(ENGINE, game, history, HUMANS, seat, "x");
    expect(input.view.viewer).toBe(seat);
    expect(input.view.cards.hand).toEqual(inside(game.engine).hands[seat]);
    expect(input.humans).toEqual(HUMANS);
    expect(input.history.slice(-input.events.length)).toEqual(input.events);
    expect(input.history[0].kind).toBe("turn-order");
    expect(Object.keys(input).sort()).toEqual(["events", "history", "humans", "options", "seat", "seed", "view"]);
    expect(JSON.stringify(input)).not.toContain("engineState");
  });
});

describe("a drive's history", () => {
  it("replays from the move log to the same events the game produced", () => {
    const { game, history, log } = gameWithHands("replay");
    expect(replayHistory(ENGINE, game, log)).toEqual(history);
  });

  it("fails loudly when the log doesn't reach the game", () => {
    const { game, log } = gameWithHands("short");
    expect(() => replayHistory(ENGINE, game, log.slice(0, -1))).toThrow(/replay/);
  });

  it("can't be extended past an answer it didn't see", () => {
    const { game, log } = gameWithHands("gap");
    const earlier = replayHistory(ENGINE, { ...game, decision: game.decision - 2, engine: replayEngine(log, game.decision - 2, game) }, log);
    expect(extendHistory(earlier, game)).toBeNull();
  });
});

/** The game's state after its first `decisions` answers. */
function replayEngine(log: readonly LoggedMove[], decisions: number, game: OnlineGame) {
  let replayed = newOnlineGame(ENGINE, game.players, game.seed);
  for (const { decision, seat, move } of log.slice(0, decisions)) {
    const result = applyAnswer(ENGINE, replayed, { decision, seat, move });
    if (!result.ok) throw new Error(result.reason);
    replayed = result.game;
  }
  return replayed.engine;
}
