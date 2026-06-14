import { describe, expect, it } from "vitest";
import { freshGame } from "./mocks";
import {
  DEFAULT_TURN_MS,
  driveOp,
  ingestSnapshot,
  paceTransition,
  type Snapshot,
} from "./pacing";
import type { GameState, Player } from "./types";

// freshGame seats p1 as the human and p2..p4 as bots, p1 active at pre-roll.
const base = freshGame();

function withTurn(state: GameState, patch: Partial<GameState["turn"]>): GameState {
  return { ...state, turn: { ...state.turn, ...patch } };
}

function mapPlayer(
  state: GameState,
  id: string,
  patch: Partial<Player>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

describe("driveOp — drive gating", () => {
  it("never drives while the playback head lags the authoritative head", () => {
    // Even on a turn this client would otherwise drive, a non-caught-up head
    // means snapshots are still queued ahead — animate them first.
    expect(driveOp(base, false, "p1")).toBeNull();
  });

  it("steps the local human's own pre-roll once caught up", () => {
    expect(driveOp(base, true, "p1")).toEqual({ kind: "step" });
  });

  it("proxies a bot seat's mechanical beat once caught up", () => {
    const botTurn = withTurn(base, { playerId: "p2" });
    expect(driveOp(botTurn, true, "p1")).toEqual({ kind: "step" });
  });

  it("ends the active player's own post-roll turn", () => {
    const postRoll = withTurn(base, { phase: "post-roll" });
    expect(driveOp(postRoll, true, "p1")).toEqual({
      kind: "intent",
      intent: { kind: "end-turn", playerId: "p1" },
    });
  });
});

describe("driveOp — human-turn sync barrier", () => {
  // Model a second connected human (p2) and view from p1's client.
  const otherHumanActive = withTurn(mapPlayer(base, "p2", { isBot: false }), {
    playerId: "p2",
  });

  it("does not drive another connected human's turn, even when caught up", () => {
    // This is the barrier: p1's client can only PLAY snapshots for p2's turn,
    // never drive it — so the row cannot advance past p2 until p2's own client
    // does, and every client reconverges there.
    expect(driveOp(otherHumanActive, true, "p1")).toBeNull();
  });

  it("is also null when not caught up (both gates hold)", () => {
    expect(driveOp(otherHumanActive, false, "p1")).toBeNull();
  });

  it("is idle for a finished game and a non-driveable intermission phase", () => {
    expect(driveOp({ ...base, status: "finished" }, true, "p1")).toBeNull();
    // A managing intermission isn't a mechanical beat — nobody drives it.
    expect(driveOp(withTurn(base, { phase: "managing", managerId: "p2" }), true, "p1")).toBeNull();
  });
});

describe("driveOp — jail decision", () => {
  it("proxies a bot's jail pay when it can afford the fine", () => {
    const botJail = withTurn(base, { playerId: "p2", phase: "jail-decision" });
    expect(driveOp(botJail, true, "p1")).toEqual({
      kind: "intent",
      intent: { kind: "pay-to-leave-jail", playerId: "p2" },
    });
  });

  it("steps a bot's jail roll when it can neither pay nor use a card", () => {
    const botJail = mapPlayer(
      withTurn(base, { playerId: "p2", phase: "jail-decision" }),
      "p2",
      { cash: 0 },
    );
    expect(driveOp(botJail, true, "p1")).toEqual({ kind: "step" });
  });

  it("leaves the local human's own jail decision to their UI", () => {
    const myJail = withTurn(base, { phase: "jail-decision" });
    expect(driveOp(myJail, true, "p1")).toBeNull();
  });

  it("does not drive another connected human's jail decision", () => {
    const otherJail = withTurn(mapPlayer(base, "p2", { isBot: false }), {
      playerId: "p2",
      phase: "jail-decision",
    });
    expect(driveOp(otherJail, true, "p1")).toBeNull();
  });
});

describe("paceTransition", () => {
  it("reads a handoff to a new active player as a glide", () => {
    const from = base;
    const to = withTurn(base, { playerId: "p2" });
    const pace = paceTransition(from, to, DEFAULT_TURN_MS);
    expect(pace.phase).toBe("glide");
    expect(pace.durationMs).toBe(Math.round(DEFAULT_TURN_MS * 0.35));
  });

  it("reads the active player moving as a slide", () => {
    const from = base;
    const to = mapPlayer(base, "p1", { position: 6 });
    const pace = paceTransition(from, to, DEFAULT_TURN_MS);
    expect(pace.phase).toBe("slide");
    expect(pace.durationMs).toBe(Math.round(DEFAULT_TURN_MS * 0.65));
  });

  it("reads a non-visual commit (buy, mortgage) as a free settle", () => {
    const from = withTurn(base, { phase: "buy-decision", pendingBuy: 1 });
    const to = withTurn(base, { phase: "post-roll" });
    const pace = paceTransition(from, to, DEFAULT_TURN_MS);
    expect(pace.phase).toBe("settle");
    expect(pace.durationMs).toBe(0);
  });

  it("budgets a plain turn (one glide + one slide) to ~TURN_MS", () => {
    const handoff = paceTransition(base, withTurn(base, { playerId: "p2" }), DEFAULT_TURN_MS);
    const move = paceTransition(base, mapPlayer(base, "p1", { position: 6 }), DEFAULT_TURN_MS);
    expect(handoff.durationMs + move.durationMs).toBe(DEFAULT_TURN_MS);
  });
});

describe("ingestSnapshot", () => {
  const snap = (version: number): Snapshot => ({ version, state: base });

  it("appends a newer snapshot in version order", () => {
    const buffer = ingestSnapshot([], 5, snap(6));
    expect(buffer.map((s) => s.version)).toEqual([6]);
    const buffer2 = ingestSnapshot(buffer, 5, snap(8));
    const buffer3 = ingestSnapshot(buffer2, 5, snap(7));
    expect(buffer3.map((s) => s.version)).toEqual([6, 7, 8]);
  });

  it("drops a snapshot at or behind the playback head", () => {
    const buffer = [snap(7)];
    expect(ingestSnapshot(buffer, 6, snap(6))).toBe(buffer);
    expect(ingestSnapshot(buffer, 6, snap(5))).toBe(buffer);
  });

  it("dedups a version already buffered (route response + Realtime echo)", () => {
    const buffer = ingestSnapshot([], 5, snap(6));
    expect(ingestSnapshot(buffer, 5, snap(6))).toBe(buffer);
  });

  it("tolerates a gap — a missing version still buffers", () => {
    const buffer = ingestSnapshot([snap(6)], 5, snap(9));
    expect(buffer.map((s) => s.version)).toEqual([6, 9]);
  });
});
