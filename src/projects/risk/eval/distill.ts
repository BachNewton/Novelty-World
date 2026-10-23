import type { GameEvent, GameView, Move, Seat } from "../contract";
import type { Bot, BotInput } from "../bots/bot";
import { riskBot } from "../bots";
import { fromView, IDS, type Board } from "../bots/rule-v1/board";
import type { Shape } from "../bots/rule-v1/cards";
import { readRecord } from "../bots/rule-v4/beliefs";
import { failureBoard, placed, successBoard } from "../bots/rule-v4/planner";
import { ruleBot as ruleV6, tableParams } from "../bots/rule-v6";
import { breakdown, type Breakdown } from "../bots/rule-v6/evaluate";
import type { Plan } from "../bots/rule-v6/planner";
import type { CapturePlan } from "../bots/rule-v6/routes";
import { candidates, type SearchResult } from "../bots/rule-v7";
import { V7_PARAMS, type Params } from "../bots/rule-v7/params";
import { nextPlacement, playReply, replyWorld, scoreEnd, searcher, searchPoint, type Placement, type SearchPoint } from "../bots/rule-v7/replies";
import { features, FEATURES } from "../bots/rule-v8/features";
import { playGame, type RiskGameResult, type RiskGameSpec } from "./runner";

// The teacher recorder (`npm run risk:record -- --teacher rule-v7`): the data for distilling
// rule-v7's placement search into a cheap student (`ideas/distilled-v7.md`). It plays mixed-field
// games with v7 in one or more seats, and at each of v7's turn-start searches over more than one
// candidate keeps the candidates (each v6's plan, with the boards v6 valued it on), v7's mean
// score for each, and v7's pick. Everything a record holds is built from the v7 seat's own view
// and history, as the bot builds its search.
//
// v7 plays through `teacherBot`, v7's own control flow on its exported pieces, so the search it
// runs is the one the record keeps, run once: asking the registered bot would search a second
// time. The search is v7's too (`teacherSearch`), rebuilt from the same pieces so it can keep each
// reply's score as well as their mean. Tests hold both to v7's: its moves, and its search's
// candidates, scores and pick.

/** The field the teacher plays among by default: v6, v5 and two of GD's personas. */
export const DEFAULT_TEACHER_FIELD: readonly string[] = ["rule-v6", "rule-v5", "gd-stacker", "gd-aggressive"];

/** v7's settings for a teacher label: `rule-v7`, or `rule-v7~{"replies":32,"candidates":6}`
 *  with any of its search knobs moved (`mixed` is 0 or 1). */
export function teacherParams(label: string): Params {
  if (label === "rule-v7") return V7_PARAMS;
  const prefix = "rule-v7~";
  if (!label.startsWith(prefix)) throw new Error(`the teacher is rule-v7, at any search setting, not "${label}"`);
  const search = { ...V7_PARAMS.search };
  for (const [key, value] of Object.entries(JSON.parse(label.slice(prefix.length)) as Record<string, unknown>)) {
    if (!Object.hasOwn(search, key)) throw new Error(`the teacher's settings are its search knobs (${Object.keys(search).join(", ")}), not "${key}"`);
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`the teacher's "${key}" is a whole number, not ${String(value)}`);
    search[key as keyof typeof search] = value;
  }
  return { ...V7_PARAMS, search };
}

export const isTeacher = (label: string) => label === "rule-v7" || label.startsWith("rule-v7~");

/** The settings v6 plays the search point by, as v7's search reads them: the table's for the
 *  seats alive, with this game's record of who took from whom. */
export function v6Settings(table: Params, seat: Seat, view: GameView, history: readonly GameEvent[]): Params {
  const players = view.seats.length;
  const params = tableParams(table, players, view.seats.filter((s) => !s.eliminated).length) as Params;
  const record = readRecord(history, players, params.opponents.beliefs.historyDecay, seat);
  return { ...params, record };
}

/** A board as a record keeps it. */
export interface BoardRecord {
  order: Seat[];
  owner: number[];
  armies: number[];
  alive: boolean[];
  hands: number[];
  /** The symbols of the seat's own cards it knows (`Board.known`). */
  known: number[];
  cardEarned: boolean;
  turn: number;
}

/** v6's breakdown of a board, as a record keeps it. */
export type BreakdownRecord = Omit<Breakdown, "power" | "spared"> & { power: number[]; spared: number[] };

export function boardRecord(b: Board): BoardRecord {
  return {
    order: [...b.order],
    owner: Array.from(b.owner),
    armies: Array.from(b.armies),
    alive: b.alive.slice(),
    hands: b.handSize.slice(),
    known: [...b.known],
    cardEarned: b.cardEarned,
    turn: b.turn,
  };
}

