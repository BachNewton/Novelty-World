import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, GameView, Seat } from "../contract";
import { referenceEngine as engine } from "../engine";
import { play, position, randomLegalMove } from "../engine/test-kit";
import { createRng } from "@/shared/lib/seeded-random";
import type { LoggedEvent } from "../online/game";
import { caughtUp, receive, startPlayback, stepView, tick, type Board, type Effect, type Pace, type Playback } from "./playback";

const logged = (decision: number, events: readonly GameEvent[]): LoggedEvent[] => events.map((event, i) => ({ id: `${decision}:${i}`, event }));

/** Every decision of a random-legal game: the view before, the events and the view after. */
function* decisions(players: number, seed: string, viewer: Seat | null) {
  const started = engine.newGame({ players }, seed);
  const rng = createRng(`player:${seed}`);
  let state: GameState = started.state;
  for (let step = 0; step < 50_000; step++) {
    const before = engine.view(state, viewer);
    if (before.phase === "game-over") return;
    const seat = before.active;
    const options = engine.options(state, seat);
    if (!options) throw new Error("the active seat has no options");
    const result = play(engine, state, seat, randomLegalMove(options, engine.view(state, seat), rng));
    state = result.state;
    yield { before, events: engine.redact(result.events, viewer), after: engine.view(state, viewer) };
  }
  throw new Error("the game did not end");
}

/** A blitz's capture moves in an amount the events don't say, until the move-in: the board steps
 *  the armies either side of the border on a guess, and keeps their total right. */
function withoutGuess(stepped: GameView, real: GameView, events: readonly GameEvent[]): GameView {
  const blitz = events.find((e) => e.kind === "blitzed");
  if (!blitz || !real.occupying || !events.some((e) => e.kind === "captured")) return stepped;
  const { from, to } = real.occupying;
  expect(stepped.territories[from].armies + stepped.territories[to].armies).toBe(real.territories[from].armies + real.territories[to].armies);
  return { ...stepped, territories: { ...stepped.territories, [from]: real.territories[from], [to]: real.territories[to] }, occupying: real.occupying };
}

describe("stepView", () => {
  for (const [players, viewer] of [
    [3, null],
    [4, 0],
    [6, null],
  ] as const) {
    it(`steps every decision of a ${players}-player game to the engine's own view (viewer ${String(viewer)})`, () => {
      const kinds = new Set<string>();
      for (const { before, events, after } of decisions(players, `playback-${players}`, viewer)) {
        let board: Board = { view: before, fight: null };
        for (const event of events) {
          kinds.add(event.kind);
          board = stepView(board, event);
        }
        // A seat's own hand gains the cards it takes from a seat it eliminates, which the event
        // only counts: the batch's view puts them in.
        const took = events.some((e) => e.kind === "eliminated" && e.by === viewer && e.cardsTaken > 0);
        const stepped = withoutGuess(board.view, after, events);
        expect(took ? { ...stepped, cards: { ...stepped.cards, hand: after.cards.hand } } : stepped).toEqual(after);
      }
      // The game reached every event a turn can make.
      for (const kind of ["placed", "traded", "battle", "blitzed", "captured", "occupied", "eliminated", "card-drawn", "fortified", "turn-started", "game-over"]) expect(kinds).toContain(kind);
    });
  }
});

// A position with the viewer (seat 0) next to a bot (seat 1) whose turn it is.
const state = position({ board: { alaska: [1, 8], kamchatka: [0, 2], japan: [0, 3] }, active: 1, phase: "attack" });
const view = (s: GameState = state, viewer: Seat | null = 0) => engine.view(s, viewer);
const PACE: Pace = { scale: 1, viewer: 0 };

/** The bot's moves, applied through the engine: the feed after each. */
function botMoves(): { events: LoggedEvent[]; view: GameView } {
  const blitz = play(engine, state, 1, { kind: "blitz", from: "alaska", to: "kamchatka", keepAtLeast: 1 });
  const occupy = play(engine, blitz.state, 1, { kind: "occupy", armies: engine.view(blitz.state, null).occupying?.max ?? 0 });
  return { events: [...logged(0, blitz.events), ...logged(1, occupy.events)], view: view(occupy.state) };
}

