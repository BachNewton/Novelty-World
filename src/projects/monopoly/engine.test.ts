import { describe, expect, it } from "vitest";
import { apply, autoStep, createRng } from "./engine";
import { freshGame } from "./mocks";
import type { GameState, Player } from "./types";

// Resume the seeded RNG and pull the same two dice autoStep would, without
// mutating the state. Lets a test place the active player so the roll lands
// on a chosen square deterministically across seed changes.
function predictRoll(rngState: number): { total: number } {
  const rng = createRng(rngState);
  const d1 = Math.floor(rng.next() * 6) + 1;
  const d2 = Math.floor(rng.next() * 6) + 1;
  return { total: d1 + d2 };
}

function placeActivePlayerAt(state: GameState, position: number): GameState {
  return {
    ...state,
    players: state.players.map((p, i): Player =>
      i === 0 ? { ...p, position } : p,
    ),
  };
}

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng("alpha");
    const b = createRng("alpha");
    const sampleA = [a.next(), a.next(), a.next()];
    const sampleB = [b.next(), b.next(), b.next()];
    expect(sampleA).toEqual(sampleB);
  });

  it("produces different streams for different seeds", () => {
    const a = createRng("alpha");
    const b = createRng("beta");
    expect(a.next()).not.toEqual(b.next());
  });

  it("resumes the same stream from a serialized getState() value", () => {
    const a = createRng("resume");
    const before = [a.next(), a.next()];
    const snapshot = a.getState();
    const expected = [a.next(), a.next(), a.next()];

    const b = createRng(snapshot);
    const actual = [b.next(), b.next(), b.next()];
    expect(actual).toEqual(expected);
    // And the resumed RNG hasn't poisoned what came before.
    expect(before).toHaveLength(2);
  });
});

describe("autoStep", () => {
  it("rolls the dice, leaves pre-roll, and bumps rngState", () => {
    const state = freshGame("test-roll");
    const { state: next, newEvents } = autoStep(state);

    expect(next.turn.phase).not.toBe("pre-roll");
    expect(next.rngState).not.toBe(state.rngState);
    expect(newEvents).toHaveLength(1);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    const [d1, d2] = event.dice;
    expect(d1).toBeGreaterThanOrEqual(1);
    expect(d1).toBeLessThanOrEqual(6);
    expect(d2).toBeGreaterThanOrEqual(1);
    expect(d2).toBeLessThanOrEqual(6);
    expect(event.toPosition).toBe(d1 + d2);
    expect(event.passedGo).toBe(false);

    const player = next.players.find((p) => p.id === next.turn.playerId);
    expect(player?.position).toBe(d1 + d2);

    const lastTurn = next.turns[next.turns.length - 1];
    expect(lastTurn.events).toContainEqual(event);
  });

  it("does not advance while turn.paused is true", () => {
    const state = freshGame("test-paused");
    const paused = { ...state, turn: { ...state.turn, paused: true } };
    const { state: next, newEvents } = autoStep(paused);
    expect(next).toBe(paused);
    expect(newEvents).toHaveLength(0);
  });

  it("is a no-op outside pre-roll", () => {
    const state = freshGame("test-postroll");
    const postRoll = { ...state, turn: { ...state.turn, phase: "post-roll" as const } };
    const { state: next, newEvents } = autoStep(postRoll);
    expect(next).toBe(postRoll);
    expect(newEvents).toHaveLength(0);
  });

  it("flags passedGo when the move wraps the board", () => {
    const state = freshGame("test-wrap");
    const nearGo = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, position: 38 } : p,
      ),
    };
    const { state: next, newEvents } = autoStep(nearGo);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    expect(event.passedGo).toBe(true);
    expect(event.toPosition).toBe((38 + event.dice[0] + event.dice[1]) % 40);
    const moved = next.players.find((p) => p.id === next.turn.playerId);
    expect(moved?.position).toBe(event.toPosition);
  });

  it("credits $200 to the active player when they pass GO", () => {
    const state = freshGame("test-passgo-cash");
    const before = state.players[0].cash;
    const nearGo = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, position: 38 } : p,
      ),
    };
    const { state: next, newEvents } = autoStep(nearGo);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    expect(event.passedGo).toBe(true);
    const moved = next.players.find((p) => p.id === next.turn.playerId);
    expect(moved?.cash).toBe(before + 200);
  });

  it("leaves cash unchanged when the move does not pass GO", () => {
    const state = freshGame("test-no-passgo");
    const before = state.players[0].cash;
    const { state: next, newEvents } = autoStep(state);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    expect(event.passedGo).toBe(false);
    const moved = next.players.find((p) => p.id === next.turn.playerId);
    expect(moved?.cash).toBe(before);
  });

  it("is replayable from a JSON-round-tripped state", () => {
    // The whole point of putting rngState in GameState: a serialized
    // snapshot is sufficient to keep the dice sequence deterministic
    // across reload, device, or host hand-off.
    const start = freshGame("test-replay");
    const live = autoStep(start);
    const reloaded = autoStep(JSON.parse(JSON.stringify(start)));
    expect(reloaded.newEvents).toEqual(live.newEvents);
    expect(reloaded.state.rngState).toBe(live.state.rngState);
  });
});

