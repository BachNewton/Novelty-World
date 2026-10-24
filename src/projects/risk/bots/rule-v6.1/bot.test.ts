import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Seat } from "../../contract";
import { referenceEngine } from "../../engine";
import { position } from "../../engine/test-kit";
import { TERRITORIES, type ContinentId, type TerritoryId } from "../../map";
import { keptRecording, replayMoves, type Recording } from "../../eval/replay";
import type { Bot } from "../bot";
import { riskBot } from "../index";
import { fromView } from "../rule-v1/board";
import { ruleV6Bot } from "../rule-v6";
import { breakdown } from "../rule-v6/evaluate";
import { forecast, type OpponentTurn } from "../rule-v6/opponents";
import { V6_PARAMS } from "../rule-v6/params";
import { borderOf } from "./border";
import { ruleBot, ruleV6_1Bot } from "./index";
import { inEffect, V6_1_PARAMS, type Params } from "./params";
import { plans } from "./planner";
import { attritionScale, pricedArmies, repricedPower, scorerFor, threatFor, turnsUnder } from "./score";

// v6.1 is v6 with its board scored another way (`ideas/rule-bot-v6.1.md`): with no setting moved
// it must play v6's moves exactly, and each setting must compute what it says.

const sum = riskBot('rule-v6.1~{"border":"sum"}');
const max = riskBot('rule-v6.1~{"border":"max"}');
const armies = riskBot('rule-v6.1~{"border":"sum","power":"armies"}');
const attrition = riskBot('rule-v6.1~{"border":"sum","attrition":6}');
const full = riskBot('rule-v6.1~{"border":"sum","power":"armies","reprice":"full"}');
const combined = riskBot('rule-v6.1~{"border":"sum","power":"armies","reprice":"full","armyRounds":12,"armyBeyond":0.75,"attrition":6,"attritionAlive":6,"minPlayers":5}');
const sixOnly = riskBot('rule-v6.1~{"border":"sum","power":"armies","reprice":"full","minPlayers":6}');

/** v6's own frozen games (3 seats of v6; v6 beside greedy at 5), and a 6-player game of v6 cut at
 *  60 turns, kept beside this test. */
const GAMES: readonly { name: string; seed: string; players: number; maxTurns: number; recording: () => Recording }[] = [
  { name: "3 × v6", seed: "frozen-a", players: 3, maxTurns: 300, recording: () => kept("../__fixtures__/frozen/rule-v6.frozen-a.json", "frozen-a", 3, 300) },
  { name: "v6 and greedy at 5", seed: "frozen-b", players: 5, maxTurns: 300, recording: () => kept("../__fixtures__/frozen/rule-v6.frozen-b.json", "frozen-b", 5, 300) },
  { name: "6 × v6", seed: "six-v6", players: 6, maxTurns: 60, recording: () => kept("__fixtures__/six-v6.json", "six-v6", 6, 60) },
];

function kept(file: string, seed: string, players: number, maxTurns: number): Recording {
  return keptRecording(join(__dirname, file), seed, () => Array.from({ length: players }, () => ruleV6Bot), maxTurns);
}

/** Asks `bots` at every `step`-th decision of a kept game, from the 10th on, up to `most` of
 *  them, and hands each answer to `check`. */
function askAlong(game: (typeof GAMES)[number], bots: readonly Bot[], check: (moves: ReturnType<Bot>[], decision: number) => void, most = 30): void {
  const recording = game.recording();
  const step = Math.max(1, Math.floor((recording.moves.length - 10) / most));
  replayMoves(game.seed, game.players, game.maxTurns, recording, (input, _move, decision) => {
    if (decision >= 10 && (decision - 10) % step === 0) check(bots.map((bot) => bot(input)), decision);
  });
}

