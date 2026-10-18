import { describe, expect, it } from "vitest";
import type { CardId, Seat } from "../../contract";
import { referenceEngine } from "../../engine";
import { position, type Position } from "../../engine/test-kit";
import { TERRITORIES, type TerritoryId } from "../../map";
import { armiesOf, boardIncome, copyBoard, fromView, idx, type Board } from "../rule-v1/board";
import { CARD_WORTH, DRAW_CHANCE } from "../rule-v1/cards";
import { breakdown as v3Breakdown, sweepLoss as v3SweepLoss } from "../rule-v3/evaluate";
import { V3_PARAMS } from "../rule-v3/params";
import { killChance as v3KillChance, planCapture } from "../rule-v3/routes";
import { killChance } from "./kills";
import { forecast, sweepAgainst, sweepLoss } from "./opponents";
import { V4_PARAMS, type Params } from "./params";
import { failureBoard, stopOf, survivingDefenders } from "./planner";
import { hiddenCards } from "./worth";

// What v4 changes in v3's beliefs and plans, one fix at a time, each on a board built to show it.

const board = (p: Position, seat: Seat = 0): Board => fromView(referenceEngine.view(position({ players: 3, ...p }), seat));
const alive = (b: Board): Seat[] => [0, 1, 2].filter((s) => b.alive[s]);
const small: Params = { ...V4_PARAMS, prefs: V4_PARAMS.smallTable.prefs };
const v3Small = { ...V3_PARAMS, prefs: V3_PARAMS.smallTable.prefs };
const taken = (before: Board, after: Int8Array, from: Seat) => before.owner.filter((o, t) => o === from && after[t] !== from).length;

const AMERICAS: TerritoryId[] = TERRITORIES.filter((t) => t.continent === "north-america" || t.continent === "south-america").map((t) => t.id);
const holding = (ts: readonly TerritoryId[], seat: Seat, armies: number) => Object.fromEntries(ts.map((t) => [t, [seat, armies]]));

describe("v4's sweep", () => {
  // Every American territory mine on one army, and a stack beside Alaska.
  const spread = (stack: number) => board({ board: { ...holding(AMERICAS, 0, 1), kamchatka: [1, stack] }, rest: [2, 3] });

  it("runs until no capture is sure, past v3's eight", () => {
    const b = spread(20);
    const sweep = sweepAgainst(b, 0, 1, 3);
    expect(taken(b, sweep.owner, 0)).toBe(AMERICAS.length);
    expect(sweep.lost).toBe(AMERICAS.length);
    // v3 counted 8 armies lost and the income of 8 territories.
    expect(sweepLoss(b, 0, 1, 3, 2, 1)).toBeGreaterThan(v3SweepLoss(b, 0, 1, 3, 2, 1) + 5);
  });

  it("spends an army a capture, not two", () => {
    // 10 attackers through one-army territories leave one behind at each and lose a fraction
    // of one, until the last fights are no longer sure: 8 captures. v3, rounding the survivors
    // down and stopping at a dead end, took fewer.
    const b = spread(11);
    expect(taken(b, sweepAgainst(b, 0, 1, 0).owner, 0)).toBe(8);
    expect(sweepLoss(b, 0, 1, 0, 1, 1)).toBeGreaterThan(v3SweepLoss(b, 0, 1, 0, 1, 1));
  });
});

describe("v4's kills", () => {
  // Seat 1 at Kamchatka beside seat 2's Alaska and, behind it, its Northwest Territory.
  const kill = (alaska: number, kamchatka: number) =>
    board({ board: { kamchatka: [1, kamchatka], alaska: [2, alaska], "northwest-territory": [2, 1] }, rest: [0, 3] });

  it("are a chance that falls gradually with the defence, not a cliff", () => {
    const thin = killChance(kill(2, 6), 1, 2, 0);
    const thick = killChance(kill(4, 6), 1, 2, 0);
    // v3: 0 behind 4 armies, and most of the way to sure behind 2.
    expect(v3KillChance(kill(4, 6), 1, 2, 0)).toBe(0);
    expect(v3KillChance(kill(2, 6), 1, 2, 0)).toBeCloseTo(thin, 12);
    expect(thick).toBeGreaterThan(0.1);
    expect(thin).toBeGreaterThan(thick);
    // Past the screen the chance is the plan's own.
    expect(thick).toBe(planCapture(kill(4, 6), 1, [idx("alaska"), idx("northwest-territory")], 0, 1)?.pSuccess);
  });

  it("are no chance at all with fewer armies than the victim's territories", () => {
    expect(killChance(kill(1, 2), 1, 2, 0)).toBe(0);
  });

  // Seat 1 holds Siam with 30 and all the board but Australia, seat 2's on one army each with
  // 3 cards, and my India, Middle East and Egypt on 2 each.
  const cards = ["alaska", "peru", "ural"] as CardId[];
  const twoVictims = () =>
    board({
      board: {
        siam: [1, 30],
        ...holding(["indonesia", "new-guinea", "western-australia", "eastern-australia"], 2, 1),
        ...holding(["india", "middle-east", "egypt"], 0, 2),
      },
      rest: [1, 2],
      hands: [[], [], cards],
    });

  it("are each opponent's one victim, but a seat it passes over still fears it", () => {
    const b = twoVictims();
    const f = forecast(b, 0, small, alive(b), null);
    expect(f.turns.find((t) => t.seat === 1)?.victim).toBe(2);
    expect(1 - f.spared[0]).toBeGreaterThan(0.2);
    // v3 believed only its best kill: mine wasn't, so I was all but safe.
    expect(v3Breakdown(b, 0, v3Small).killExposure).toBeLessThan(0.001);
  });

  it("move the victim's cards and its territories' income to the killer", () => {
    const b = twoVictims();
    const f = forecast(b, 0, small, alive(b), null);
    const turn = f.turns.find((t) => t.seat === 1);
    if (turn === undefined) throw new Error("seat 1 has a turn");
    const H = small.prefs.incomeHorizon;
    const own = armiesOf(b, 1) + H * (boardIncome(b, 1) + DRAW_CHANCE * CARD_WORTH) + hiddenCards(0);
    const after = copyBoard(b);
    for (let t = 0; t < after.owner.length; t++) if (after.owner[t] === 2) after.owner[t] = 1;
    // Australia's four territories make 39, worth 13 where 35 were worth 11, and its bonus is 2.
    expect(boardIncome(after, 1) - boardIncome(b, 1)).toBe(4);
    expect(f.power[1] - own).toBeCloseTo(turn.killTaken * (hiddenCards(3) + H * 4), 9);
  });
});

describe("v4's failure board", () => {
  it("leaves a defender the run never reached as it was", () => {
    // Two attackers take Alaska's one army and have nothing left for the Northwest Territory's five.
    expect(stopOf(3, [1, 5])).toEqual({ at: 1, attackers: 0 });
    expect(survivingDefenders(0, 5)).toBe(5);
    const b = board({ board: { kamchatka: [0, 3], alaska: [1, 1], "northwest-territory": [1, 5] }, rest: [2, 3] });
    const plan = planCapture(b, 0, [idx("alaska"), idx("northwest-territory")], 0, 1);
    if (plan === null) throw new Error("the targets are in reach");
    expect(failureBoard(b, 0, plan).armies[idx("northwest-territory")]).toBe(5);
  });

  it("takes from a defender only what the attackers reaching it are expected to kill", () => {
    const left = survivingDefenders(3, 5);
    expect(left).toBeGreaterThan(1);
    expect(left).toBeLessThan(5);
  });
});
