import { describe, expect, it } from "vitest";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import {
  encodeRl,
  gameAge,
  GLOBAL_FEATURES,
  GLOBAL_FEATURES_V2,
  packFeat,
  unpackFeat,
} from "./encode-rl";

// Ported verbatim from the training rig's `env-worker.test.ts` — the one
// describe there that touches nothing but the extracted encoder.

/** `base` with a turn log exactly `n` groups long. The engine appends one group
 *  per turn and never removes one, so this is what a game `n` turns in looks
 *  like to anything reading elapsed length. */
function atTurn(base: GameState, n: number): GameState {
  const seat = base.players[0].id;
  return {
    ...base,
    turns: Array.from({ length: n }, (_, i) => ({
      turn: i + 1,
      playerId: seat,
      events: [],
    })),
  };
}

describe("game-age global feature", () => {
  it("is strictly within [0,1), monotone in the turn count, and bijective", () => {
    const base = freshGame("age-mono", undefined, 4);
    let prev = -1;
    for (const turns of [0, 1, 5, 50, 110, 150, 500, 5000, 100_000]) {
      const v = gameAge(atTurn(base, turns));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBeGreaterThan(prev); // strictly monotone ⇒ invertible in T
      prev = v;
    }
    // Half-saturation lands inside the range real games occupy.
    expect(gameAge(atTurn(base, 150))).toBeCloseTo(0.5, 12);
    expect(gameAge(atTurn(base, 0))).toBe(0);
  });

  it("is the LAST v2 global feature, in both the nested and flat encodings", () => {
    const base = freshGame("age-wire", undefined, 4);
    const seat = base.players[0].id;
    const opts = { obsGlobalV2: true };
    for (const turns of [3, 42, 400]) {
      const state = atTurn(base, turns);
      const obs = encodeRl(state, seat, opts);
      expect(obs.global.length).toBe(GLOBAL_FEATURES_V2);
      expect(obs.global[GLOBAL_FEATURES_V2 - 1]).toBeCloseTo(gameAge(state), 12);
      // Same value survives the packed `feat` blob (float32).
      const back = unpackFeat(
        packFeat(
          {
            global: obs.global,
            players: obs.players,
            assets: obs.assets,
            present: obs.present,
            assetLegal: obs.assetLegal,
            globalMask: obs.globalMask,
            manageMask: obs.manageMask,
          },
          opts,
        ),
        opts,
      );
      expect(back.global[GLOBAL_FEATURES_V2 - 1]).toBe(
        Math.fround(gameAge(state)),
      );
    }
    // OFF (legacy width): the feature belongs to the v2 block only.
    expect(encodeRl(base, seat).global.length).toBe(GLOBAL_FEATURES);
  });
});