describe("rule-v6.1 at border \"sum\" is v6", () => {
  for (const game of GAMES) {
    it(`makes v6's moves (${game.name})`, () => {
      askAlong(game, [ruleV6Bot, sum], ([v6, v61], decision) => expect(v61, `decision ${decision.toString()}`).toEqual(v6));
    });
  }

  it("is v6 below its table-size gate, whatever it moves above it (3 and 5 players, gated at 6)", () => {
    for (const game of GAMES.slice(0, 2)) {
      askAlong(game, [ruleV6Bot, sixOnly], ([v6, v61], decision) => expect(v61, `${game.name}, decision ${decision.toString()}`).toEqual(v6), 15);
    }
  });

  it("moves away from v6 at border \"max\" on the 6-player game", () => {
    let differ = 0;
    askAlong(GAMES[2], [ruleV6Bot, max], ([v6, v61]) => {
      if (JSON.stringify(v6) !== JSON.stringify(v61)) differ++;
    });
    expect(differ).toBeGreaterThan(0);
  });

  it("moves away from v6 with the army discount and with attrition on the 6-player game", () => {
    const differ = [0, 0];
    askAlong(GAMES[2], [ruleV6Bot, armies, attrition], ([v6, ...candidates]) => {
      candidates.forEach((m, i) => {
        if (JSON.stringify(m) !== JSON.stringify(v6)) differ[i]++;
      });
    }, 15);
    expect(differ[0]).toBeGreaterThan(0);
    expect(differ[1]).toBeGreaterThan(0);
  });
});

// I (seat 0) hold South America; seat 1 North America and Asia, its stack of 8 on Central
// America; seat 2 Europe and Africa, 6 on North Africa; seat 3 only Australia, out of reach.
const own = (continents: readonly ContinentId[], seat: Seat, armies: number) =>
  Object.fromEntries(TERRITORIES.filter((t) => continents.includes(t.continent)).map((t) => [t.id, [seat, armies]])) as Partial<Record<TerritoryId, [Seat, number]>>;
const TABLE: Partial<Record<TerritoryId, [Seat, number]>> = {
  ...own(["north-america", "asia"], 1, 2),
  ...own(["europe", "africa"], 2, 2),
  ...own(["australia"], 3, 1),
  ...own(["south-america"], 0, 3),
  "central-america": [1, 8],
  "north-africa": [2, 6],
};

describe("rule-v6.1's border modes", () => {
  const turn = (seat: Seat, aimCase: OpponentTurn["aimCase"], aim: number, hit: number): OpponentTurn => ({ seat, aimCase, aim, hit, victim: -1, killTaken: 0 });

  it("gathers the opponents that reach me: summed, the worst one, or their mean", () => {
    const turns = [turn(1, "share", 0.5, 10), turn(2, "apart", 0, 0), turn(3, "leader", 0.2, 40), turn(4, "ally", 0.25, 4)];
    expect(borderOf(turns, "sum")).toBeCloseTo(5 + 8 + 1, 12);
    expect(borderOf(turns, "max")).toBeCloseTo(8, 12);
    expect(borderOf(turns, "mean")).toBeCloseTo(14 / 3, 12);
    expect(borderOf([turn(1, "apart", 0, 0)], "mean")).toBe(0);
  });

  const b = fromView(referenceEngine.view(position({ players: 4, board: TABLE }), 0));
  const alive = [0, 1, 2, 3];
  const { turns, borderLoss } = forecast(b, 0, V6_PARAMS, alive, null);
  const loss = (seat: Seat) => {
    const t = turns.find((x) => x.seat === seat) as OpponentTurn;
    return t.aim * t.hit;
  };

  it("counts the two neighbours and not the seat out of reach", () => {
    expect(turns.find((t) => t.seat === 3)?.aimCase).toBe("apart");
    expect(loss(1)).toBeGreaterThan(0);
    expect(loss(2)).toBeGreaterThan(0);
    expect(borderOf(turns, "sum")).toBe(borderLoss);
    expect(borderOf(turns, "max")).toBe(Math.max(loss(1), loss(2)));
    expect(borderOf(turns, "mean")).toBeCloseTo((loss(1) + loss(2)) / 2, 12);
  });

  it("scores v6's value with only the border charge swapped", () => {
    const bd = breakdown(b, 0, V6_PARAMS);
    const w = V6_PARAMS.prefs.borderWeight;
    expect(scorerFor(V6_PARAMS, { ...V6_1_PARAMS, border: "max" })(b, 0, bd)).toBeCloseTo(bd.value + (w * (borderLoss - Math.max(loss(1), loss(2)))) / bd.total, 12);
    expect(scorerFor(V6_PARAMS, { ...V6_1_PARAMS, border: "sum" })(b, 0, bd)).toBe(bd.value);
  });
});

