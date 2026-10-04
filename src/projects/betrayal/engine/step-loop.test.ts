import { describe, expect, it } from "vitest";
import { CATALOG } from "../data";
import type {
  Action,
  Decision,
  GameState,
  Json,
  RuleRef,
  Step,
} from "../types";
import { randomFor } from "./random";
import { emptyState } from "./state";
import {
  ANSWERS_KEPT,
  apply,
  choices,
  start,
  type Engine,
  type Rules,
} from "./step-loop";

const RULE: RuleRef = { source: "rulebook", page: 6 };

const options = (decision: Decision) =>
  (decision.params as { options: string[] }).options;

/** A toy rule set: just enough to drive the loop. */
const RULES: Rules = {
  steps: {
    ask: (_state, params, ctx) => ctx.decide([0], "pick", params, RULE),
    "ask-all": (_state, _params, ctx) =>
      ctx.decide([0, 1, 2], "vote", null, RULE),
    "wait-all": (_state, _params, ctx) => ctx.waitForReady([0, 1], RULE),
    note: (_state, params, ctx) => ctx.emit("note", RULE, params),
    forever: (_state, _params, ctx) =>
      ctx.push({ kind: "forever", params: null }),
  },
  decisions: {
    pick: {
      candidates: (_state, decision) => options(decision),
      label: (_state, _decision, choice) => `Pick ${String(choice)}`,
      resolve: (_state, decision, ctx) => {
        const choice = decision.answers[0];
        if (choice === "bad") return "bad is never allowed";
        ctx.emit("picked", RULE, { choice, roll: ctx.random.dice(3) });
        return null;
      },
    },
    vote: {
      candidates: () => ["red", "blue"],
      label: (_state, _decision, choice) => String(choice),
      resolve: (_state, decision, ctx) => {
        ctx.emit("votes", RULE, decision.answers as Json);
        return null;
      },
    },
  },
};

const ENGINE: Engine = {
  catalog: CATALOG,
  rules: RULES,
  behaviours: { cards: {}, rooms: {}, tokens: {} },
};

function fresh(): GameState {
  return emptyState("g", "seed-1", ["base"]);
}

const ask = (...opts: string[]): Step => ({
  kind: "ask",
  params: { options: opts },
});
const note = (text: string): Step => ({ kind: "note", params: text });

function pendingDecision(state: GameState): Decision {
  if (state.pending?.type !== "decision")
    throw new Error("No decision pending");
  return state.pending;
}

