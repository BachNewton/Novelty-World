import { createRng } from "@/shared/lib/seeded-random";
import type { GameEvent, GameView, Seat } from "../contract";
import { referenceEngine as engine } from "../engine";
import { riskBot } from "../bots";
import type { BotInput } from "../bots/bot";
import { fromView, idx, IDS, opponentsInOrder, type Board } from "../bots/rule-v1/board";
import { tableParams } from "../bots/rule-v4";
import { forecast, incomeFrom, neighboursOf, type AimCase, type OpponentTurn } from "../bots/rule-v4/opponents";
import { readRecord } from "../bots/rule-v4/beliefs";
import { V4_PARAMS, type Params, type Preferences } from "../bots/rule-v4/params";
import { v3Forecast, v3Prefs } from "./v3-opponent-model";

// How right an opponent model is (`npm run risk:opponents`): games are played as the
// harness plays them, and at the end of every seat's turn each model under test says what
// it believes each opponent's turn before that seat's next one will do to it: how likely
// the turn goes against it (the aim), what it costs it if it does, and whom each opponent
// kills. Then the turns are played and what they did is set beside the belief. The model
// never plays: the bots at the table play as they always do, so every model is scored on
// the same turns, and a game is still a pure function of its seed and seating.

/** A model under test: what the seat `me`, at the end of its turn on `b`, believes. */
export type OpponentModelUnderTest = (b: Board, me: Seat, history: readonly GameEvent[]) => {
  turns: readonly OpponentTurn[];
  spared: readonly number[];
  /** The preferences the seat prices its losses by at this table. */
  prefs: Preferences;
};

function aliveOn(b: Board): Seat[] {
  const alive: Seat[] = [];
  for (let s = 0; s < b.players; s++) if (b.alive[s]) alive.push(s);
  return alive;
}

/** v4's opponent model, with the settings `table` (v4's own unless named). */
export function v4Model(table: Params = V4_PARAMS): OpponentModelUnderTest {
  return (b, me, history) => {
    const alive = aliveOn(b);
    const params = tableParams(table, b.players, alive.length);
    const record = readRecord(history, b.players, params.opponents.beliefs.historyDecay, me);
    return { ...forecast(b, me, params, alive, record), prefs: params.prefs };
  };
}

/** The models the tool can score, by name. */
export const OPPONENT_MODELS: Readonly<Record<string, OpponentModelUnderTest>> = {
  v3: (b, me) => {
    const alive = aliveOn(b);
    return { ...v3Forecast(b, me, alive), prefs: v3Prefs(b.players, alive.length) };
  },
  v4: v4Model(),
};

export interface OpponentSpec {
  index: number;
  seed: string;
  labels: readonly string[];
  models: readonly string[];
  maxTurns: number;
}

/** Sums, by name: every statistic the report reads is a sum, so games and workers merge by
 *  adding them. */
export type Sums = Record<string, number>;

export interface OpponentResult {
  index: number;
  sums: Sums;
  error?: string;
}

