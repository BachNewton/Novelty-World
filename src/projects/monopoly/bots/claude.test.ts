import { describe, expect, it } from "vitest";
import { freshGame } from "../mocks";
import type { GameState } from "../types";
import { claudeBot } from "./claude";
import { dumbBot } from "./dumb";

const base = freshGame();

function withTurn(turn: Partial<GameState["turn"]>): GameState {
  return { ...base, turn: { ...base.turn, ...turn } };
}

// STUB phase: the Claude bot delegates to the dumb baseline, so a "Claude" seat
// plays a complete reactive game while its real strategy is unimplemented. These
// assertions pin the delegation so it's a deliberate change — not a silent
// regression — when the real policy lands and these expectations flip.
describe("claudeBot (stub) — delegates to dumbBot", () => {
  it("matches dumbBot on a buy-decision", () => {
    const state = withTurn({ phase: "buy-decision", pendingBuy: 1 });
    expect(claudeBot(state, "p1")).toEqual(dumbBot(state, "p1"));
    expect(claudeBot(state, "p1")).toEqual({ kind: "buy", playerId: "p1" });
  });

  it("matches dumbBot on a jail decision", () => {
    const state = withTurn({ phase: "jail-decision" });
    expect(claudeBot(state, "p1")).toEqual(dumbBot(state, "p1"));
  });

  it("does not arm a proactive action at pre-roll yet (returns null)", () => {
    expect(claudeBot(withTurn({ phase: "pre-roll" }), "p1")).toBeNull();
  });
});