describe("apply", () => {
  it("advances to the next player and opens a new TurnGroup on end-turn", () => {
    const start = freshGame("test-end-turn");
    // Position the active player so the deterministic first roll lands on
    // Income Tax (pos 4) — a non-ownable square, so autoStep settles at
    // post-roll instead of branching into buy-decision.
    const { total } = predictRoll(start.rngState);
    const positioned = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const rolled = autoStep(positioned).state;
    expect(rolled.turn.phase).toBe("post-roll");

    const ended = apply(rolled, {
      kind: "end-turn",
      playerId: rolled.turn.playerId,
    });
    if (!ended.ok) throw new Error(`expected ok, got ${ended.reason}`);
    expect(ended.state.turn.playerId).toBe("p2");
    expect(ended.state.turn.phase).toBe("pre-roll");
    expect(ended.state.turn.doublesStreak).toBe(0);

    const lastTurn = ended.state.turns[ended.state.turns.length - 1];
    expect(lastTurn).toEqual({ turn: 2, playerId: "p2", events: [] });
  });

  it("rejects an end-turn submitted by the wrong player", () => {
    const start = freshGame("test-wrong-player");
    const rolled = autoStep(start).state;
    const rejected = apply(rolled, { kind: "end-turn", playerId: "p2" });
    expect(rejected.ok).toBe(false);
  });

  it("rejects end-turn outside of post-roll", () => {
    const start = freshGame("test-wrong-phase");
    const rejected = apply(start, {
      kind: "end-turn",
      playerId: start.turn.playerId,
    });
    expect(rejected.ok).toBe(false);
  });

  it("rejects intents that aren't implemented yet", () => {
    const state = freshGame("test-unimpl");
    const result = apply(state, { kind: "build", playerId: "p1", position: 1 });
    expect(result.ok).toBe(false);
  });
});

describe("autoStep buy-decision", () => {
  it("transitions to buy-decision when landing on an unowned property", () => {
    const state = freshGame("test-land-property");
    const { total } = predictRoll(state.rngState);
    const target = 1; // Mediterranean Avenue (unowned property in freshGame)
    const positioned = placeActivePlayerAt(
      state,
      (target - total + 40) % 40,
    );
    const { state: next, newEvents } = autoStep(positioned);
    const event = newEvents[0];
    if (event.kind !== "roll") throw new Error("expected a roll event");
    expect(event.toPosition).toBe(target);
    expect(next.turn.phase).toBe("buy-decision");
    expect(next.turn.pendingBuy).toBe(target);
  });

  it("stays at post-roll when landing on a property someone else owns", () => {
    const state = freshGame("test-land-owned");
    const { total } = predictRoll(state.rngState);
    const target = 1;
    const positioned: GameState = {
      ...placeActivePlayerAt(state, (target - total + 40) % 40),
      ownership: { [target]: "p2" },
    };
    const { state: next } = autoStep(positioned);
    expect(next.turn.phase).toBe("post-roll");
    expect(next.turn.pendingBuy).toBeUndefined();
  });

  it("stays at post-roll when landing on a non-ownable space", () => {
    const state = freshGame("test-land-tax");
    const { total } = predictRoll(state.rngState);
    const target = 4; // Income Tax
    const positioned = placeActivePlayerAt(
      state,
      (target - total + 40) % 40,
    );
    const { state: next } = autoStep(positioned);
    expect(next.turn.phase).toBe("post-roll");
    expect(next.turn.pendingBuy).toBeUndefined();
  });
});

