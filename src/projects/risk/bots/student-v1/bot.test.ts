import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameEvent, GameState, Move, Seat } from "../../contract";
import { referenceEngine as engine } from "../../engine";
import { candidateRows, decisionOf, teacherParams, teacherSearch } from "../../eval/distill";
import type { Bot, BotInput } from "../bot";
import { gdAggressiveBot, gdStackerBot } from "../gd";
import { greedyBot } from "../greedy";
import { riskBot } from "..";
import { IDS } from "../rule-v1/board";
import { ruleV6Bot } from "../rule-v6";
import { V7_PARAMS } from "../rule-v7/params";
import { nextPlacement, searchPoint } from "../rule-v7/replies";
import { CANDIDATE_WIDTH } from "./candidates";
import { decisionRows, DEFAULT_WEIGHTS, studentBot, studentV1 } from "./index";
import { GOLDEN_TOLERANCE, pick, scorer, type Scorer } from "./network";
import { WEIGHT_SETS } from "./weights";

// student-v1: its network reproduces the trained one's scores, its rows are the training rows,
// it is v6 wherever the network ranks v6's own choice first, and a function of its input alone.

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

/** A scorer that counts its calls and scores each candidate by `each(candidates)`. */
function counting(each: (k: number) => number[]): { score: Scorer; calls: () => number } {
  let calls = 0;
  return {
    score: (rows) => {
      calls++;
      return each(rows.length / CANDIDATE_WIDTH);
    },
    calls: () => calls,
  };
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

  it("picks the first of the highest scores", () => {
    expect(pick([0, 0, 0])).toBe(0);
    expect(pick([0.1, 0.3, 0.3, 0.2])).toBe(1);
    expect(pick([-1, -2])).toBe(0);
  });
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

  it("plays v6's moves when every candidate scores the same", () => {
    const flat = counting((k) => new Array<number>(k).fill(0.5));
    const student = studentBot(V7_PARAMS, flat.score);
    let asked = 0;
    walk("student-ties", [student, ...FIELD], (input, move) => {
      if (input.seat !== 0) return;
      expect(move).toEqual(ruleV6Bot(input));
      asked++;
      return flat.calls() >= 3 && input.options.kind !== "reinforce";
    });
    expect(flat.calls()).toBeGreaterThanOrEqual(3);
    expect(asked).toBeGreaterThan(flat.calls());
  });

  it("places for the candidate the network scores highest", () => {
    const last = counting((k) => Array.from({ length: k }, (_, i) => i));
    const student = studentBot(V7_PARAMS, last.score);
    let checked = 0;
    walk("student-pick", [student, ...FIELD], (input, move) => {
      if (!ranks(input)) return;
      const point = searchPoint(input.view, input.history);
      if (point === null) throw new Error("a ranking is made at a search point");
      const { plans } = decisionRows(point, 0, V7_PARAMS);
      if (plans.length < 2) return;
      const next = nextPlacement(plans[plans.length - 1].place, point.placed);
      if (next === null) throw new Error("a plan places something");
      expect(move).toEqual({ kind: "place", territory: IDS[next.territory], armies: next.armies });
      return ++checked >= 2;
    });
    expect(checked).toBe(2);
  });

  it("gives the same move for the same input, from any copy and its weights' label", () => {
    const student = studentV1(DEFAULT_WEIGHTS);
    const labelled = riskBot(`student-v1~{"weights":"${DEFAULT_WEIGHTS}"}`);
    let ranked = 0;
    walk("student-same", [student, ...FIELD], (input, move) => {
      if (input.seat !== 0) return;
      if (ranks(input)) ranked++;
      expect(student(input)).toEqual(move);
      expect(studentV1(DEFAULT_WEIGHTS)(input)).toEqual(move);
      expect(labelled(input)).toEqual(move);
      return ranked >= 2 && input.options.kind !== "reinforce";
    });
    expect(ranked).toBe(2);
    expect(() => riskBot('student-v1~{"weights":"no-such-set"}')).toThrow();
  });
});