function applied(state: GameState, action: Action): GameState {
  const result = apply(ENGINE, state, action);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

const pick = (
  state: GameState,
  choice: string,
  seat = 0,
): Extract<Action, { kind: "choose" }> => ({
  kind: "choose",
  decision: pendingDecision(state).id,
  seat,
  choice,
});

describe("the step loop", () => {
  it("runs steps in the order pushed and pauses on a real choice", () => {
    const state = start(ENGINE, fresh(), [
      note("first"),
      ask("a", "b"),
      note("after"),
    ]);
    expect(state.lastEvents.map((e) => e.data)).toEqual(["first"]);
    expect(choices(ENGINE, state, 0)).toEqual([
      { choice: "a", label: "Pick a" },
      { choice: "b", label: "Pick b" },
    ]);
    const next = applied(state, pick(state, "b"));
    expect(next.lastEvents.map((e) => e.type)).toEqual(["picked", "note"]);
    expect(next.pending).toBeNull();
  });

  it("takes a decision with exactly one legal choice itself", () => {
    // "bad" is offered but can't apply, so "ok" is the only legal choice.
    const state = start(ENGINE, fresh(), [ask("bad", "ok"), note("after")]);
    expect(state.pending).toBeNull();
    expect(state.lastEvents.map((e) => e.type)).toEqual([
      "forced",
      "picked",
      "note",
    ]);
  });

  it("lists only choices that apply, and rejects the rest", () => {
    const state = start(ENGINE, fresh(), [ask("a", "bad", "c")]);
    expect(choices(ENGINE, state, 0).map((c) => c.choice)).toEqual(["a", "c"]);
    expect(apply(ENGINE, state, pick(state, "bad"))).toEqual({
      ok: false,
      reason: "bad is never allowed",
    });
    expect(apply(ENGINE, state, pick(state, "z"))).toEqual({
      ok: false,
      reason: "That choice isn't offered",
    });
    expect(apply(ENGINE, state, pick(state, "a", 1)).ok).toBe(false);
    expect(
      apply(ENGINE, state, { ...pick(state, "a"), decision: "d999" }).ok,
    ).toBe(false);
  });

  it("is deterministic: a roll depends only on the seed and the decision it answers", () => {
    const state = start(ENGINE, fresh(), [ask("a", "b")]);
    const once = applied(state, pick(state, "a"));
    const again = applied(state, pick(state, "a"));
    expect(once).toEqual(again);
    const id = pendingDecision(state).id;
    expect(once.lastEvents[0]).toEqual({
      id: `${id}.0:0`,
      type: "picked",
      rule: RULE,
      data: { choice: "a", roll: randomFor("seed-1", id).dice(3) },
    });
  });

  it("leaves the state it was given untouched", () => {
    const state = start(ENGINE, fresh(), [ask("a", "b")]);
    const copy = structuredClone(state);
    applied(state, pick(state, "a"));
    expect(state).toEqual(copy);
  });

  it("numbers decisions from a counter in the state", () => {
    let state = start(ENGINE, fresh(), [ask("a", "b"), ask("a", "b")]);
    expect(pendingDecision(state).id).toBe("d0");
    state = applied(state, pick(state, "a"));
    expect(pendingDecision(state).id).toBe("d1");
  });

  it("keeps a bounded ledger of answers for retries", () => {
    let state = start(
      ENGINE,
      fresh(),
      Array.from({ length: ANSWERS_KEPT + 5 }, () => ask("a", "b")),
    );
    while (state.pending) state = applied(state, pick(state, "a"));
    expect(state.answered).toHaveLength(ANSWERS_KEPT);
    expect(state.answered.at(-1)?.decision).toBe(`d${ANSWERS_KEPT + 4}`);
  });

  it("fails loudly on a loop that never pauses", () => {
    expect(() =>
      start(ENGINE, fresh(), [{ kind: "forever", params: null }]),
    ).toThrow(/without pausing/);
  });

  it("fails loudly on an unregistered step", () => {
    expect(() =>
      start(ENGINE, fresh(), [{ kind: "nonsense", params: null }]),
    ).toThrow(/nonsense/);
  });
});

describe("shared decisions", () => {
  it("records each seat's answer and resolves once all have answered", () => {
    let state = start(ENGINE, fresh(), [{ kind: "ask-all", params: null }]);
    state = applied(state, pick(state, "red", 2));
    expect(pendingDecision(state).answers).toEqual({ 2: "red" });
    expect(state.lastEvents).toEqual([]);
    expect(choices(ENGINE, state, 2)).toEqual([]);
    expect(apply(ENGINE, state, pick(state, "blue", 2))).toEqual({
      ok: false,
      reason: "This seat has already answered",
    });
    state = applied(state, pick(state, "blue", 0));
    state = applied(state, pick(state, "red", 1));
    expect(state.pending).toBeNull();
    expect(state.lastEvents.map((e) => e.data)).toEqual([
      { 0: "blue", 1: "red", 2: "red" },
    ]);
  });
});

describe("ready waits", () => {
  it("pause until every seat confirms, and are never taken by the engine", () => {
    let state = start(ENGINE, fresh(), [
      { kind: "wait-all", params: null },
      note("after"),
    ]);
    expect(state.pending).toMatchObject({ type: "ready", seats: [0, 1] });
    const wait = state.pending?.id ?? "";
    state = applied(state, { kind: "ready", wait, seat: 1 });
    expect(state.pending).toMatchObject({ type: "ready", seats: [0] });
    expect(apply(ENGINE, state, { kind: "ready", wait, seat: 1 }).ok).toBe(
      false,
    );
    state = applied(state, { kind: "ready", wait, seat: 0 });
    expect(state.pending).toBeNull();
    expect(state.lastEvents.map((e) => e.type)).toEqual(["ready", "note"]);
  });

  it("gives each seat's write event ids of its own", () => {
    let state = start(ENGINE, fresh(), [{ kind: "wait-all", params: null }]);
    const wait = state.pending?.id ?? "";
    state = applied(state, { kind: "ready", wait, seat: 1 });
    const first = state.lastEvents;
    state = applied(state, { kind: "ready", wait, seat: 0 });
    const ids = [...first, ...state.lastEvents].map((e) => e.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
