import { describe, expect, it } from "vitest";
import { isLegal } from "../../engine";
import { freshGame } from "../../mocks";
import { driveOp } from "../../pacing";
import type { GameState } from "../../types";
import { applyCandidate, legalCandidates } from "./candidates";
import { DEFAULT_BOT_VERSION } from "../roles";

function botGame(seed: string): GameState {
  const base = freshGame(seed, undefined, 4);
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, botStrategy: DEFAULT_BOT_VERSION })),
  };
}

describe("legalCandidates", () => {
  it("offers the active player a roll and proactive arms at pre-roll", () => {
    const state = botGame("cand-1");
    expect(state.turn.phase).toBe("pre-roll");
    const cands = legalCandidates(state, state.turn.playerId);
    const labels = cands.map((c) => c.label);
    expect(cands.some((c) => c.op.kind === "step")).toBe(true);
    expect(labels).toContain("arm manage");
    expect(labels).toContain("arm trade");
  });

  it("returns [] for a seat that owes no decision (the 'not me' case)", () => {
    const state = botGame("cand-2");
    // At the opening pre-roll an off-turn seat can still arm a trade, so pick a
    // genuinely idle case: a finished game offers nobody anything.
    const finished: GameState = { ...state, status: "finished" };
    expect(legalCandidates(finished, state.players[0].id)).toEqual([]);
  });

  it("enumerates legal build commits in managing for an owned monopoly", () => {
    const base = botGame("cand-build");
    const me = base.players[0].id;
    const state: GameState = {
      ...base,
      ownership: { ...base.ownership, 1: me, 3: me }, // the full brown set
      players: base.players.map((p) => (p.id === me ? { ...p, cash: 1500 } : p)),
      turn: {
        playerId: me,
        phase: "managing",
        managerId: me,
        doublesStreak: 0,
        manageStaged: { build: {}, mortgage: {} },
      },
    };
    const cands = legalCandidates(state, me);
    const builds = cands.filter((c) => c.label.startsWith("build "));
    expect(builds.length).toBeGreaterThan(0);
    for (const c of cands) {
      if (c.op.kind === "intent") expect(isLegal(state, c.op.intent)).toBe(true);
    }
  });

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
        op.kind === "step"
          ? applyCandidate(state, { kind: "step" })
          : applyCandidate(state, { kind: "intent", intent: op.intent });
    }

    // Sanity: the walk actually exercised real decision phases, not just rolls.
    expect(decisionsSeen).toBeGreaterThan(0);
    expect(phasesSeen.has("pre-roll")).toBe(true);
    expect(phasesSeen.has("buy-decision")).toBe(true);
  });
});