export function recordedBoard(r: BoardRecord): Board {
  return {
    order: r.order,
    players: r.order.length,
    owner: Int8Array.from(r.owner),
    armies: Int32Array.from(r.armies),
    alive: r.alive.slice(),
    handSize: r.hands.slice(),
    known: [r.known[0], r.known[1], r.known[2], r.known[3]] satisfies Shape,
    cardEarned: r.cardEarned,
    turn: r.turn,
  };
}

function breakdownRecord(bd: Breakdown): BreakdownRecord {
  return { ...bd, power: [...bd.power], spared: [...bd.spared] };
}

/** One of v6's plans as a candidate of the search: its placement, the boards v6 valued it on
 *  (the turn's end if it takes everything, and if it falls short in its likeliest way; both the
 *  placed board for a hold), its success chance and v6's value for it. */
export interface CandidateRecord {
  kind: Plan["kind"];
  /** Armies to place, as [territory index, armies], by territory. */
  place: [number, number][];
  p: number;
  value: number;
  success: BoardRecord;
  failure: BoardRecord;
  successV6: BreakdownRecord;
  failureV6: BreakdownRecord;
}

/** One search of v7's: where it was, its candidates (v6's own choice first), v7's mean score for
 *  each over the replies, and the one it chose. */
export interface Decision {
  turn: number;
  seat: Seat;
  candidates: CandidateRecord[];
  scores: number[];
  chosen: number;
  /** Each candidate's score in each reply, of which `scores` is the mean: the replies are
   *  independent draws, so two halves of them are two independent readings of v7's judgement. */
  replyScores: number[][];
}