describe("rule-v6.1's army discount and attrition", () => {
  // The same table, with seat 1 hoarding 200 on Central America. Board incomes: me 3 + South
  // America's 2 = 5; seat 1 21 territories, 7 + 5 + 7 = 19; seat 2 13 territories, 4 + 5 + 3 = 12;
  // seat 3 Australia, 3 + 2 = 5: 41 in all. Armies: 12, 40 + 200 = 240, 30 and 4: 286.
  const hoard = position({ players: 4, board: { ...TABLE, "central-america": [1, 200] } });
  const b = fromView(referenceEngine.view(position({ players: 4, board: TABLE }), 0));
  const h = fromView(referenceEngine.view(hoard, 0));
  const settings = (moved: Partial<Params>): Params => ({ ...V6_1_PARAMS, border: "sum", ...moved });

  it("counts armies fully up to the rounds of income and at the fraction beyond", () => {
    expect(pricedArmies(30, 5, 6, 0.25)).toBe(30);
    expect(pricedArmies(100, 5, 6, 0.25)).toBe(30 + 0.25 * 70);
    expect(pricedArmies(100, 5, 4, 0.5)).toBe(20 + 0.5 * 80);
    expect(pricedArmies(100, 5, 6, 1)).toBe(100);
  });

  it("takes the hoarder's discount off its power, scaled by its chance of surviving, and leaves seats under the cap alone", () => {
    const bd = breakdown(h, 0, V6_PARAMS);
    const power = repricedPower(h, 0, bd, 6, 0.25);
    // Seat 1: 240 armies against a cap of 6 × 19 = 114, so 114 + 0.25 × 126 = 145.5 count.
    expect(power[1]).toBeCloseTo(bd.power[1] - (240 - 145.5) * bd.spared[1], 9);
    expect(power[0]).toBe(bd.power[0]);
    expect(power[2]).toBe(bd.power[2]);
    expect(power[3]).toBe(bd.power[3]);
  });

  it("rebuilds v6's value exactly when nothing is discounted, and raises my share when the hoarder's is", () => {
    const bd = breakdown(h, 0, V6_PARAMS);
    expect(scorerFor(V6_PARAMS, settings({ power: "armies", armyBeyond: 1 }))(h, 0, bd)).toBeCloseTo(bd.value, 12);
    expect(scorerFor(V6_PARAMS, settings({ power: "armies" }))(h, 0, bd)).toBeGreaterThan(bd.value);
  });

  it("scales the border weight by the board's rounds of income only past the threshold", () => {
    expect(attritionScale(b, [0, 1, 2, 3], 6)).toBe(1);
    expect(attritionScale(h, [0, 1, 2, 3], 6)).toBeCloseTo((6 * 41) / 286, 12);
    expect(attritionScale(h, [0, 1, 2, 3], 0)).toBe(1);
    const bd = breakdown(h, 0, V6_PARAMS);
    const w = V6_PARAMS.prefs.borderWeight;
    const scale = (6 * 41) / 286;
    expect(scorerFor(V6_PARAMS, settings({ attrition: 6 }))(h, 0, bd)).toBeCloseTo(bd.value + (w * (1 - scale) * bd.borderLoss) / bd.total, 12);
  });

  it("is v6's value exactly where the board's income outruns its armies", () => {
    const bd = breakdown(b, 0, V6_PARAMS);
    expect(scorerFor(V6_PARAMS, settings({ attrition: 6 }))(b, 0, bd)).toBe(bd.value);
    expect(scorerFor(V6_PARAMS, settings({ attrition: 9 }))(b, 0, bd)).toBe(bd.value);
  });
});

