import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import type { GameEvent, GameState, Seat } from "../contract";
import { referenceEngine as engine } from "../engine";
import { inside } from "../engine/test-kit";
import type { EngineState } from "../engine/state";
import type { Bot, BotInput } from "../bots/bot";
import { riskBot } from "../bots";
import { fromView } from "../bots/rule-v1/board";
import { bestPlan } from "../bots/rule-v6/planner";
import { candidates, ruleBot, search } from "../bots/rule-v7";
import { V7_PARAMS, type Params } from "../bots/rule-v7/params";
import { searchPoint } from "../bots/rule-v7/replies";
import { features, FEATURES } from "../bots/rule-v8/features";
import {
  boardRecord,
  CANDIDATE_WIDTH,
  candidateRows,
  decisionRecords,
  recordedBoard,
  recordTeacherGame,
  teacherBot,
  teacherDecision,
  teacherParams,
  teacherSpecs,
  v6Settings,
  type Decision,
} from "./distill";
import { recordMoves } from "./replay";

// The teacher recorder: its v7 plays v7's moves, a record's candidates and scores are v7's own
// search, a record is built from the seat's view alone, a game records the same every time, and
// the features step reads a record's boards through v8's feature function.

/** A cheap teacher: one reply over v7's four candidates, still the whole search. */
const CHEAP = "rule-v7~{\"replies\":1}";
const cheap: Params = teacherParams(CHEAP);
/** A cheap field: v7's own cost is its search, and the field's turns only pass time. */
const FIELD = ["greedy", "gd-stacker", "gd-aggressive", "gd-defensive"];

/** The same game with everything `seat` can't see changed: the other hands and the deck dealt
 *  again, and the dice to come reseeded. */
function redealHidden(state: GameState, seat: Seat, rng: Rng): GameState {
  const s = structuredClone(inside(state)) as EngineState;
  const hidden = [...s.deck, ...s.hands.flatMap((h, i) => (i === seat ? [] : h))];
  for (let i = hidden.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [hidden[i], hidden[j]] = [hidden[j], hidden[i]];
  }
  let k = 0;
  s.hands = s.hands.map((h, i) => (i === seat ? h : h.map(() => hidden[k++])));
  s.deck = hidden.slice(k);
  s.rng = Math.floor(rng.next() * 2 ** 32);
  return { engineState: s };
}

function inputFor(state: GameState, seat: Seat, history: readonly GameEvent[]): BotInput {
  const options = engine.options(state, seat);
  if (!options) throw new Error(`seat ${seat.toString()} has no options`);
  const view = engine.view(state, seat);
  return { seat, view, options, events: [], history, humans: view.seats.map(() => false), seed: "distill-test" };
}

/** Plays a game with the cheap v7 at seat 0 among the field, and hands `at` the first `count`
 *  inputs where it searches over more than one candidate, with the state it was in and the
 *  decision it made. */
function walkDecisions(seed: string, count: number, at: (state: GameState, input: BotInput, decision: Decision) => void): number {
  const bots: Bot[] = [ruleBot(cheap), ...FIELD.map(riskBot)];
  const started = engine.newGame({ players: bots.length }, seed);
  let state = started.state;
  const histories: GameEvent[][] = bots.map((_, seat) => [...engine.redact(started.events, seat)]);
  let seen = 0;
  for (;;) {
    if (engine.view(state, null).phase === "game-over") throw new Error("the game ended before v7 searched enough");
    const seat = engine.view(state, null).active;
    const input = inputFor(state, seat, [...histories[seat]]);
    // A phase's first placement only: its later ones search the same point again.
    if (seat === 0 && searchPoint(input.view, input.history)?.placed.size === 0) {
      const decision = teacherDecision(input, cheap);
      if (decision !== null) {
        seen++;
        at(state, input, decision);
        if (seen === count) break;
      }
    }
    const result = engine.apply(state, seat, bots[seat]({ ...input, seed: `${seed}/${histories[seat].length.toString()}` }));
    if (!result.ok) throw new Error(result.reason);
    histories.forEach((h, s) => h.push(...engine.redact(result.events, s)));
    state = result.state;
  }
  return seen;
}