describe("apply buy", () => {
  it("deducts cash, assigns ownership, emits a buy event, and advances to post-roll", () => {
    const state = freshGame("test-buy-apply");
    const playerId = state.turn.playerId;
    const position = 1; // Mediterranean Avenue, price 60
    const ready: GameState = {
      ...state,
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: position },
    };
    const before = ready.players[0].cash;
    const result = apply(ready, { kind: "buy", playerId });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.turn.phase).toBe("post-roll");
    expect(result.state.turn.pendingBuy).toBeUndefined();
    expect(result.state.ownership[position]).toBe(playerId);
    const buyer = result.state.players.find((p) => p.id === playerId);
    expect(buyer?.cash).toBe(before - 60);
    expect(result.newEvents).toEqual([{ kind: "buy", position, price: 60 }]);
    const lastTurn = result.state.turns[result.state.turns.length - 1];
    expect(lastTurn.events).toContainEqual({
      kind: "buy",
      position,
      price: 60,
    });
  });

  it("rejects when not in buy-decision phase", () => {
    const state = freshGame("test-buy-wrong-phase");
    const result = apply(state, {
      kind: "buy",
      playerId: state.turn.playerId,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when submitted by a non-active player", () => {
    const state = freshGame("test-buy-wrong-player");
    const ready: GameState = {
      ...state,
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: 1 },
    };
    const result = apply(ready, { kind: "buy", playerId: "p2" });
    expect(result.ok).toBe(false);
  });

  it("rejects when the active player cannot afford the price", () => {
    const state = freshGame("test-buy-broke");
    const playerId = state.turn.playerId;
    const broke: GameState = {
      ...state,
      players: state.players.map((p, i): Player =>
        i === 0 ? { ...p, cash: 10 } : p,
      ),
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: 1 },
    };
    const result = apply(broke, { kind: "buy", playerId });
    expect(result.ok).toBe(false);
  });
});

describe("apply decline-buy", () => {
  it("clears pendingBuy and advances to post-roll without emitting events", () => {
    const state = freshGame("test-decline");
    const playerId = state.turn.playerId;
    const ready: GameState = {
      ...state,
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: 1 },
    };
    const result = apply(ready, { kind: "decline-buy", playerId });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.turn.phase).toBe("post-roll");
    expect(result.state.turn.pendingBuy).toBeUndefined();
    expect(result.state.ownership[1]).toBeUndefined();
    expect(result.newEvents).toEqual([]);
  });

  it("rejects when not in buy-decision phase", () => {
    const state = freshGame("test-decline-wrong-phase");
    const result = apply(state, {
      kind: "decline-buy",
      playerId: state.turn.playerId,
    });
    expect(result.ok).toBe(false);
  });
});

