import type { GameEvent, GameView, Seat } from "../../contract";
import type { Board } from "../rule-v1/board";
import { readRecord } from "../rule-v4/beliefs";
import { failureBoard, placed, successBoard } from "../rule-v4/planner";
import { tableParams } from "../rule-v6";
import { breakdown, type Breakdown } from "../rule-v6/evaluate";
import type { Plan } from "../rule-v6/planner";
import type { CapturePlan } from "../rule-v6/routes";
import type { Params } from "../rule-v7/params";
import { features, FEATURES } from "../rule-v8/features";

// What the distilled student reads of one of v7's candidates (`ideas/distilled-v7.md`): the one
// definition of a candidate's row. The student builds its rows through it at play time, and the
// teacher recorder (`eval/distill.ts`) and its features step build the training rows through it,
// so the network is never fed a row built another way.

/** The settings v6 plays a search point by, as v7's search reads them: the table's for the seats
 *  alive, with this game's record of who took from whom. */
export function v6Settings(table: Params, seat: Seat, view: GameView, history: readonly GameEvent[]): Params {
  const players = view.seats.length;
  const params = tableParams(table, players, view.seats.filter((s) => !s.eliminated).length) as Params;
  const record = readRecord(history, players, params.opponents.beliefs.historyDecay, seat);
  return { ...params, record };
}

/** v4's carrying, as v6's planner applies it to a capture's success board: armies placed on a
 *  launch stack beyond what its routes were costed with march with its first route. The
 *  planner keeps it to itself, and a seated bot's code stays as it is. */
function carrying(b: Board, after: Board, cp: CapturePlan): CapturePlan {
  const spare = new Map<number, number>();
  cp.routes.forEach((r, i) => spare.set(r.source, (spare.get(r.source) ?? after.armies[r.source] - b.armies[r.source]) - cp.alloc[i]));
  const arrive = cp.routes.map((r, i) => {
    const extra = Math.max(0, spare.get(r.source) ?? 0);
    spare.delete(r.source);
    return cp.arrive[i] + extra;
  });
  return { ...cp, arrive };
}

/** The boards v6's planner values a plan on, and the chance it succeeds. A sweep's success is
 *  scored on its plan as it stands; every other capture's with its leftover armies carried. */
export function planBoards(b: Board, me: Seat, plan: Plan): { p: number; success: Board; failure: Board } {
  const after = placed(b, plan.place);
  const cp = plan.capture;
  if (cp === null) return { p: 1, success: after, failure: after };
  const run = plan.kind === "sweep" ? cp : carrying(b, after, cp);
  return { p: cp.pSuccess, success: successBoard(after, me, run), failure: failureBoard(after, me, cp) };
}

/** A candidate as the row reads it: the boards v6 valued it on (the turn's end if it takes
 *  everything, and if it falls short in its likeliest way; both the placed board for a hold),
 *  v6's breakdown of each, its success chance and v6's value for it. */
export interface CandidateInputs {
  p: number;
  value: number;
  success: Board;
  failure: Board;
  successV6: Breakdown;
  failureV6: Breakdown;
}

/** The recording keeps the chance and the value to six figures, so the student reads them so. */
const round = (x: number) => Number(x.toPrecision(6));

/** What the row reads of `plan`, one of `me`'s candidates on `b`, on v6's settings there. */
export function candidateInputs(b: Board, me: Seat, plan: Plan, params: Params): CandidateInputs {
  const { p, success, failure } = planBoards(b, me, plan);
  return {
    p: round(p),
    value: round(plan.value),
    success,
    failure,
    successV6: breakdown(success, me, params),
    failureV6: breakdown(failure, me, params),
  };
}

/** The width of a candidate's row: its success board's features, its failure board's, its
 *  success chance and v6's value for it. */
export const CANDIDATE_WIDTH = 2 * FEATURES + 2;

/** Writes a candidate's row into `x` from `at`, its boards read through rule-v8's feature
 *  function for `me`. */
export function writeCandidateRow(x: Float32Array, at: number, me: Seat, c: CandidateInputs): void {
  x.set(features(c.success, me, c.successV6), at);
  x.set(features(c.failure, me, c.failureV6), at + FEATURES);
  x[at + 2 * FEATURES] = c.p;
  x[at + 2 * FEATURES + 1] = c.value;
}
