import { describe, expect, it } from "vitest";
import { simulateGame, type Contender } from "../../eval/simulate";
import { claudeV38Bot } from "../claude-v38";
import { DEFAULT_PARAMS, makeParamBot } from "./bot";
import { OPT_V4_PARAMS, optV4Bot } from "./index";

// opt-v4 fidelity — the baked vector pins the 8-panel maximin ES winner, the
// factory reproduces claude-v38 at DEFAULT_PARAMS (so opt-v4 differs only by the
// vector), and opt-v4 is deterministic.

/** The recorded SNES (8-panel maximin) seed-1 `bestParams` — kept verbatim here
 *  (not imported) so the test is an independent ground truth. */
const SEARCH_WINNER: typeof OPT_V4_PARAMS = {
  denyFactor: 0.3173335904752713,
  bonusScale: 21995.472785370766,
  railSynergyScale: 0.9770818630368011,
  utilPairBonus: 73.96170330608032,
  baseFloor: 16.18002489726024,
  floorRentFraction: 0.2507072265465841,
  floorCap: 107.3670759562972,
  hotelCushion: 0,
  houseScarce: 6.236526313557662,
  jailDangerRent: 344.60283894208476,
  acceptMargin: 5,
  survivalFactor: 2.4072701326399173,
  liquidityRiskGain: 239.51454037558878,
  dipWorthMult: 2.01122889280204,
  raiseWorthMult: 1.6502849141314595,
};

function seatsAll(bot: Contender["bot"], label: string): Contender[] {
  return [0, 1, 2, 3].map((i) => ({ label: `${label}-${i.toString()}`, bot }));
}

describe("opt-v4 — baked vector pins the 8-panel maximin ES winner", () => {
  it("matches the recorded SNES seed-1 bestParams exactly", () => {
    expect(OPT_V4_PARAMS).toEqual(SEARCH_WINNER);
  });

  it("differs from claude-v38 defaults on the documented levers", () => {
    expect(OPT_V4_PARAMS.denyFactor).not.toBe(DEFAULT_PARAMS.denyFactor);
    expect(OPT_V4_PARAMS.hotelCushion).not.toBe(DEFAULT_PARAMS.hotelCushion);
    expect(OPT_V4_PARAMS.acceptMargin).not.toBe(DEFAULT_PARAMS.acceptMargin);
  });
});

describe("opt-v4 factory fidelity — DEFAULT_PARAMS reproduces claude-v38", () => {
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

describe("opt-v4 is deterministic", () => {
  it("plays the same game twice for a fixed seed", () => {
    const seed = "opt4-det-1";
    const a = simulateGame({ seed, seats: seatsAll(optV4Bot, "opt4"), maxTurns: 2000, includeLog: true });
    const b = simulateGame({ seed, seats: seatsAll(optV4Bot, "opt4"), maxTurns: 2000, includeLog: true });
    expect(b.turns).toBe(a.turns);
    expect(b.steps).toBe(a.steps);
    expect(b.eventCounts).toEqual(a.eventCounts);
    const winnerSeat = (r: typeof a): number => r.standings.findIndex((s) => s.id === r.winnerId);
    expect(winnerSeat(b)).toBe(winnerSeat(a));
  });

  it("plays DIFFERENTLY from claude-v38 — the vector actually changes decisions", () => {
    const seed = "opt4-vs-v38-1";
    const opt = simulateGame({ seed, seats: seatsAll(optV4Bot, "opt4"), maxTurns: 2000, includeLog: true });
    const v38 = simulateGame({ seed, seats: seatsAll(claudeV38Bot, "v38"), maxTurns: 2000, includeLog: true });
    const diverged =
      opt.turns !== v38.turns ||
      opt.steps !== v38.steps ||
      JSON.stringify(opt.eventCounts) !== JSON.stringify(v38.eventCounts);
    expect(diverged).toBe(true);
  });
});