describe("apply set-armed-pause", () => {
  it("arms a pause for any player (need not be the active player)", () => {
    const state = freshGame("test-arm-other");
    expect(state.turn.playerId).toBe("p1");
    const result = apply(state, {
      kind: "set-armed-pause",
      playerId: "p3",
      when: "before-roll",
      armed: true,
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.armedPauses.p3.beforeRoll).toBe(true);
    expect(result.state.armedPauses.p3.beforeEnd).toBe(false);
    // No side effects on other players.
    expect(result.state.armedPauses.p1.beforeRoll).toBe(false);
  });

  it("disarms when armed=false", () => {
    const armed: GameState = {
      ...freshGame("test-disarm"),
    };
    const armedState: GameState = {
      ...armed,
      armedPauses: {
        ...armed.armedPauses,
        p1: { beforeRoll: true, beforeEnd: false },
      },
    };
    const result = apply(armedState, {
      kind: "set-armed-pause",
      playerId: "p1",
      when: "before-roll",
      armed: false,
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.armedPauses.p1.beforeRoll).toBe(false);
  });

  it("is a no-op when the requested value matches the current flag", () => {
    const state = freshGame("test-arm-noop");
    const result = apply(state, {
      kind: "set-armed-pause",
      playerId: "p1",
      when: "before-end",
      armed: false,
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    // Object identity preserved on no-op — keeps the host's persistence
    // diff clean instead of churning the row.
    expect(result.state).toBe(state);
  });

  it("rejects unknown players", () => {
    const state = freshGame("test-arm-unknown");
    const result = apply(state, {
      kind: "set-armed-pause",
      playerId: "nope",
      when: "before-roll",
      armed: true,
    });
    expect(result.ok).toBe(false);
  });
});

describe("armed pause consumption", () => {
  it("fires beforeRoll at end-turn entry, pauses the new turn, and clears the flag", () => {
    const start = freshGame("test-consume-pre");
    // Position p1 so the first roll deterministically lands on Income Tax —
    // non-ownable → autoStep settles at post-roll so we can issue end-turn.
    const { total } = predictRoll(start.rngState);
    const placed = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const rolled = autoStep(placed).state;
    expect(rolled.turn.phase).toBe("post-roll");

    // p2 has armed a pre-roll pause before their next turn.
    const armed: GameState = {
      ...rolled,
      armedPauses: {
        ...rolled.armedPauses,
        p2: { beforeRoll: true, beforeEnd: false },
      },
    };
    const ended = apply(armed, { kind: "end-turn", playerId: "p1" });
    if (!ended.ok) throw new Error(`expected ok, got ${ended.reason}`);
    expect(ended.state.turn.playerId).toBe("p2");
    expect(ended.state.turn.phase).toBe("pre-roll");
    expect(ended.state.turn.paused).toBe(true);
    expect(ended.state.armedPauses.p2.beforeRoll).toBe(false);
  });

  it("leaves the new turn unpaused when no beforeRoll is armed", () => {
    const start = freshGame("test-no-pre");
    const { total } = predictRoll(start.rngState);
    const placed = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const rolled = autoStep(placed).state;
    const ended = apply(rolled, { kind: "end-turn", playerId: "p1" });
    if (!ended.ok) throw new Error(`expected ok, got ${ended.reason}`);
    expect(ended.state.turn.paused).toBe(false);
  });

  it("fires beforeEnd when autoStep settles into post-roll on a non-buy landing", () => {
    const start = freshGame("test-consume-end-autostep");
    const { total } = predictRoll(start.rngState);
    // Land on Income Tax: non-ownable, so autoStep goes to post-roll.
    const placed = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const armed: GameState = {
      ...placed,
      armedPauses: {
        ...placed.armedPauses,
        p1: { beforeRoll: false, beforeEnd: true },
      },
    };
    const { state: next } = autoStep(armed);
    expect(next.turn.phase).toBe("post-roll");
    expect(next.turn.paused).toBe(true);
    expect(next.armedPauses.p1.beforeEnd).toBe(false);
  });

  it("does NOT fire beforeEnd at the buy-decision branch — only at post-roll", () => {
    const start = freshGame("test-consume-end-buy-defer");
    const { total } = predictRoll(start.rngState);
    // Land on Mediterranean Avenue (unowned property) → buy-decision.
    const placed = placeActivePlayerAt(start, (1 - total + 40) % 40);
    const armed: GameState = {
      ...placed,
      armedPauses: {
        ...placed.armedPauses,
        p1: { beforeRoll: false, beforeEnd: true },
      },
    };
    const { state: next } = autoStep(armed);
    expect(next.turn.phase).toBe("buy-decision");
    expect(next.turn.paused).toBe(false);
    // Flag survives — it gets consumed when buy / decline-buy transitions
    // into post-roll, not when the buy-decision phase is entered.
    expect(next.armedPauses.p1.beforeEnd).toBe(true);
  });

  it("fires beforeEnd when applyBuy transitions through to post-roll", () => {
    const state = freshGame("test-consume-end-buy");
    const playerId = state.turn.playerId;
    const ready: GameState = {
      ...state,
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: 1 },
      armedPauses: {
        ...state.armedPauses,
        [playerId]: { beforeRoll: false, beforeEnd: true },
      },
    };
    const result = apply(ready, { kind: "buy", playerId });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.turn.phase).toBe("post-roll");
    expect(result.state.turn.paused).toBe(true);
    expect(result.state.armedPauses[playerId].beforeEnd).toBe(false);
  });

  it("fires beforeEnd when applyDeclineBuy transitions to post-roll", () => {
    const state = freshGame("test-consume-end-decline");
    const playerId = state.turn.playerId;
    const ready: GameState = {
      ...state,
      turn: { ...state.turn, phase: "buy-decision", pendingBuy: 1 },
      armedPauses: {
        ...state.armedPauses,
        [playerId]: { beforeRoll: false, beforeEnd: true },
      },
    };
    const result = apply(ready, { kind: "decline-buy", playerId });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.turn.phase).toBe("post-roll");
    expect(result.state.turn.paused).toBe(true);
    expect(result.state.armedPauses[playerId].beforeEnd).toBe(false);
  });
});

describe("apply resume", () => {
  it("unpauses an active turn", () => {
    const state = freshGame("test-resume");
    const paused: GameState = {
      ...state,
      turn: { ...state.turn, paused: true },
    };
    const result = apply(paused, {
      kind: "resume",
      playerId: state.turn.playerId,
    });
    if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
    expect(result.state.turn.paused).toBe(false);
    expect(result.newEvents).toEqual([]);
  });

  it("rejects when the turn is not paused", () => {
    const state = freshGame("test-resume-not-paused");
    const result = apply(state, {
      kind: "resume",
      playerId: state.turn.playerId,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when submitted by a non-active player", () => {
    const state = freshGame("test-resume-wrong-player");
    const paused: GameState = {
      ...state,
      turn: { ...state.turn, paused: true },
    };
    const result = apply(paused, { kind: "resume", playerId: "p2" });
    expect(result.ok).toBe(false);
  });
});
