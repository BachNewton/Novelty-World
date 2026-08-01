import { describe, expect, it } from "vitest";
import { netWorth } from "../../../engine";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import {
  encodeRl,
  featLayout,
  obsSpec,
  packFeat,
  PLAYER_FEATURES,
  playerWidth,
  unpackFeat,
} from "./encode-rl";

function withCash(state: GameState, seatId: string, cash: number): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === seatId ? { ...p, cash } : p)),
  };
}

/** A 4-player game with distinct cash → distinct net worths (no assets ⇒ nw==cash). */
function distinctGame(): GameState {
  let g = freshGame("nw-share", undefined, 4);
  const cash = [1000, 2000, 3000, 4000];
  g.players.forEach((p, i) => {
    g = withCash(g, p.id, cash[i]);
  });
  return g;
}

describe("obs-nw-share — relative net-worth share per-player feature", () => {
  it("OFF: player width and float layout are byte-identical to legacy", () => {
    expect(obsSpec().player).toBe(PLAYER_FEATURES);
    expect(obsSpec().player).toBe(5);
    expect(playerWidth()).toBe(5);
    // OFF player rows carry exactly the legacy 5 features.
    const g = distinctGame();
    const obs = encodeRl(g, g.players[0].id);
    for (const row of obs.players) expect(row).toHaveLength(5);
  });

  it("ON: per-player width increments by exactly 1 and layout follows", () => {
    const on = { obsNwShare: true };
    expect(playerWidth(on)).toBe(PLAYER_FEATURES + 1);
    expect(obsSpec(on).player).toBe(6);
    // The float section grows by exactly max_seats floats (one per player row).
    const grew = featLayout(on).float_count - featLayout().float_count;
    expect(grew).toBe(obsSpec().max_seats);
    // byte_length grows by 4·max_seats (float section only).
    expect(featLayout(on).byte_length - featLayout().byte_length).toBe(
      4 * obsSpec().max_seats,
    );
  });

  it("share feature == max(nw,0)/Σ max(nw,0) for present seats, summing to 1", () => {
    const g = distinctGame();
    const seat = g.players[0].id;
    const obs = encodeRl(g, seat, { obsNwShare: true });
    const denom = g.players.reduce(
      (s, p) => s + (p.bankrupt ? 0 : Math.max(netWorth(g, p.id), 0)),
      0,
    );
    expect(denom).toBeGreaterThan(0);
    const MONEY_SCALE = 1000; // mirrors encode-rl (net worth is stored nw/MONEY_SCALE)
    let shareSum = 0;
    for (const row of obs.players) {
      expect(row).toHaveLength(6);
      if (row[0] === 1) {
        // present seat: row[2] == nw/MONEY_SCALE ⇒ share == max(nw,0)/denom.
        const nw = row[2] * MONEY_SCALE;
        expect(row[5]).toBeCloseTo(Math.max(nw, 0) / denom, 9);
        shareSum += row[5];
      } else {
        // absent slot: share column is 0.
        expect(row[5]).toBe(0);
      }
    }
    expect(shareSum).toBeCloseTo(1, 9);
  });

  it("degenerate all-zero net worth ⇒ share 0 (finite, no NaN)", () => {
    let g = freshGame("nw-share-zero", undefined, 4);
    for (const p of g.players) g = withCash(g, p.id, 0); // no assets ⇒ nw 0 for all
    const obs = encodeRl(g, g.players[0].id, { obsNwShare: true });
    for (const row of obs.players) {
      expect(Number.isFinite(row[5])).toBe(true);
      expect(row[5]).toBe(0);
    }
  });

  it("packFeat/unpackFeat round-trips the 6-wide player rows", () => {
    const g = distinctGame();
    const opts = { obsNwShare: true };
    const obs = encodeRl(g, g.players[0].id, opts);
    const blob = packFeat(obs, opts);
    expect(blob.length).toBe(featLayout(opts).byte_length);
    const back = unpackFeat(blob, opts);
    expect(back.players).toHaveLength(obsSpec(opts).max_seats);
    for (let i = 0; i < obs.players.length; i++) {
      for (let j = 0; j < 6; j++) {
        expect(back.players[i][j]).toBeCloseTo(obs.players[i][j], 6);
      }
    }
  });
});
