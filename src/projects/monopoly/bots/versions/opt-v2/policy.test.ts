import { describe, expect, it } from "vitest";
import { simulateGame, type Contender } from "../../eval/simulate";
import { claudeV38Bot } from "../claude-v38";
import { DEFAULT_PARAMS, makeParamBot } from "./bot";
import { OPT_V2_PARAMS, optV2Bot } from "./index";

// opt-v2 fidelity — three guarantees that together prove the FIELDED bot is the
// bot the Evolutionary Strategy (maximin fitness) actually optimized:
//
//  1. The BAKED VECTOR equals the recorded search winner exactly. A stray edit to
//     a single digit would change the bot's play; pinning the numbers catches it.
//  2. The FACTORY is faithful: at DEFAULT_PARAMS it reproduces claude-v38
//     move-for-move (the same invariant the optimizer's `param-fidelity.test.ts`
//     pins). Since opt-v2 binds this SAME factory to `OPT_V2_PARAMS`, it differs
//     from claude-v38 ONLY by the vector — no hand-transcription drift.
//  3. opt-v2 is DETERMINISTIC: the same seed yields the same game twice (all
//     in-game randomness flows through `state.rngState`, none from Math.random).

/** The recorded SNES (maximin) seed-1 `bestParams` — the immutable target the bot
 *  is frozen to. Kept verbatim here (not imported) so the test is an independent
 *  ground truth: if the baked vector ever drifts from the search result, this fails. */
const SEARCH_WINNER: typeof OPT_V2_PARAMS = {
  denyFactor: 0.4077865202089374,
  bonusScale: 16445.344286753978,
  railSynergyScale: 1.0097635130054328,
  utilPairBonus: 72.64042699522366,
  baseFloor: 45.13399032273108,
  floorRentFraction: 0.12619316909714123,
  floorCap: 351.9653844143328,
  hotelCushion: 201.1938408133869,
  houseScarce: 0,
  jailDangerRent: 289.7154580600488,
  acceptMargin: 5,
  survivalFactor: 2.555873116250935,
  liquidityRiskGain: 195.01891918549356,
  dipWorthMult: 1.850819704440693,
  raiseWorthMult: 1.787002692643207,
};

function seatsAll(bot: Contender["bot"], label: string): Contender[] {
  return [0, 1, 2, 3].map((i) => ({ label: `${label}-${i.toString()}`, bot }));
}

describe("opt-v2 — baked vector pins the maximin ES search winner", () => {
  it("matches the recorded SNES seed-1 bestParams exactly", () => {
    expect(OPT_V2_PARAMS).toEqual(SEARCH_WINNER);
  });

  it("differs from claude-v38 defaults on the documented levers", () => {
    // Sanity that opt-v2 is NOT just claude-v38 — the optimizer moved real knobs.
    expect(OPT_V2_PARAMS.denyFactor).not.toBe(DEFAULT_PARAMS.denyFactor);
    expect(OPT_V2_PARAMS.floorRentFraction).not.toBe(DEFAULT_PARAMS.floorRentFraction);
    expect(OPT_V2_PARAMS.acceptMargin).not.toBe(DEFAULT_PARAMS.acceptMargin);
  });
});

describe("opt-v2 factory fidelity — DEFAULT_PARAMS reproduces claude-v38", () => {
  // The same move-for-move equality the optimizer's param-fidelity test pins,
  // ported here so opt-v2 owns its own proof that the factory it binds is faithful.
  const seeds = ["sim-1", "fid-2", "fid-7"];
  const paramBot = makeParamBot(DEFAULT_PARAMS);

  for (const seed of seeds) {
    it(`default param bot is move-for-move identical to claude-v38 (seed ${seed})`, () => {
      const ref = simulateGame({
        seed,
        seats: seatsAll(claudeV38Bot, "v38"),
        maxTurns: 2000,
        includeLog: true,
      });
      const got = simulateGame({
        seed,
        seats: seatsAll(paramBot, "def"),
        maxTurns: 2000,
        includeLog: true,
      });

      expect(got.terminated).toBe(ref.terminated);
      expect(got.turns).toBe(ref.turns);
      expect(got.steps).toBe(ref.steps);
      expect(got.eventCounts).toEqual(ref.eventCounts);
      const refWinnerSeat = ref.standings.findIndex((s) => s.id === ref.winnerId);
      const gotWinnerSeat = got.standings.findIndex((s) => s.id === got.winnerId);
      expect(gotWinnerSeat).toBe(refWinnerSeat);
      expect(got.highlights.map((h) => ({ turn: h.turn, kind: h.event.kind }))).toEqual(
        ref.highlights.map((h) => ({ turn: h.turn, kind: h.event.kind })),
      );
      const notes = (r: typeof ref): string[] =>
        r.highlights
          .filter((h) => h.event.kind === "bot-note")
          .map((h) => (h.event.kind === "bot-note" ? h.event.text : ""));
      expect(notes(got)).toEqual(notes(ref));
    });
  }
});

describe("opt-v2 is deterministic", () => {
  it("plays the same game twice for a fixed seed", () => {
    const seed = "opt2-det-1";
    const a = simulateGame({ seed, seats: seatsAll(optV2Bot, "opt2"), maxTurns: 2000, includeLog: true });
    const b = simulateGame({ seed, seats: seatsAll(optV2Bot, "opt2"), maxTurns: 2000, includeLog: true });
    expect(b.turns).toBe(a.turns);
    expect(b.steps).toBe(a.steps);
    expect(b.eventCounts).toEqual(a.eventCounts);
    const winnerSeat = (r: typeof a): number => r.standings.findIndex((s) => s.id === r.winnerId);
    expect(winnerSeat(b)).toBe(winnerSeat(a));
  });

  it("plays DIFFERENTLY from claude-v38 — the vector actually changes decisions", () => {
    // Not a fidelity claim (we WANT divergence): just confirms the bound vector is
    // live. Over a spread of seats, at least one observable must differ from v38.
    const seed = "opt2-vs-v38-1";
    const opt = simulateGame({ seed, seats: seatsAll(optV2Bot, "opt2"), maxTurns: 2000, includeLog: true });
    const v38 = simulateGame({ seed, seats: seatsAll(claudeV38Bot, "v38"), maxTurns: 2000, includeLog: true });
    const diverged =
      opt.turns !== v38.turns ||
      opt.steps !== v38.steps ||
      JSON.stringify(opt.eventCounts) !== JSON.stringify(v38.eventCounts);
    expect(diverged).toBe(true);
  });
});
