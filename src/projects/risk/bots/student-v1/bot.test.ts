import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, Move, Seat } from "../../contract";
import { referenceEngine as engine } from "../../engine";
import { candidateRows, decisionOf, teacherParams, teacherSearch } from "../../eval/distill";
import type { Bot, BotInput } from "../bot";
import { gdAggressiveBot, gdStackerBot } from "../gd";
import { greedyBot } from "../greedy";
import { ruleV6Bot } from "../rule-v6";
import { V7_PARAMS } from "../rule-v7/params";
import { searchPoint } from "../rule-v7/replies";
import { decisionRows } from "./index";
import { GOLDEN_TOLERANCE, scorer } from "./network";
import { WEIGHT_SETS } from "./weights";

// student-v1: its network reproduces the trained one's scores, and its rows are the training rows.

const FIELD: Bot[] = [greedyBot, gdStackerBot, gdAggressiveBot, greedyBot];

function inputFor(state: GameState, seat: Seat, history: readonly GameEvent[], seed: string): BotInput {
  const options = engine.options(state, seat);
  if (!options) throw new Error(`seat ${seat.toString()} has no options`);
  const view = engine.view(state, seat);
  return { seat, view, options, events: [], history, humans: view.seats.map(() => false), seed };
}

/** Plays `bots` from `seed` with every seat's redacted history kept as the runner keeps it,
 *  `visit` seeing each decision and its move before it is applied, until `visit` returns true. */
function walk(seed: string, bots: readonly Bot[], visit: (input: BotInput, move: Move) => boolean | void): void {
  const started = engine.newGame({ players: bots.length }, seed);
  let state = started.state;
  const histories: GameEvent[][] = bots.map((_, seat) => [...engine.redact(started.events, seat)]);
  for (let step = 0; step < 5_000; step++) {
    const view = engine.view(state, null);
    if (view.phase === "game-over") throw new Error("the game ended before the test had seen enough");
    const seat = view.active;
    const input = inputFor(state, seat, [...histories[seat]], `${seed}/${step.toString()}`);
    const move = bots[seat](input);
    if (visit(input, move) === true) return;
    const result = engine.apply(state, seat, move);
    if (!result.ok) throw new Error(`step ${step.toString()}: seat ${seat.toString()} made an illegal move ${JSON.stringify(move)}: ${result.reason}`);
    histories.forEach((h, s) => h.push(...engine.redact(result.events, s)));
    state = result.state;
  }
  throw new Error("the walk ran out of steps");
}

/** A phase's first placement, where the student ranks the candidates. */
const ranks = (input: BotInput) => input.seat === 0 && input.options.kind === "reinforce" && searchPoint(input.view, input.history)?.placed.size === 0;

describe("student-v1's network", () => {
  for (const name of Object.keys(WEIGHT_SETS)) {
    it(`gives the trained network's scores for its golden decisions (${name})`, () => {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- each weight set's own fixture, beside this test
      const golden = JSON.parse(readFileSync(join(__dirname, "__fixtures__", `golden-${name}.json`), "utf8")) as { rows: string; scores: number[] }[];
      expect(golden.length).toBeGreaterThan(0);
      const score = scorer(WEIGHT_SETS[name]);
      for (const g of golden) {
        const bytes = Buffer.from(g.rows, "base64");
        const rows = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        const scores = score(rows);
        expect(scores).toHaveLength(g.scores.length);
        scores.forEach((s, i) => expect(Math.abs(s - g.scores[i])).toBeLessThan(GOLDEN_TOLERANCE));
      }
    });
  }
});

describe("student-v1", () => {
  it("builds each candidate's row as the teacher recorder's features step does", () => {
    const zero = teacherParams('rule-v7~{"replies":0}');
    let seen = 0;
    let captures = 0;
    walk("student-rows", [ruleV6Bot, ...FIELD], (input) => {
      if (!ranks(input)) return;
      const point = searchPoint(input.view, input.history);
      if (point === null) throw new Error("a ranking is made at a search point");
      const ours = decisionRows(point, 0, V7_PARAMS);
      const decision = decisionOf(point, 0, zero, teacherSearch(point, 0, zero, input.humans));
      if (decision.candidates.length < 2) return;
      // As the features step reads it: from the recording's JSON.
      expect(Array.from(ours.rows)).toEqual(Array.from(candidateRows(JSON.parse(JSON.stringify(decision)) as typeof decision)));
      captures += decision.candidates.filter((c) => c.kind !== "hold").length;
      return ++seen >= 3;
    });
    expect(seen).toBe(3);
    expect(captures).toBeGreaterThan(0);
  });
});