describe("risk teacher recorder", () => {
  it("plays v7's own moves", () => {
    const seen: Decision[] = [];
    const v7 = recordMoves("distill-moves", [ruleBot(cheap), ...FIELD.map(riskBot)], 6);
    const teacher = recordMoves("distill-moves", [teacherBot(cheap, (d) => seen.push(d)), ...FIELD.map(riskBot)], 6);
    expect(teacher).toEqual(v7);
    expect(seen.length).toBeGreaterThan(0);
  });

  it("keeps v7's own search: its candidates, scores and pick, on v6's own settings", () => {
    const seen = walkDecisions("distill-search", 1, (_, input, decision) => {
      const point = searchPoint(input.view, input.history);
      if (point === null) throw new Error("a decision is made at a search point");
      const result = search(point, input.seat, cheap, input.humans);
      expect(decision.candidates.map((c) => c.place)).toEqual(result.candidates.map((p) => [...p.place].sort(([x], [y]) => x - y)));
      expect(decision.scores).toEqual(result.scores);
      expect(decision.chosen).toBe(result.chosen);
      // The settings the boards are read on are the ones v7's search planned with.
      const params = v6Settings(cheap, input.seat, point.view, point.history);
      const b = fromView(point.view);
      expect(candidates(b, input.seat, point.view.armiesToPlace, params).map((p) => p.value)).toEqual(result.candidates.map((p) => p.value));
      expect([...bestPlan(b, input.seat, point.view.armiesToPlace, params).place]).toEqual([...result.candidates[0].place]);
      // A hold is valued on its one board, as recorded.
      for (const c of decision.candidates) if (c.kind === "hold") expect(c.successV6.value).toBeCloseTo(c.value, 4);
    });
    expect(seen).toBe(1);
  });

  it("builds each record from the seat's own view alone", () => {
    const rng = createRng("distill-view");
    const seen = walkDecisions("distill-view", 1, (state, input, decision) => {
      const hidden = redealHidden(state, input.seat, rng);
      expect(inside(hidden).deck.join()).not.toBe(inside(state).deck.join());
      expect(teacherDecision(inputFor(hidden, input.seat, input.history), cheap)).toEqual(decision);
    });
    expect(seen).toBe(1);
  });

  it("records the same searches every time for a seed, each with its game", () => {
    const [spec] = teacherSpecs(CHEAP, 1, FIELD, 5, "distill-same", 2, 1, 6);
    const first = recordTeacherGame(spec);
    expect(first.error).toBeUndefined();
    expect(first.searches.length).toBeGreaterThan(0);
    expect(JSON.stringify(recordTeacherGame(spec))).toBe(JSON.stringify(first));
    for (const r of decisionRecords(first)) {
      expect(r).toMatchObject({ game: 2, seed: spec.seed, labels: spec.labels, players: 5 });
      expect(spec.labels[r.seat]).toBe(CHEAP);
      expect(r.candidates.length).toBeGreaterThan(1);
      expect(r.scores.length).toBe(r.candidates.length);
      for (let c = 0; c < r.scores.length; c++) expect(r.scores[c]).toBeLessThanOrEqual(r.scores[r.chosen]);
    }
  });

  it("seats the teachers and every field bot in every seat", () => {
    const field = ["a", "b", "c", "d"];
    const specs = teacherSpecs("rule-v7", 2, field, 5, "x", 0, 20, 600);
    for (const s of specs) expect(s.labels.filter((l) => l === "rule-v7")).toHaveLength(2);
    for (let seat = 0; seat < 5; seat++) expect(new Set(specs.map((s) => s.labels[seat]))).toEqual(new Set(["rule-v7", ...field]));
    expect(() => teacherSpecs("rule-v7", 1, ["rule-v6", "rule-v7"], 5, "x", 0, 1, 600)).toThrow();
  });

  it("reads a teacher's search knobs, and nothing else", () => {
    expect(teacherParams("rule-v7")).toBe(V7_PARAMS);
    expect(teacherParams('rule-v7~{"replies":32,"candidates":6}').search).toEqual({ ...V7_PARAMS.search, replies: 32, candidates: 6 });
    expect(() => teacherParams('rule-v7~{"borderWeight":1}')).toThrow();
    expect(() => teacherParams("rule-v6")).toThrow();
  });
});

describe("risk teacher features", () => {
  it("reads every candidate's boards through v8's feature function", () => {
    const [spec] = teacherSpecs(CHEAP, 1, FIELD, 5, "distill-features", 0, 1, 5);
    const [r] = recordTeacherGame(spec).searches;
    const x = candidateRows(r);
    expect(x.length).toBe(r.candidates.length * CANDIDATE_WIDTH);
    r.candidates.forEach((c, i) => {
      const row = x.subarray(i * CANDIDATE_WIDTH, (i + 1) * CANDIDATE_WIDTH);
      const board = recordedBoard(c.success);
      expect(boardRecord(board)).toEqual(c.success);
      expect(Array.from(row.subarray(0, FEATURES))).toEqual(Array.from(features(board, r.seat, c.successV6)));
      expect(Array.from(row.subarray(FEATURES, 2 * FEATURES))).toEqual(Array.from(features(recordedBoard(c.failure), r.seat, c.failureV6)));
      expect([row[2 * FEATURES], row[2 * FEATURES + 1]]).toEqual([Math.fround(c.p), Math.fround(c.value)]);
    });
  });
});
