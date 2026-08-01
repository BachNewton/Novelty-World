import { describe, expect, it } from "vitest";
import { validateTradeProposal } from "../../../engine";
import { freshGame } from "../../../mocks";
import type { GameState } from "../../../types";
import { ASSET_POSITIONS, MAX_SEATS, NUM_ASSETS } from "./action-space";
import { generateTradeCandidates, TRADE_CAND_DIM } from "./trade-candidates";
import { buildCorpus } from "./corpus.testkit";

// Ported from the training rig's `env-worker.test.ts`
// ("generateTradeCandidates — engine-validated candidate offers"), which is the
// suite that pinned this function while the policy was trained against it. Two
// changes, both to the BOARD SOURCE, none to an assertion:
//   - the rig's sweep drew boards from `randomizeStartState`, its exploring-starts
//     sampler, which is training-rig-only and deliberately not extracted. Real
//     played-out states from `corpus.testkit` stand in — strictly closer to what
//     the shipped bot will meet than a synthetic random carve-up.
//   - the rig's remaining `it`s in that describe drive a `GameEnv` (the training
//     env's candidate head). Those test the rig, not the extracted function, and
//     are left behind.
// ---------------------------------------------------------------------------

const CAND_BASE = 2 * NUM_ASSETS + MAX_SEATS; // first scalar offset

/** Boards for the sweep: every state a real game reached, in place of the rig's
 *  `randomizeStartState` draws. */
const SWEEP: GameState[] = buildCorpus({ seeds: 12, maxSnaps: 400, perPhaseCap: 40 }).map(
  (s) => s.state,
);

/** A hand-built board: me holds 2 of the 3 oranges, the opponent holds the
 *  3rd orange (set-completing for me) plus one light-blue lot. */
function candFixture(): { state: GameState; me: string; opp: string } {
  const state = freshGame("cand-fixture", undefined, 4);
  const me = state.players[0].id;
  const opp = state.players[1].id;
  // orange = [16, 18, 19] ($180/$180/$200); light-blue lot 6 ($100).
  (state as { ownership: Record<number, string> }).ownership = {
    16: me,
    18: me,
    19: opp,
    6: opp,
  };
  return { state, me, opp };
}