describe("rule-v6.1's full re-pricing", () => {
  // The same table, with seat 2 hoarding 200 on North Africa: at face value it is the common
  // threat (power 268 against seat 1's 113); with its armies past 4 rounds of its income (12, a
  // cap of 48) at a quarter, its power is about 136, under 1.3 times seat 1's, so nobody is.
  const h = fromView(referenceEngine.view(position({ players: 4, board: { ...TABLE, "north-africa": [2, 200] } }), 0));
  const alive = [0, 1, 2, 3];
  const record = { taken: [[0, 0, 0, 0], [2, 0, 1, 0.5], [1.5, 1, 0, 0], [0, 0, 0, 0]] };
  const priced = (moved: Partial<Params>): Params => ({ ...V6_1_PARAMS, border: "sum", power: "armies", armyRounds: 4, armyBeyond: 0.25, ...moved });
  const lossOf = (turns: readonly OpponentTurn[]) => borderOf(turns, "sum");
  const turnOf = (turns: readonly OpponentTurn[], seat: Seat) => turns.find((t) => t.seat === seat) as OpponentTurn;
  const beliefs = V6_PARAMS.opponents.beliefs;

  it("names the threat v6 sees at face value, and none once the hoard is discounted", () => {
    const bd = breakdown(h, 0, V6_PARAMS);
    expect(bd.commonThreat).toBe(2);
    expect(threatFor(V6_PARAMS, priced({ reprice: "full" }))?.(h, 0, bd)).toBeNull();
    expect(threatFor(V6_PARAMS, priced({ reprice: "value" }))).toBeUndefined();
    expect(threatFor(V6_PARAMS, { ...priced({ reprice: "full" }), power: "face" })).toBeUndefined();
  });

  it("rebuilds v6's own aims and border loss under v6's own threat, with and without a record", () => {
    for (const params of [V6_PARAMS, { ...V6_PARAMS, record }]) {
      const v6 = forecast(h, 0, params, alive, params.record);
      const turns = turnsUnder(h, 0, params, alive, v6.commonThreat);
      expect(turns.map((t) => [t.seat, t.aimCase, t.aim, t.hit])).toEqual(v6.turns.map((t) => [t.seat, t.aimCase, t.aim, t.hit]));
      expect(lossOf(turns)).toBe(v6.borderLoss);
    }
  });

  it("aims by the threat it is given: an ally's aim beside a third seat's threat, the share without one, the leader's at me", () => {
    const v6 = forecast(h, 0, V6_PARAMS, alive, null);
    // v6, with seat 2 the threat: seat 1 aims at me as its ally, seat 2 by its share.
    expect(turnOf(v6.turns, 1)).toMatchObject({ aimCase: "ally", aim: beliefs.allyAim });
    expect(turnOf(v6.turns, 2).aimCase).toBe("share");
    const none = turnsUnder(h, 0, V6_PARAMS, alive, null);
    expect(turnOf(none, 1).aimCase).toBe("share");
    expect(turnOf(none, 1).aim).not.toBe(beliefs.allyAim);
    expect(turnOf(none, 2).aim).toBe(turnOf(v6.turns, 2).aim);
    expect(turnOf(none, 3).aimCase).toBe("apart");
    const me = turnsUnder(h, 0, V6_PARAMS, alive, 0);
    for (const seat of [1, 2]) expect(turnOf(me, seat)).toMatchObject({ aimCase: "leader", aim: beliefs.leaderAim });
    for (const t of [...none, ...me]) expect(t.hit).toBe(turnOf(v6.turns, t.seat).hit);
  });

  it("pulls a re-priced aim toward the record as v6 does: the prior's weight against the territories taken", () => {
    const me = turnsUnder(h, 0, { ...V6_PARAMS, record }, alive, 0);
    // Seat 1 borders me, seat 2 and seat 3, and has taken 2 of mine, 1 of seat 2's and 0.5 of seat 3's.
    expect(turnOf(me, 1).aim).toBeCloseTo((beliefs.historyPrior * beliefs.leaderAim + 2) / (beliefs.historyPrior + 3.5), 12);
  });

  it("charges the border loss of the re-priced threat, the rest of the value as round one's re-pricing", () => {
    const bd = breakdown(h, 0, V6_PARAMS);
    const power = repricedPower(h, 0, bd, 4, 0.25);
    const total = power.reduce((x, y) => x + y, 0);
    const w = V6_PARAMS.prefs.borderWeight;
    const value = scorerFor(V6_PARAMS, priced({ reprice: "value" }))(h, 0, bd);
    const fullValue = scorerFor(V6_PARAMS, priced({ reprice: "full" }))(h, 0, bd);
    const border = lossOf(turnsUnder(h, 0, V6_PARAMS, alive, null));
    expect(border).not.toBe(bd.borderLoss);
    expect(fullValue).toBeCloseTo(value - (w * (border - bd.borderLoss)) / total, 12);
  });

  it("is round one's re-pricing exactly where the re-priced threat is v6's", () => {
    const bd = breakdown(h, 0, V6_PARAMS);
    // At 10 rounds and three quarters the hoard is still the threat.
    const gentle = { armyRounds: 10, armyBeyond: 0.75 };
    expect(scorerFor(V6_PARAMS, priced({ ...gentle, reprice: "full" }))(h, 0, bd)).toBe(scorerFor(V6_PARAMS, priced({ ...gentle, reprice: "value" }))(h, 0, bd));
  });

  it("builds its plans round the threat it is given: none into an ally's continent while a third seat is the threat", () => {
    const b = fromView(referenceEngine.view(position({ players: 4, board: TABLE }), 0));
    const intoSeat1 = (threat: Seat | null) => plans(b, 0, 10, { ...V6_PARAMS, threat: () => threat }).filter((p) => p.targets.some((t) => b.owner[t] === 1)).length;
    expect(intoSeat1(null)).toBeGreaterThan(0);
    expect(intoSeat1(2)).toBe(0);
    const own = plans(b, 0, 10, { ...V6_PARAMS, threat: (_b, _me, bd) => bd.commonThreat });
    expect(own.map((p) => p.value)).toEqual(plans(b, 0, 10, V6_PARAMS).map((p) => p.value));
  });
});

