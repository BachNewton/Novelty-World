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

// Roll the seeded RNG, then position the active player so the eventual
// landing square is `target`. Use after-move expectations are checked
// against `target`, not the predicted dice — the predicted total is just
// the placement math.
function setupLandingOn(
  state: GameState,
  target: number,
): { state: GameState; diceTotal: number } {
  const { total } = predictRoll(state.rngState);
  const startPos = (target - total + 40) % 40;
  return { state: placeActivePlayerAt(state, startPos), diceTotal: total };
}

function setCash(state: GameState, playerId: string, cash: number): GameState {
  return {
    ...state,
    players: state.players.map((p): Player =>
      p.id === playerId ? { ...p, cash } : p,
    ),
  };
}

function withOwnership(
  state: GameState,
  ownership: Record<number, string>,
): GameState {
  return { ...state, ownership: { ...state.ownership, ...ownership } };
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
    const state = freshGame("test-land-tax-b");
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

describe("autoStep doubles", () => {
  it("grants the active player another roll on doubles, keeping the streak", () => {
    const start = freshGame("test-doubles-roll"); // rolls [4,4]
    const { total } = predictRoll(start.rngState);
    // Land on Income Tax (4): non-ownable, so the roll resolves past landing.
    const placed = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const { state: next, newEvents } = autoStep(placed);

    const roll = newEvents[0];
    if (roll.kind !== "roll") throw new Error("expected a roll event");
    expect(roll.dice[0]).toBe(roll.dice[1]);
    expect(roll.doublesStreak).toBe(1);
    // Same player rolls again — back to pre-roll, streak kept, no handoff.
    expect(next.turn.playerId).toBe("p1");
    expect(next.turn.phase).toBe("pre-roll");
    expect(next.turn.doublesStreak).toBe(1);
    expect(next.turns).toHaveLength(1);
  });

  it("does not grant a fourth roll after the third consecutive double", () => {
    const start = freshGame("test-doubles-roll"); // rolls [4,4]
    const { total } = predictRoll(start.rngState);
    const placed: GameState = {
      ...placeActivePlayerAt(start, (4 - total + 40) % 40),
      turn: { ...start.turn, doublesStreak: 2 },
    };
    const { state: next } = autoStep(placed);

    // Third double: no bonus roll. Jail is deferred, so it settles at
    // post-roll and the turn ends through the normal end-turn path.
    expect(next.turn.phase).toBe("post-roll");
    expect(next.turn.playerId).toBe("p1");
    expect(next.turn.doublesStreak).toBe(3);

    const ended = apply(next, { kind: "end-turn", playerId: "p1" });
    if (!ended.ok) throw new Error(`expected ok, got ${ended.reason}`);
    expect(ended.state.turn.playerId).toBe("p2");
    expect(ended.state.turn.doublesStreak).toBe(0);
  });

  it("settles into post-roll and resets the streak on a non-double", () => {
    const start = freshGame("test-rent-basic"); // rolls [4,6]
    const { total } = predictRoll(start.rngState);
    const placed = placeActivePlayerAt(start, (4 - total + 40) % 40);
    const { state: next, newEvents } = autoStep(placed);

    const roll = newEvents[0];
    if (roll.kind !== "roll") throw new Error("expected a roll event");
    expect(roll.dice[0]).not.toBe(roll.dice[1]);
    expect(roll.doublesStreak).toBe(0);
    expect(next.turn.phase).toBe("post-roll");
    expect(next.turn.doublesStreak).toBe(0);
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

// All rent tests target squares at position ≥ 12 so the active player
// (starting at position 0) never wraps the board on the first roll —
// avoids pass-GO bonuses muddying the cash assertions.

describe("autoStep rent", () => {
  it("transfers cash from lander to owner and emits a rent event", () => {
    const start = freshGame("test-rent-basic");
    const { state: placed } = setupLandingOn(start, 13); // States Avenue
    // p2 owns States Avenue only — no monopoly, no houses → base rent $10.
    const state = withOwnership(placed, { 13: "p2" });

    const { state: next, newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent).toEqual({
      kind: "rent",
      ownerId: "p2",
      position: 13,
      amount: 10,
    });

    const payer = next.players.find((p) => p.id === "p1");
    const recipient = next.players.find((p) => p.id === "p2");
    expect(payer?.cash).toBe(1500 - 10);
    expect(recipient?.cash).toBe(1500 + 10);
    expect(next.turn.phase).toBe("post-roll");
  });

  it("doubles base rent when the owner holds the full color set", () => {
    const start = freshGame("test-rent-monopoly");
    const { state: placed } = setupLandingOn(start, 13); // States Avenue
    // p2 holds all three pinks (11 + 13 + 14), no houses → base $10 × 2 = $20.
    const state = withOwnership(placed, { 11: "p2", 13: "p2", 14: "p2" });

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(20);
  });

  it("uses the houses ladder when the owner has built", () => {
    const start = freshGame("test-rent-houses");
    const { state: placed } = setupLandingOn(start, 13); // States Avenue
    // p2 holds States Avenue with 3 houses → ladder index 2 = $450.
    const state: GameState = {
      ...withOwnership(placed, { 13: "p2" }),
      houses: { 13: 3 },
    };

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(450);
  });

  it("uses the railroad ladder based on how many the owner holds", () => {
    const start = freshGame("test-rent-railroad");
    const { state: placed } = setupLandingOn(start, 15); // Pennsylvania Railroad
    // p2 holds 3 of the 4 railroads → $100.
    const state = withOwnership(placed, { 5: "p2", 15: "p2", 25: "p2" });

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(100);
  });

  it("uses the utility 4× multiplier with a single utility owned", () => {
    const start = freshGame("test-rent-utility-4x");
    const { state: placed, diceTotal } = setupLandingOn(start, 12); // Electric Co.
    const state = withOwnership(placed, { 12: "p2" });

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(diceTotal * 4);
  });

  it("uses the utility 10× multiplier when the owner holds both", () => {
    const start = freshGame("test-rent-utility-10x");
    const { state: placed, diceTotal } = setupLandingOn(start, 12); // Electric Co.
    const state = withOwnership(placed, { 12: "p2", 28: "p2" });

    const { newEvents } = autoStep(state);
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(diceTotal * 10);
  });

  it("collects no rent when the property is mortgaged", () => {
    const start = freshGame("test-rent-mortgaged");
    const { state: placed } = setupLandingOn(start, 13);
    const state: GameState = {
      ...withOwnership(placed, { 13: "p2" }),
      mortgaged: { 13: true },
    };
    const cashBefore = state.players[0].cash;

    const { state: next, newEvents } = autoStep(state);
    expect(newEvents.find((e) => e.kind === "rent")).toBeUndefined();
    const payer = next.players.find((p) => p.id === "p1");
    expect(payer?.cash).toBe(cashBefore);
    expect(next.turn.phase).toBe("post-roll");
  });

  it("collects no rent when the lander owns the square themselves", () => {
    const start = freshGame("test-rent-self");
    const { state: placed } = setupLandingOn(start, 13);
    const state = withOwnership(placed, { 13: "p1" });
    const cashBefore = state.players[0].cash;

    const { state: next, newEvents } = autoStep(state);
    expect(newEvents.find((e) => e.kind === "rent")).toBeUndefined();
    expect(next.players.find((p) => p.id === "p1")?.cash).toBe(cashBefore);
    expect(next.turn.phase).toBe("post-roll");
  });
});

describe("bankruptcy", () => {
  it("zeros the payer's cash, transfers properties + GOJF to the creditor, and emits a bankrupt event", () => {
    const start = freshGame("test-bust-transfer");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    // p2 owns Boardwalk with a hotel: hotel rent $2000. p1 can't pay.
    let state: GameState = {
      ...withOwnership(placed, { 39: "p2", 37: "p2", 5: "p1", 12: "p1" }),
      houses: { 39: 5 },
      jailFreeCards: { chance: "p1" },
    };
    state = setCash(state, "p1", 100);

    const { state: next, newEvents } = autoStep(state);

    const bustEvent = newEvents.find((e) => e.kind === "bankrupt");
    if (!bustEvent) throw new Error("expected a bankrupt event");
    expect(bustEvent.creditorId).toBe("p2");

    // p1's cash hits zero (the $100 they had got transferred to p2).
    const payer = next.players.find((p) => p.id === "p1");
    expect(payer?.cash).toBe(0);
    expect(payer?.bankrupt).toBe(true);

    // Reading Railroad and Electric Company belong to p2 now.
    expect(next.ownership[5]).toBe("p2");
    expect(next.ownership[12]).toBe("p2");
    // p2's pre-bust holdings stay theirs.
    expect(next.ownership[39]).toBe("p2");
    expect(next.ownership[37]).toBe("p2");

    // Chance GOJF moved from p1 to p2.
    expect(next.jailFreeCards.chance).toBe("p2");

    // p2 received p1's $100 via rent.
    const creditor = next.players.find((p) => p.id === "p2");
    expect(creditor?.cash).toBe(1500 + 100);

    // The rent event in the log still reflects the FULL debt, not the
    // partial transfer — readers see what was owed, then the bust.
    const rentEvent = newEvents.find((e) => e.kind === "rent");
    if (!rentEvent) throw new Error("expected a rent event");
    expect(rentEvent.amount).toBe(2000);
  });

  it("advances control to the next non-bankrupt player when the active player busts", () => {
    const start = freshGame("test-bust-advance");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    let state: GameState = {
      ...withOwnership(placed, { 39: "p2" }),
      houses: { 39: 5 },
    };
    state = setCash(state, "p1", 50);

    const { state: next } = autoStep(state);
    expect(next.turn.playerId).toBe("p2");
    expect(next.turn.phase).toBe("pre-roll");
    // A new TurnGroup was opened for p2.
    const last = next.turns[next.turns.length - 1];
    expect(last.playerId).toBe("p2");
    expect(last.events).toEqual([]);
  });

  it("emits a winner event and parks at game-over when only one survivor remains", () => {
    const start = freshGame("test-winner");
    const { state: placed } = setupLandingOn(start, 39); // Boardwalk
    // Two players are already bankrupt; p1's rent bust to p2 leaves p2
    // alone on the board.
    let state: GameState = {
      ...placed,
      players: placed.players.map((p): Player =>
        p.id === "p3" || p.id === "p4" ? { ...p, bankrupt: true, cash: 0 } : p,
      ),
    };
    state = withOwnership(state, { 39: "p2" });
    state = { ...state, houses: { 39: 5 } };
    state = setCash(state, "p1", 25);

    const { state: next, newEvents } = autoStep(state);
    const winnerEvent = newEvents.find((e) => e.kind === "winner");
    if (!winnerEvent) throw new Error("expected a winner event");
    expect(winnerEvent.winnerId).toBe("p2");
    expect(next.turn.phase).toBe("game-over");
  });
});

describe("end-turn skips bankrupt players", () => {
  it("advances past a bankrupt player in the rotation", () => {
    const start = freshGame("test-end-skip-bankrupt-b");
    // p1 is rolling. Position them on Income Tax so autoStep stops at
    // post-roll without triggering any rent path.
    const { state: placed } = setupLandingOn(start, 4); // Income Tax
    const state: GameState = {
      ...placed,
      players: placed.players.map((p): Player =>
        p.id === "p2" ? { ...p, bankrupt: true, cash: 0 } : p,
      ),
    };
    const rolled = autoStep(state).state;
    expect(rolled.turn.phase).toBe("post-roll");

    const ended = apply(rolled, { kind: "end-turn", playerId: "p1" });
    if (!ended.ok) throw new Error(`expected ok, got ${ended.reason}`);
    // p2 is bankrupt — control goes to p3 instead.
    expect(ended.state.turn.playerId).toBe("p3");
  });
});