describe("generateTradeCandidates — engine-validated candidate offers", () => {
  it("every candidate over the played-board sweep passes validateTradeProposal with a well-formed vector", () => {
    const K = 32;
    let total = 0;
    for (const state of SWEEP) {
      for (const p of state.players) {
        const cands = generateTradeCandidates(state, p.id, K);
        expect(cands.length).toBeLessThanOrEqual(K);
        total += cands.length;
        const keys = new Set<string>();
        for (const c of cands) {
          // The engine's own validator is the arbiter — every candidate passes.
          expect(validateTradeProposal(state, c.terms)).toBeNull();
          expect(c.vec.length).toBe(TRADE_CAND_DIM);
          expect(c.vec.every(Number.isFinite)).toBe(true);
          // Exactly one counterparty seat one-hot, never my own slot 0.
          const seatHot = c.vec.slice(2 * NUM_ASSETS, CAND_BASE);
          expect(seatHot.reduce((a, b) => a + b, 0)).toBe(1);
          expect(seatHot[0]).toBe(0);
          // The give/get multi-hots cover exactly the moved assets.
          const moved =
            Object.keys(c.terms.propertyTo).length + Object.keys(c.terms.gojfTo).length;
          const hot = c.vec.slice(0, 2 * NUM_ASSETS).reduce((a, b) => a + b, 0);
          expect(hot).toBe(moved);
          // Dedup key (counterparty, give-set, get-set, cash) is unique.
          keys.add(
            JSON.stringify([
              seatHot.indexOf(1),
              Object.entries(c.terms.propertyTo).sort(),
              Object.entries(c.terms.gojfTo).sort(),
              c.terms.cashDelta[p.id] ?? 0,
            ]),
          );
        }
        expect(keys.size).toBe(cands.length);
      }
    }
    expect(total).toBeGreaterThan(1000);
  }, 120_000);

  it("is deterministic: two calls on the same state are identical", () => {
    for (const state of SWEEP.slice(0, 40)) {
      const a = generateTradeCandidates(state, state.turn.playerId, 16);
      expect(generateTradeCandidates(state, state.turn.playerId, 16)).toEqual(a);
    }
  });

  it("priority order a > d, dedup against lower tiers, and exact K-truncation", () => {
    const { state, me, opp } = candFixture();
    const p3 = state.players[2].id;
    const p4 = state.players[3].id;
    const cands = generateTradeCandidates(state, me, 64);
    // (a) the set-completing acquisition of lot 19 at {1, 1.5, 2}× $200 leads;
    // (d) then, per opponent in seat order: plain buy of 6 and plain sells of
    // 16/18 to the opp, then sells of 16/18 to each lot-less seat — the 1× buy
    // of 19 is a DUP of (a)'s first candidate and must be deduped away. No
    // (b)/(c)/(e).
    expect(cands).toHaveLength(10);
    expect(cands[0].terms).toEqual({
      propertyTo: { 19: me },
      gojfTo: {},
      cashDelta: { [me]: -200, [opp]: 200 },
    });
    expect(cands[1].terms.cashDelta[me]).toBe(-300);
    expect(cands[2].terms.cashDelta[me]).toBe(-400);
    expect(cands[3].terms).toEqual({
      propertyTo: { 6: me },
      gojfTo: {},
      cashDelta: { [me]: -100, [opp]: 100 },
    });
    expect(cands[4].terms).toEqual({
      propertyTo: { 16: opp },
      gojfTo: {},
      cashDelta: { [opp]: -180, [me]: 180 },
    });
    expect(cands[5].terms).toEqual({
      propertyTo: { 18: opp },
      gojfTo: {},
      cashDelta: { [opp]: -180, [me]: 180 },
    });
    // Seat order continues: the same sells offered to the two lot-less seats.
    expect(cands[6].terms.propertyTo).toEqual({ 16: p3 });
    expect(cands[7].terms.propertyTo).toEqual({ 18: p3 });
    expect(cands[8].terms.propertyTo).toEqual({ 16: p4 });
    expect(cands[9].terms.propertyTo).toEqual({ 18: p4 });
    expect(cands[6].vec[2 * NUM_ASSETS + 2]).toBe(1); // counterparty slot 2
    expect(cands[8].vec[2 * NUM_ASSETS + 3]).toBe(1); // counterparty slot 3
    // Vector layout of the lead candidate: get multi-hot row for lot 19, the
    // counterparty one-hot at seat-relative slot 1, and the 8 contract scalars.
    const row19 = ASSET_POSITIONS.indexOf(19);
    const v = cands[0].vec;
    expect(v[NUM_ASSETS + row19]).toBe(1);
    expect(v.slice(0, NUM_ASSETS).every((x) => x === 0)).toBe(true); // gives nothing
    expect(v[2 * NUM_ASSETS + 1]).toBe(1);
    expect(v[CAND_BASE]).toBeCloseTo(-200 / 1500); // pays $200
    expect(v[CAND_BASE + 1]).toBe(0); // give_count
    expect(v[CAND_BASE + 2]).toBe(1 / 4); // get_count
    expect(v[CAND_BASE + 3]).toBe(0); // give_face_sum
    expect(v[CAND_BASE + 4]).toBeCloseTo(200 / 1500); // get_face_sum
    expect(v[CAND_BASE + 5]).toBe(0.5); // my_sets_delta = +1
    expect(v[CAND_BASE + 6]).toBe(0); // their_sets_delta
    expect(v[CAND_BASE + 7]).toBe(0); // any_mortgaged
    // K-truncation is an exact prefix of the priority-ordered list.
    expect(generateTradeCandidates(state, me, 3)).toEqual(cands.slice(0, 3));
  });

  it("a mortgaged lot stays tradeable and sets the any_mortgaged scalar", () => {
    const { state, me } = candFixture();
    (state as { mortgaged: Record<number, boolean> }).mortgaged = { 19: true };
    const cands = generateTradeCandidates(state, me, 64);
    expect(cands[0].terms.propertyTo).toEqual({ 19: me });
    expect(cands[0].vec[CAND_BASE + 7]).toBe(1);
    expect(validateTradeProposal(state, cands[0].terms)).toBeNull();
  });
});
