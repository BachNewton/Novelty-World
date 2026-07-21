import { describe, expect, it } from "vitest";
import { freshGame } from "../../mocks";
import type { GameState } from "../../types";
import { driveOp } from "../../pacing";
import { DEFAULT_BOT_VERSION } from "../roles";
import { applyCandidate } from "./candidates";
import { ACTION_COUNT, ACTION_NAMES, legalActions, legalMask } from "./actions";

/** A fresh 4-bot game at its opening pre-roll. */
function botGame(seed: string): GameState {
  const base = freshGame(seed, undefined, 4);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, botStrategy: DEFAULT_BOT_VERSION })),
  };
}

/** Drive a real bot-vs-bot game, yielding every visited state. */
function visitStates(seed: string, maxOps: number): GameState[] {
  const seen: GameState[] = [];
  let state = botGame(seed);
  for (let i = 0; i < maxOps && state.status === "active"; i++) {
    seen.push(state);
    const op = driveOp(state, true, null);
    if (op === null) break;
    state = applyCandidate(state, op.kind === "step" ? { kind: "step" } : { kind: "intent", intent: op.intent });
  }
  return seen;
}

describe("atomic action vocabulary", () => {
  it("is a fixed-width vocabulary with unique names", () => {
    expect(ACTION_NAMES.length).toBe(ACTION_COUNT);
    expect(new Set(ACTION_NAMES).size).toBe(ACTION_COUNT);
    expect(ACTION_COUNT).toBeGreaterThan(0);
  });

  it("masks every action to a legal token id, and the mask matches legalActions", () => {
    const state = botGame("act-1");
    for (const p of state.players) {
      const actions = legalActions(state, p.id);
      const mask = legalMask(state, p.id);
      expect(mask.length).toBe(ACTION_COUNT);
      const fromActions = new Set(actions.map((a) => a.token));
      for (let t = 0; t < ACTION_COUNT; t++) {
        expect(mask[t]).toBe(fromActions.has(t));
      }
      for (const a of actions) {
        expect(a.token).toBeGreaterThanOrEqual(0);
        expect(a.token).toBeLessThan(ACTION_COUNT);
        expect(a.label).toBe(ACTION_NAMES[a.token]);
      }
    }
  });

  it("is deterministic", () => {
    const state = botGame("act-2");
    const a = legalActions(state, state.players[0].id).map((x) => x.token);
    const b = legalActions(state, state.players[0].id).map((x) => x.token);
    expect(a).toEqual(b);
  });

  it("the opening pre-roll offers roll + arm trade + arm manage", () => {
    const state = botGame("act-3");
    const labels = legalActions(state, state.turn.playerId).map((a) => a.label);
    expect(labels).toContain("ROLL");
    expect(labels).toContain("ARM_TRADE");
    expect(labels).toContain("ARM_MANAGE");
  });

  it("SOUNDNESS: every unmasked token applies without throwing, across a real game", () => {
    const tokenKinds = new Set<string>();
    for (const state of visitStates("act-game", 250)) {
      // Check the active seat plus any off-turn settler/voter the engine may owe.
      for (const p of state.players) {
        for (const a of legalActions(state, p.id)) {
          // The core guarantee MCTS/policy rely on: a masked-legal op is appliable.
          expect(() => applyCandidate(state, a.op)).not.toThrow();
          tokenKinds.add(a.label.split(":")[0]);
        }
      }
    }
    // The drive should exercise real breadth, not just rolls.
    expect(tokenKinds.has("ROLL")).toBe(true);
    expect(tokenKinds.has("END_TURN")).toBe(true);
    expect([...tokenKinds].some((k) => k === "BUY" || k === "DECLINE")).toBe(true);
  });

  it("CAPABILITY: a trade can be assembled atomically (assign give + take, set cash, propose)", () => {
    const base = botGame("act-trade");
    const me = base.players[0].id;
    const opp = base.players[1].id;
    // Split the brown set: I own sq1, the opponent owns sq3.
    let state: GameState = {
      ...base,
      ownership: { ...base.ownership, 1: me, 3: opp },
    };
    // Arm a trade and drain the boundary into the trade-building intermission.
    state = applyCandidate(state, {
      kind: "intent",
      intent: { kind: "set-queue", playerId: me, queue: "trade", armed: true },
    });
    state = applyCandidate(state, { kind: "step" });
    expect(state.turn.phase).toBe("trade-building");
    expect(state.turn.tradeDraft?.proposerId).toBe(me);

    // I can GIVE my lot (sq1 to an opponent seat) and TAKE the opponent's lot
    // (sq3 to seat 0 = me) — both as atomic tokens.
    const labels0 = legalActions(state, me).map((a) => a.label);
    expect(labels0.some((l) => l.startsWith("ASSIGN:sq1->seat") && !l.endsWith("seat0"))).toBe(true);
    expect(labels0).toContain("ASSIGN:sq3->seat0");

    // Take sq3 to me.
    const take = legalActions(state, me).find((a) => a.label === "ASSIGN:sq3->seat0");
    expect(take).toBeDefined();
    state = applyCandidate(state, take!.op);
    expect(state.turn.tradeDraft?.propertyTo[3]).toBe(me);

    // With a counterparty now established, cash buckets unmask and the draft is
    // proposable.
    const labels1 = legalActions(state, me).map((a) => a.label);
    expect(labels1.some((l) => l.startsWith("CASH:"))).toBe(true);
    expect(labels1).toContain("PROPOSE_TRADE");

    // Sweeten with cash, then the proposal still applies cleanly.
    const cash = legalActions(state, me).find((a) => a.label === "CASH:100");
    expect(cash).toBeDefined();
    state = applyCandidate(state, cash!.op);
    const propose = legalActions(state, me).find((a) => a.label === "PROPOSE_TRADE");
    expect(propose).toBeDefined();
    expect(() => applyCandidate(state, propose!.op)).not.toThrow();
  });
});