describe("rule-v6.1's table-size gates", () => {
  const table = (moved: Partial<Params>): Params => ({ ...V6_1_PARAMS, border: "sum", power: "armies", ...moved });

  it("switches every change off below the seats the table started with or the seats alive", () => {
    expect(inEffect(table({ minPlayers: 6 }), 5, 5)).toBeNull();
    expect(inEffect(table({ minPlayers: 6 }), 6, 3)).toEqual(table({ minPlayers: 6 }));
    expect(inEffect(table({ minAlive: 6 }), 6, 5)).toBeNull();
    expect(inEffect(table({ minAlive: 6 }), 6, 6)).toEqual(table({ minAlive: 6 }));
  });

  it("switches attrition alone off below its own count of seats alive", () => {
    const t = table({ attrition: 6, attritionAlive: 6 });
    expect(inEffect(t, 6, 6)?.attrition).toBe(6);
    expect(inEffect(t, 6, 5)).toEqual({ ...t, attrition: 0 });
    expect(inEffect({ ...t, power: "face" }, 6, 5)).toBeNull();
  });

  it("is v6's value where nothing is moved", () => {
    expect(inEffect({ ...V6_1_PARAMS, border: "sum" }, 6, 6)).toBeNull();
  });
});

describe("rule-v6.1 is deterministic", () => {
  const cases: readonly [string, Bot, Bot][] = [
    ["its default", ruleV6_1Bot, ruleBot(V6_1_PARAMS)],
    ["the army discount", armies, ruleBot({ ...V6_1_PARAMS, border: "sum", power: "armies" })],
    ["attrition", attrition, ruleBot({ ...V6_1_PARAMS, border: "sum", attrition: 6 })],
    ["full re-pricing", full, ruleBot({ ...V6_1_PARAMS, border: "sum", power: "armies", reprice: "full" })],
    [
      "the combined candidate",
      combined,
      ruleBot({ ...V6_1_PARAMS, border: "sum", power: "armies", reprice: "full", armyRounds: 12, armyBeyond: 0.75, attrition: 6, attritionAlive: 6, minPlayers: 5 }),
    ],
  ];
  for (const [name, bot, fresh] of cases) {
    it(`makes the same moves again, and a fresh copy makes them too (${name})`, () => {
      askAlong(GAMES[2], [bot, bot, fresh], ([a, again, copy], decision) => {
        expect(again, `decision ${decision.toString()}`).toEqual(a);
        expect(copy, `decision ${decision.toString()}`).toEqual(a);
      }, 10);
    });
  }

  it("refuses a discount fraction outside 0 to 1, a gate that isn't a whole number and an unknown reprice mode", () => {
    expect(() => riskBot('rule-v6.1~{"power":"armies","armyBeyond":1.5}')).toThrow(/armyBeyond/);
    expect(() => riskBot('rule-v6.1~{"minPlayers":5.5}')).toThrow(/minPlayers/);
    expect(() => riskBot('rule-v6.1~{"reprice":"half"}')).toThrow(/reprice/);
  });
});
