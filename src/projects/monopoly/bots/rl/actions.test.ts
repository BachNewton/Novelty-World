import { describe, expect, it } from "vitest";
import { freshGame } from "../../mocks";
import type { GameState } from "../../types";
import { driveOp } from "../../pacing";
import { DEFAULT_BOT_VERSION } from "../default-bot";
import { applyCandidate, candidateFor } from "./candidates";
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
    state = applyCandidate(state, candidateFor(op));
  }
  return seen;
}

describe("atomic action vocabulary", () => {

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
});
