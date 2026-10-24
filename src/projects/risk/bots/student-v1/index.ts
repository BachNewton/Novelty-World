import type { Move, Seat } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { Memo } from "../memo";
import { boardKey, fromView, IDS } from "../rule-v1/board";
import { ruleBot as ruleV6 } from "../rule-v6";
import type { Plan } from "../rule-v6/planner";
import { candidates } from "../rule-v7";
import { V7_PARAMS, type Params } from "../rule-v7/params";
import { nextPlacement, searchPoint, type Placement, type SearchPoint } from "../rule-v7/replies";
import { SLOTS } from "../rule-v8/features";
import { CANDIDATE_WIDTH, candidateInputs, v6Settings, writeCandidateRow } from "./candidates";
import { pick, scorer, type Scorer } from "./network";
import { WEIGHT_SETS } from "./weights";

// student-v1 (`ideas/student-v1.md`): v6, with the turn's plan chosen among the candidates v7
// would search (`candidates` in `rule-v7/index.ts`), at the same decision points, by a small
// network trained on v7's scores for them (`ideas/distilled-v7.md`) instead of by playing them
// out. Every other decision is v6's, and so is the plan whenever the network ranks v6's own
// choice first.

/** The weight set the plain label plays. */
export const DEFAULT_WEIGHTS = "pilot";

/** The candidates v7 would search at `point`, v6's own choice first, and each one's row. */
export function decisionRows(point: SearchPoint, me: Seat, table: Params): { plans: Plan[]; rows: Float32Array } {
  const params = v6Settings(table, me, point.view, point.history);
  const b = fromView(point.view);
  const plans = candidates(b, me, point.view.armiesToPlace, params);
  const rows = new Float32Array(plans.length * CANDIDATE_WIDTH);
  plans.forEach((plan, i) => writeCandidateRow(rows, i * CANDIDATE_WIDTH, me, candidateInputs(b, me, plan, params)));
  return { plans, rows };
}

/** The search point this input places from, or null where v6 plays it: outside a turn's own
 *  reinforce phase, at v6's own trade, and with more seats alive than the network has slots
 *  for (a 6-player table's start), where it never saw a board. */
function placingPoint(input: BotInput, v6: Bot): SearchPoint | { move: Move } {
  const { view, options, history } = input;
  if (options.kind !== "reinforce" || !options.mayPlace) return { move: v6(input) };
  if (view.seats.filter((s) => !s.eliminated).length > SLOTS) return { move: v6(input) };
  if (options.sets.length > 0) {
    const move = v6(input);
    if (move.kind === "trade") return { move };
  }
  return searchPoint(view, history) ?? { move: v6(input) };
}

/** The student on `table` (v7's settings, of which it reads v6's and the candidates' count),
 *  ranking the candidates by `score`. */
export function studentBot(table: Params, score: Scorer): Bot {
  const v6 = ruleV6(table);
  // The placement chosen at a phase's search point, or null for v6's own, remembered so the
  // phase's later placements don't rank it again (ranking it again gives the same answer).
  const chosen = new Memo<{ place: Placement | null }>(16);
  return (input): Move => {
    const at = placingPoint(input, v6);
    if ("move" in at) return at.move;
    const { seat, options } = input;
    const key = `${seat.toString()}|${at.view.turn.toString()}|${at.history.length.toString()}|${at.view.armiesToPlace.toString()}|${(at.view.cards.hand ?? []).join()}|${boardKey(fromView(at.view))}`;
    const { place } = chosen.get(key, () => {
      const { plans, rows } = decisionRows(at, seat, table);
      const best = plans.length > 1 ? pick(score(rows)) : 0;
      return { place: best === 0 ? null : plans[best].place };
    });
    if (place === null) return v6(input);
    const next = nextPlacement(place, at.placed);
    if (next === null) return v6(input);
    if (options.kind !== "reinforce" || next.armies > options.armiesToPlace) throw new Error(`the plan places ${next.armies.toString()} past what the seat may place`);
    return { kind: "place", territory: IDS[next.territory], armies: next.armies };
  };
}

/** The student with a named weight set. */
export function studentV1(weights: string): Bot {
  if (!Object.hasOwn(WEIGHT_SETS, weights)) throw new Error(`no student-v1 weight set "${weights}" (known: ${Object.keys(WEIGHT_SETS).join(", ")})`);
  return studentBot(V7_PARAMS, scorer(WEIGHT_SETS[weights]));
}

export const studentV1Bot: Bot = studentV1(DEFAULT_WEIGHTS);
