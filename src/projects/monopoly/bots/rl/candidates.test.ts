import { describe, expect, it } from "vitest";
import { isLegal } from "../../engine";
import { freshGame } from "../../mocks";
import { driveOp } from "../../pacing";
import type { GameState } from "../../types";
import { applyCandidate, candidateFor, legalCandidates } from "./candidates";
import { DEFAULT_BOT_VERSION } from "../default-bot";

function botGame(seed: string): GameState {
  const base = freshGame(seed, undefined, 4);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, botStrategy: DEFAULT_BOT_VERSION })),
  };
}

describe("legalCandidates", () => {

  it("applyCandidate advances the state", () => {
    const state = botGame("cand-3");
    const step = legalCandidates(state, state.turn.playerId).find(
      (c) => c.op.kind === "step",
    );
    expect(step).toBeDefined();
    const next = applyCandidate(state, step!.op);
    expect(next).not.toBe(state);
  });

  it("only ever returns legal candidates, across a full game", () => {
    let state = botGame("cand-game");
    const phasesSeen = new Set<string>();
    let decisionsSeen = 0;

    for (let i = 0; i < 5000 && state.status === "active"; i++) {
      phasesSeen.add(state.turn.phase);
      // The core guarantee: for EVERY seat, every offered candidate is legal.
      for (const p of state.players) {
        for (const c of legalCandidates(state, p.id)) {
          if (c.op.kind === "intent") {
            expect(isLegal(state, c.op.intent)).toBe(true);
            decisionsSeen++;
          }
        }
      }
      const op = driveOp(state, true, null);
      if (op === null) break;
      state =
        applyCandidate(state, candidateFor(op));
    }

    // Sanity: the walk actually exercised real decision phases, not just rolls.
    expect(decisionsSeen).toBeGreaterThan(0);
    expect(phasesSeen.has("pre-roll")).toBe(true);
    expect(phasesSeen.has("buy-decision")).toBe(true);
  });
});