/** A decision as it is written, with the game it came from. */
export interface DecisionRecord extends Decision {
  game: number;
  seed: string;
  labels: readonly string[];
  players: number;
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

const round = (x: number) => Number(x.toPrecision(6));

function candidateRecord(b: Board, me: Seat, plan: Plan, params: Params): CandidateRecord {
  const { p, success, failure } = planBoards(b, me, plan);
  return {
    kind: plan.kind,
    place: [...plan.place].sort(([x], [y]) => x - y),
    p: round(p),
    value: round(plan.value),
    success: boardRecord(success),
    failure: boardRecord(failure),
    successV6: breakdownRecord(breakdown(success, me, params)),
    failureV6: breakdownRecord(breakdown(failure, me, params)),
  };
}

/** v7's search (`search` in `rule-v7/index.ts`), the same candidates played through the same
 *  replies and summed in the same order, keeping each reply's score. */
export function teacherSearch(point: SearchPoint, me: Seat, table: Params, humans: readonly boolean[]): SearchResult & { replyScores: number[][] } {
  const params = v6Settings(table, me, point.view, point.history);
  const plansToTry = candidates(fromView(point.view), me, point.view.armiesToPlace, params);
  const scores = plansToTry.map(() => 0);
  const replyScores = plansToTry.map((): number[] => []);
  const { replies } = table.search;
  if (plansToTry.length > 1) {
    const s = searcher(point, me, params, humans, ruleV6(table));
    const seed = `rule-v7|${me.toString()}|${point.view.turn.toString()}|${point.history.length.toString()}`;
    for (let r = 0; r < replies; r++) {
      const reply = replyWorld(point, s, seed, r);
      plansToTry.forEach((plan, c) => {
        const score = scoreEnd(playReply(reply, s, plan.place), s);
        replyScores[c].push(score);
        scores[c] += score / replies;
      });
    }
  }
  let chosen = 0;
  for (let c = 1; c < scores.length; c++) if (scores[c] > scores[chosen]) chosen = c;
  return { candidates: plansToTry, scores, chosen, replyScores };
}

/** The record of a search v7 ran at `point`. */
export function decisionOf(point: SearchPoint, me: Seat, table: Params, result: SearchResult & { replyScores: number[][] }): Decision {
  const params = v6Settings(table, me, point.view, point.history);
  const b = fromView(point.view);
  return {
    turn: point.view.turn,
    seat: me,
    candidates: result.candidates.map((plan) => candidateRecord(b, me, plan, params)),
    scores: result.scores.slice(),
    chosen: result.chosen,
    replyScores: result.replyScores,
  };
}

/** The search point this input places from, or null where v7 plays v6's move: outside a
 *  turn's own reinforce phase, while a trade must come first, and for v6's own trade. */
function searchInput(input: BotInput, table: Params, v6: Bot): { point: SearchPoint } | { move: Move } {
  const { view, options, history } = input;
  if (table.search.replies === 0 || options.kind !== "reinforce" || !options.mayPlace) return { move: v6(input) };
  if (options.sets.length > 0) {
    const move = v6(input);
    if (move.kind === "trade") return { move };
  }
  const point = searchPoint(view, history);
  return point === null ? { move: v6(input) } : { point };
}

/** The decision v7 makes at this input, or null where it makes none (v6 plays, or the search
 *  has one candidate). A function of the input alone. */
export function teacherDecision(input: BotInput, table: Params): Decision | null {
  const at = searchInput(input, table, ruleV6(table));
  if ("move" in at) return null;
  const result = teacherSearch(at.point, input.seat, table, input.humans);
  return result.candidates.length > 1 ? decisionOf(at.point, input.seat, table, result) : null;
}

/** v7 on `table`, move for move, telling `onDecision` of each search it runs over more than one
 *  candidate. Each seat gets a bot of its own: it remembers the phase's chosen placement between
 *  the phase's placements, as v7 does. */
export function teacherBot(table: Params, onDecision: (decision: Decision) => void): Bot {
  const v6 = ruleV6(table);
  let phase: { key: string; place: Placement } | null = null;
  return (input): Move => {
    const at = searchInput(input, table, v6);
    if ("move" in at) return at.move;
    const { point } = at;
    const { seat, options } = input;
    const key = `${point.view.turn.toString()}|${point.history.length.toString()}|${point.view.armiesToPlace.toString()}|${(point.view.cards.hand ?? []).join()}`;
    if (phase?.key !== key) {
      const result = teacherSearch(point, seat, table, input.humans);
      if (result.candidates.length > 1) onDecision(decisionOf(point, seat, table, result));
      phase = { key, place: result.candidates[result.chosen].place };
    }
    const next = nextPlacement(phase.place, point.placed);
    if (next === null) return v6(input);
    if (options.kind !== "reinforce" || next.armies > options.armiesToPlace) throw new Error(`the plan places ${next.armies.toString()} past what the seat may place`);
    return { kind: "place", territory: IDS[next.territory], armies: next.armies };
  };
}

/** Games `from` to `from + count − 1` of a teacher recording, each seeded `${prefix}-${index + 1}`:
 *  game i seats the teacher at seats i to i + teachers − 1 (mod players), and the field in the
 *  other seats in rotation, the m-th of them taking bot (i + m) mod F, so over a run of games
 *  every bot sits in every seat. */
export function teacherSpecs(
  teacher: string,
  teachers: number,
  field: readonly string[],
  players: number,
  prefix: string,
  from: number,
  count: number,
  maxTurns: number,
): RiskGameSpec[] {
  if (!(Number.isInteger(teachers) && teachers >= 1 && teachers <= players)) throw new Error(`a game seats 1 to ${players.toString()} teachers, not ${teachers.toString()}`);
  if (teachers < players && field.length === 0) throw new Error("a teacher recording needs a field of at least one bot");
  if (field.some(isTeacher)) throw new Error("the field can't seat rule-v7: every v7 seat is a teacher (--teachers)");
  return Array.from({ length: count }, (_, k) => {
    const index = from + k;
    const labels: string[] = [];
    let m = 0;
    for (let seat = 0; seat < players; seat++) {
      const fromTeacher = (seat - (index % players) + players) % players;
      labels.push(fromTeacher < teachers ? teacher : field[(index + m++) % field.length]);
    }
    return { index, seed: `${prefix}-${(index + 1).toString()}`, labels, maxTurns };
  });
}

export interface TeacherGameResult extends RiskGameResult {
  searches: Decision[];
}

/** Plays a spec, its teacher seats played by `teacherBot`, keeping every search they ran. A game
 *  that throws comes back as an error with no searches, as `runSpec`'s do. */
export function recordTeacherGame(spec: RiskGameSpec): TeacherGameResult {
  const base = { index: spec.index, seed: spec.seed, labels: spec.labels };
  const searches: Decision[] = [];
  const bots = spec.labels.map((label) => (isTeacher(label) ? teacherBot(teacherParams(label), (d) => searches.push(d)) : riskBot(label)));
  try {
    return { ...base, ...playGame({ seed: spec.seed, bots, maxTurns: spec.maxTurns }), searches };
  } catch (e) {
    return { ...base, winner: null, places: [], turns: 0, decisions: 0, searches: [], error: (e as Error).message };
  }
}

/** A game's searches as written, each with its game. */
export function decisionRecords(result: TeacherGameResult): DecisionRecord[] {
  const game = { game: result.index, seed: result.seed, labels: result.labels, players: result.labels.length };
  return result.searches.map((d) => ({ ...game, ...d }));
}

/** The width of a candidate's training row: its success board's features, its failure board's,
 *  its success chance and v6's value for it. */
export const CANDIDATE_WIDTH = 2 * FEATURES + 2;

/** A decision's training rows (`npm run risk:features -- --teacher`), one per candidate, read
 *  through rule-v8's feature function. */
export function candidateRows(r: Pick<Decision, "seat" | "candidates">): Float32Array {
  const x = new Float32Array(r.candidates.length * CANDIDATE_WIDTH);
  r.candidates.forEach((c, i) => {
    const at = i * CANDIDATE_WIDTH;
    x.set(features(recordedBoard(c.success), r.seat, c.successV6), at);
    x.set(features(recordedBoard(c.failure), r.seat, c.failureV6), at + FEATURES);
    x[at + 2 * FEATURES] = c.p;
    x[at + 2 * FEATURES + 1] = c.value;
  });
  return x;
}
