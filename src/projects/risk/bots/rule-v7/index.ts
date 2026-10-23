import type { GameEvent, Move, Seat } from "../../contract";
import type { Bot, BotInput } from "../bot";
import { Memo, memoFor } from "../memo";
import { boardKey, fromView, IDS, type Board } from "../rule-v1/board";
import { readRecord, recordKey } from "../rule-v4/beliefs";
import { ruleBot as ruleV6, tableParams } from "../rule-v6";
import { bestPlan, plans, type Plan } from "../rule-v6/planner";
import { V7_PARAMS, type Params } from "./params";
import { nextPlacement, playReply, replyWorld, scoreEnd, searcher, searchPoint, type Placement, type SearchPoint } from "./replies";

// v7 (`ideas/rule-bot-v7.md`): v6, with the turn's plan chosen by playing v6's best few in
// imagined worlds through the opponents' next turns, instead of by v6's belief of what they
// will do. Every other decision is v6's.

const recorded = new WeakMap<Params, Memo<Params>>();

/** The settings v6 plays this position by: the table's, with this game's record of the
 *  opponents (v6's own reading, which its entry point keeps to itself). */
function v6Settings(table: Params, seat: Seat, view: BotInput["view"], history: readonly GameEvent[]): Params {
  const players = view.seats.length;
  const params = tableParams(table, players, view.seats.filter((s) => !s.eliminated).length) as Params;
  const record = readRecord(history, players, params.opponents.beliefs.historyDecay, seat);
  return memoFor(recorded, params, 8).get(`${seat.toString()}|${recordKey(record)}`, () => ({ ...params, record }));
}

function placeKey(place: Placement): string {
  return [...place].sort(([a], [b]) => a - b).map(([t, n]) => `${t.toString()}:${n.toString()}`).join(",");
}

/** v6's choice first, then its other plans by value, one per placement: two plans that place
 *  alike are one candidate, since the rest of the turn is v6's either way. */
export function candidates(b: Board, me: Seat, toPlace: number, params: Params): Plan[] {
  const chosen = bestPlan(b, me, toPlace, params);
  const ranked = plans(b, me, toPlace, params)
    .map((plan, i) => ({ plan, i }))
    .sort((x, y) => y.plan.value - x.plan.value || x.i - y.i)
    .map((x) => x.plan);
  const out: Plan[] = [];
  const seen = new Set<string>();
  for (const plan of [chosen, ...ranked]) {
    const key = placeKey(plan.place);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(plan);
    if (out.length >= params.search.candidates) break;
  }
  return out;
}

export interface SearchResult {
  candidates: Plan[];
  /** Each candidate's mean score over the replies. */
  scores: number[];
  chosen: number;
}

/** The search's own random source: the same for every placement of the phase, which each
 *  rebuilds the search from, and read from nothing the seat can't see. */
function searchSeed(point: SearchPoint, me: Seat): string {
  return `rule-v7|${me.toString()}|${point.view.turn.toString()}|${point.history.length.toString()}`;
}

/** The candidates, each played through the same replies, and the best by its mean. */
export function search(point: SearchPoint, me: Seat, table: Params, humans: readonly boolean[]): SearchResult {
  const params = v6Settings(table, me, point.view, point.history);
  const b = fromView(point.view);
  const plansToTry = candidates(b, me, point.view.armiesToPlace, params);
  const scores = plansToTry.map(() => 0);
  const { replies } = table.search;
  if (plansToTry.length > 1) {
    const s = searcher(point, me, params, humans, v6Of(table));
    const seed = searchSeed(point, me);
    for (let r = 0; r < replies; r++) {
      const reply = replyWorld(point, s, seed, r);
      plansToTry.forEach((plan, c) => (scores[c] += scoreEnd(playReply(reply, s, plan.place), s) / replies));
    }
  }
  let chosen = 0;
  for (let c = 1; c < scores.length; c++) if (scores[c] > scores[chosen]) chosen = c;
  return { candidates: plansToTry, scores, chosen };
}

const v6Bots = new WeakMap<Params, Bot>();

/** v6 on v7's settings: every decision the search doesn't make. */
function v6Of(table: Params): Bot {
  let bot = v6Bots.get(table);
  if (bot === undefined) v6Bots.set(table, (bot = ruleV6(table)));
  return bot;
}

const searches = new WeakMap<Params, Memo<Placement>>();

/** The placement the search chose at this phase's search point, remembered so the phase's later
 *  placements don't search again (rebuilding it gives the same answer, only slower). */
function chosenPlacement(point: SearchPoint, me: Seat, table: Params, humans: readonly boolean[]): Placement {
  const key = `${searchSeed(point, me)}|${point.view.armiesToPlace.toString()}|${(point.view.cards.hand ?? []).join()}|${humans.join()}|${boardKey(fromView(point.view))}`;
  return memoFor(searches, table, 16).get(key, () => {
    const result = search(point, me, table, humans);
    return result.candidates[result.chosen].place;
  });
}

export function ruleBot(table: Params): Bot {
  const v6 = v6Of(table);
  return (input): Move => {
    const { seat, view, options, history, humans } = input;
    if (table.search.replies === 0 || options.kind !== "reinforce" || !options.mayPlace) return v6(input);
    // Trading is v6's call, and it is made before the first placement, so the search point
    // comes after it.
    if (options.sets.length > 0) {
      const move = v6(input);
      if (move.kind === "trade") return move;
    }
    const point = searchPoint(view, history);
    if (point === null) return v6(input);
    const next = nextPlacement(chosenPlacement(point, seat, table, humans), point.placed);
    if (next === null) return v6(input);
    if (next.armies > options.armiesToPlace) throw new Error(`the plan places ${next.armies.toString()} with ${options.armiesToPlace.toString()} to place`);
    return { kind: "place", territory: IDS[next.territory], armies: next.armies };
  };
}

export const ruleV7Bot: Bot = ruleBot(V7_PARAMS);