const effectKinds = (p: Playback) => p.beat?.effects.map((e: Effect) => e.kind);

describe("playback", () => {
  it("holds another seat's moves for a beat each, stepping the board, and ends on the feed's view", () => {
    const { events, view: after } = botMoves();
    let p = receive(startPlayback(view(), []), after, events, PACE);
    expect(p.holding).toBe(true);
    expect(effectKinds(p)).toEqual(["fight"]);
    expect(p.board.view.territories.kamchatka.owner).toBe(0);
    p = tick(p, PACE);
    expect(effectKinds(p)).toEqual(["capture"]);
    expect(p.board.view.territories.kamchatka.owner).toBe(1);
    p = tick(p, PACE);
    expect(effectKinds(p)).toEqual(["march"]);
    expect(p.beat?.effects[0]).toMatchObject({ kind: "march", path: ["alaska", "kamchatka"] });
    p = tick(p, PACE);
    expect(caughtUp(p)).toBe(true);
    expect(p.board.view).toBe(after);
    expect(p.shown).toEqual(events);
  });

  it("takes only the events after the ones it has, however the feed grows", () => {
    const { events, view: after } = botMoves();
    let p = receive(startPlayback(view(), []), after, events.slice(0, 1), PACE);
    p = receive(p, after, events, PACE);
    while (!caughtUp(p)) p = tick(p, PACE);
    expect(p.shown).toEqual(events);
  });

  it("plays the viewer's own moves at once, effects and all", () => {
    const own = position({ board: { alaska: [0, 3] }, active: 0 });
    const placed = play(engine, own, 0, { kind: "place", territory: "alaska", armies: 3 });
    const p = receive(startPlayback(view(own), []), view(placed.state), logged(0, placed.events), PACE);
    expect(caughtUp(p)).toBe(true);
    expect(p.beat).toMatchObject({ paced: false, effects: [{ kind: "arrive", territory: "alaska", armies: 3, seat: 0 }] });
  });

  it("plays everything at once at the instant speed, and a spectator's view of every seat is paced", () => {
    const { events, view: after } = botMoves();
    const instant = receive(startPlayback(view(), []), after, events, { scale: 0, viewer: 0 });
    expect(caughtUp(instant)).toBe(true);
    expect(effectKinds(instant)).toEqual(["fight", "capture", "march"]);
    expect(receive(startPlayback(view(state, null), []), view(state, null), events, { scale: 1, viewer: null }).holding).toBe(true);
  });

  it("marks the batch the news is read from", () => {
    const { events, view: after } = botMoves();
    let p = receive(startPlayback(view(), []), after, events, { scale: 0, viewer: 0 });
    expect(p.latestFrom).toBe(0);
    const more = logged(2, [{ rule: "TURN-1", kind: "phase", phase: "fortify" }]);
    p = receive(p, after, [...events, ...more], { scale: 0, viewer: 0 });
    expect(p.latestFrom).toBe(events.length);
  });

  it("shows a continent taken and a seat falling where its last territory fell", () => {
    const last = position({
      board: { "eastern-australia": [1, 2], "western-australia": [1, 2], "new-guinea": [1, 8], indonesia: [2, 1] },
      rest: [0, 1],
      active: 1,
      phase: "attack",
    });
    const blitz = play(engine, last, 1, { kind: "blitz", from: "new-guinea", to: "indonesia", keepAtLeast: 1 });
    const occupying = engine.view(blitz.state, null).occupying;
    const done = occupying ? play(engine, blitz.state, 1, { kind: "occupy", armies: occupying.min }) : null;
    const events = [...logged(0, blitz.events), ...(done ? logged(1, done.events) : [])];
    const p = receive(startPlayback(view(last), []), view(done?.state ?? blitz.state), events, { scale: 0, viewer: 0 });
    const effects = p.beat?.effects ?? [];
    expect(effects).toContainEqual({ kind: "continent", continent: "australia", seat: 1 });
    expect(effects).toContainEqual({ kind: "fallen", seat: 2, territory: "indonesia" });
    expect(p.board.view.seats[2].eliminated).toBe(true);
  });
});