export function addSums(into: Sums, from: Readonly<Sums>): void {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

function add(sums: Sums, key: string, value: number): void {
  sums[key] = (sums[key] ?? 0) + value;
}

/** A belief about one opponent's coming turn, waiting for the turn. */
interface Pending {
  model: string;
  me: Seat;
  q: Seat;
  aimCase: AimCase;
  aim: number;
  hit: number;
  /** The aim v1 used: an even share among q's neighbouring seats. */
  even: number;
  victim: Seat | -1;
  killTaken: number;
  horizon: number;
  continentWeight: number;
}

/** What one turn did, as it was played. */
interface TurnDone {
  seat: Seat;
  /** Territories taken, by the seat they were taken from. */
  takenFrom: Map<Seat, number>;
  taken: number;
  /** Armies each seat lost defending. */
  lost: Map<Seat, number>;
  killed: Seat[];
  /** Who was still in the game as the turn began. */
  aliveBefore: boolean[];
  ownerBefore: Int8Array;
  ownerAfter: Int8Array;
}

const BINS = 10;

/** Scores every belief that waited on `turn`. */
function score(sums: Sums, players: number, labels: readonly string[], pending: Pending[], turn: TurnDone): Pending[] {
  const rest: Pending[] = [];
  for (const p of pending) {
    if (p.q !== turn.seat) {
      rest.push(p);
      continue;
    }
    const at = `${p.model}|${players.toString()}p|${labels[p.q]}`;
    const fromMe = turn.takenFrom.get(p.me) ?? 0;
    const hitMe = fromMe > 0 ? 1 : 0;
    const lost = turn.lost.get(p.me) ?? 0;
    const cost = lost + p.horizon * (incomeFrom(turn.ownerBefore, p.me, p.continentWeight) - incomeFrom(turn.ownerAfter, p.me, p.continentWeight));
    const predicted = p.aim * p.hit;
    for (const k of [`${at}|all`, `${at}|${p.aimCase}`]) {
      add(sums, `${k}|n`, 1);
      add(sums, `${k}|aim`, p.aim);
      add(sums, `${k}|even`, p.even);
      add(sums, `${k}|hit`, hitMe);
      add(sums, `${k}|aimErr`, (p.aim - hitMe) ** 2);
      add(sums, `${k}|evenErr`, (p.even - hitMe) ** 2);
      add(sums, `${k}|pred`, predicted);
      add(sums, `${k}|cost`, cost);
      add(sums, `${k}|pred2`, predicted * predicted);
      add(sums, `${k}|cost2`, cost * cost);
      add(sums, `${k}|predCost`, predicted * cost);
      add(sums, `${k}|lossErr`, (predicted - cost) ** 2);
      add(sums, `${k}|evenLossErr`, (p.even * p.hit - cost) ** 2);
      if (turn.taken > 0) {
        const share = fromMe / turn.taken;
        add(sums, `${k}|takingN`, 1);
        add(sums, `${k}|share`, share);
        add(sums, `${k}|takingAim`, p.aim);
        add(sums, `${k}|shareErr`, (p.aim - share) ** 2);
        add(sums, `${k}|evenShareErr`, (p.even - share) ** 2);
      }
    }
    if (p.aimCase === "share" && turn.taken > 0) {
      const bin = Math.min(BINS - 1, Math.floor(p.aim * BINS));
      add(sums, `${at}|bin${bin.toString()}|n`, 1);
      add(sums, `${at}|bin${bin.toString()}|aim`, p.aim);
      add(sums, `${at}|bin${bin.toString()}|hit`, fromMe / turn.taken);
    }
    if (p.victim >= 0 && !turn.aliveBefore[p.victim]) add(sums, `${at}|kill|gone`, 1);
    else if (p.victim >= 0) {
      const killed = turn.killed.includes(p.victim) ? 1 : 0;
      add(sums, `${at}|kill|n`, 1);
      add(sums, `${at}|kill|pred`, p.killTaken);
      add(sums, `${at}|kill|obs`, killed);
      add(sums, `${at}|kill|err`, (p.killTaken - killed) ** 2);
      const bin = `kbin${Math.min(BINS - 1, Math.floor(p.killTaken * BINS)).toString()}${p.victim === p.me ? "me" : ""}`;
      add(sums, `${at}|${bin}|n`, 1);
      add(sums, `${at}|${bin}|aim`, p.killTaken);
      add(sums, `${at}|${bin}|hit`, killed);
    }
    // Kills the model didn't see coming: q killed someone other than its predicted victim.
    for (const v of turn.killed) if (v !== p.victim) add(sums, `${at}|kill|unseen`, 1);
  }
  return rest;
}

/** Plays one game, scoring every model's beliefs at every turn's end. */
export function observeGame(spec: OpponentSpec): OpponentResult {
  const sums: Sums = {};
  const players = spec.labels.length;
  const bots = spec.labels.map((l) => riskBot(l));
  const started = engine.newGame({ players }, spec.seed);
  let state = started.state;
  const histories: GameEvent[][] = Array.from({ length: players }, () => []);
  let latest: (readonly GameEvent[])[] = [];
  const record = (events: readonly GameEvent[]) => {
    latest = histories.map((history, seat) => {
      const redacted = engine.redact(events, seat);
      history.push(...redacted);
      return redacted;
    });
  };
  record(started.events);
  const humans: readonly boolean[] = Array.from({ length: players }, () => false);
  const botSeed = createRng(`bots|${spec.seed}`).getState().toString(36);

  let pending: Pending[] = [];
  // Each seat's kill exposure, waiting on its next turn or its elimination.
  let pendingExposure: { model: string; me: Seat; pred: number }[] = [];
  let turn: TurnDone | null = null;
  const owner = ownerOf(engine.view(state, null));
  const alive: boolean[] = spec.labels.map(() => true);

  /** The board `seat` ended its turn on, as it saw it then: the next turn has begun, so its
   *  count of turns is one back. */
  const endBoard = (seat: Seat): Board => {
    const b = fromView(engine.view(state, seat));
    b.turn -= 1;
    return b;
  };

  const turnEnded = (ended: Seat) => {
    const b = endBoard(ended);
    if (!b.alive[ended]) return;
    for (const model of spec.models) {
      const belief = OPPONENT_MODELS[model](b, ended, histories[ended]);
      const prefs = belief.prefs;
      const opponents = opponentsInOrder(b, ended);
      for (const t of belief.turns) {
        if (!opponents.includes(t.seat)) continue;
        const seen = neighboursOf(b, t.seat);
        pending.push({
          model,
          me: ended,
          q: t.seat,
          aimCase: t.aimCase,
          aim: t.aim,
          hit: t.hit,
          even: seen.includes(ended) ? 1 / seen.length : 0,
          victim: t.victim,
          killTaken: t.killTaken,
          horizon: prefs.incomeHorizon,
          continentWeight: prefs.myContinentWeight,
        });
      }
      add(sums, `${model}|${players.toString()}p|exposure|n`, 1);
      add(sums, `${model}|${players.toString()}p|exposure|pred`, 1 - belief.spared[ended]);
      pendingExposure.push({ model, me: ended, pred: 1 - belief.spared[ended] });
    }
  };

  const onEvents = (events: readonly GameEvent[]) => {
    for (const e of events) {
      if (e.kind === "turn-started") {
        if (turn !== null) {
          turn.ownerAfter = owner.slice();
          const done = turn;
          pending = score(sums, players, spec.labels, pending, done).filter((p) => !done.killed.includes(p.me));
          turnEnded(turn.seat);
        }
        // My next turn: the exposure I believed in came to nothing.
        pendingExposure = pendingExposure.filter((x) => {
          if (x.me !== e.seat) return true;
          add(sums, `${x.model}|${players.toString()}p|exposure|err`, x.pred ** 2);
          return false;
        });
        pending = pending.filter((p) => p.me !== e.seat);
        turn = { seat: e.seat, takenFrom: new Map(), taken: 0, lost: new Map(), killed: [], aliveBefore: alive.slice(), ownerBefore: owner.slice(), ownerAfter: owner };
      } else if (turn !== null) {
        if (e.kind === "captured") {
          turn.takenFrom.set(e.from, (turn.takenFrom.get(e.from) ?? 0) + 1);
          turn.taken++;
          owner[idx(e.territory)] = e.seat;
        } else if (e.kind === "battle" || e.kind === "blitzed") {
          const defender = owner[idx(e.to)];
          turn.lost.set(defender, (turn.lost.get(defender) ?? 0) + e.defenderLosses);
        } else if (e.kind === "eliminated") {
          turn.killed.push(e.seat);
          alive[e.seat] = false;
          pendingExposure = pendingExposure.filter((x) => {
            if (x.me !== e.seat) return true;
            add(sums, `${x.model}|${players.toString()}p|exposure|obs`, 1);
            add(sums, `${x.model}|${players.toString()}p|exposure|err`, (x.pred - 1) ** 2);
            return false;
          });
        }
      }
    }
  };
  onEvents(started.events);

  try {
    let viewer: Seat | null = null;
    for (let decision = 0; ; decision++) {
      let view = engine.view(state, viewer);
      if (view.phase === "game-over" || view.turn > spec.maxTurns) break;
      const seat = view.active;
      if (seat !== viewer) {
        viewer = seat;
        view = engine.view(state, seat);
      }
      const options = engine.options(state, seat);
      if (!options) throw new Error(`seat ${seat.toString()} is to move but has no options (${view.phase})`);
      const input: BotInput = { seat, view, options, events: latest[seat], history: histories[seat], humans, seed: `${botSeed}/${decision.toString()}` };
      const result = engine.apply(state, seat, bots[seat](input));
      if (!result.ok) throw new Error(`seat ${seat.toString()}'s bot made an illegal move (${result.reason})`);
      state = result.state;
      record(result.events);
      onEvents(result.events);
    }
  } catch (e) {
    return { index: spec.index, sums: {}, error: (e as Error).message };
  }
  return { index: spec.index, sums };
}

function ownerOf(view: GameView): Int8Array {
  return Int8Array.from(IDS, (t) => view.territories[t].owner);
}
