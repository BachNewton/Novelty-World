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
import { borderOf, borderScorer } from "./border";
import { ruleBot, ruleV6_1Bot } from "./index";
import { V6_1_PARAMS } from "./params";

// v6.1 is v6 with the border loss gathered another way (`ideas/rule-bot-v6.1.md`): at "sum" it
// must play v6's moves exactly, and each mode must gather what it says.

const sum = riskBot('rule-v6.1~{"border":"sum"}');
const max = riskBot('rule-v6.1~{"border":"max"}');

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

  it("moves away from v6 at border \"max\" on the 6-player game", () => {
    let differ = 0;
    askAlong(GAMES[2], [ruleV6Bot, max], ([v6, v61]) => {
      if (JSON.stringify(v6) !== JSON.stringify(v61)) differ++;
    });
    expect(differ).toBeGreaterThan(0);
  });
});

describe("rule-v6.1's border modes", () => {
  const turn = (seat: Seat, aimCase: OpponentTurn["aimCase"], aim: number, hit: number): OpponentTurn => ({ seat, aimCase, aim, hit, victim: -1, killTaken: 0 });

  it("gathers the opponents that reach me: summed, the worst one, or their mean", () => {
    const turns = [turn(1, "share", 0.5, 10), turn(2, "apart", 0, 0), turn(3, "leader", 0.2, 40), turn(4, "ally", 0.25, 4)];
    expect(borderOf(turns, "sum")).toBeCloseTo(5 + 8 + 1, 12);
    expect(borderOf(turns, "max")).toBeCloseTo(8, 12);
    expect(borderOf(turns, "mean")).toBeCloseTo(14 / 3, 12);
    expect(borderOf([turn(1, "apart", 0, 0)], "mean")).toBe(0);
  });

  // I (seat 0) hold South America; seat 1 North America and Asia, its stack of 8 on Central
  // America; seat 2 Europe and Africa, 6 on North Africa; seat 3 only Australia, out of reach.
  const own = (continents: readonly ContinentId[], seat: Seat, armies: number) =>
    Object.fromEntries(TERRITORIES.filter((t) => continents.includes(t.continent)).map((t) => [t.id, [seat, armies]])) as Partial<Record<TerritoryId, [Seat, number]>>;
  const state = position({
    players: 4,
    board: {
      ...own(["north-america", "asia"], 1, 2),
      ...own(["europe", "africa"], 2, 2),
      ...own(["australia"], 3, 1),
      ...own(["south-america"], 0, 3),
      "central-america": [1, 8],
      "north-africa": [2, 6],
    },
  });
  const b = fromView(referenceEngine.view(state, 0));
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
    expect(borderScorer(V6_PARAMS, "max")(b, 0, bd)).toBeCloseTo(bd.value + (w * (borderLoss - Math.max(loss(1), loss(2)))) / bd.total, 12);
    expect(borderScorer(V6_PARAMS, "sum")(b, 0, bd)).toBeCloseTo(bd.value, 12);
  });
});

describe("rule-v6.1 is deterministic", () => {
  it("makes the same moves again, and a fresh copy makes them too", () => {
    const fresh = ruleBot(V6_1_PARAMS);
    askAlong(GAMES[2], [ruleV6_1Bot, ruleV6_1Bot, fresh], ([a, again, copy], decision) => {
      expect(again, `decision ${decision.toString()}`).toEqual(a);
      expect(copy, `decision ${decision.toString()}`).toEqual(a);
    }, 15);
  });
});
