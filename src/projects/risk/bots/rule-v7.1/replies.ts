import { createRng } from "@/shared/lib/seeded-random";
import type { GameEvent, GameView, Move, Seat } from "../../contract";
import { buildWorld, sampleHidden, type HiddenCards, type World } from "../../sim";
import type { Bot } from "../bot";
import { gdAggressiveBot } from "../gd";
import { greedyBot } from "../greedy";
import { ruleV6_1Bot } from "../rule-v6.1";
import { inEffect } from "../rule-v6.1/params";
import { pricedArmies } from "../rule-v6.1/score";
import { armiesOf, boardIncome, CONTINENT_BONUS, countOf, fromView, holdsContinent, idx, IDS, type Board } from "../rule-v1/board";
import { CARD_WORTH, DRAW_CHANCE } from "../rule-v1/cards";
import { hiddenCards, myCards } from "../rule-v4/worth";
import type { Params } from "./params";

// v7's replies (`rule-v7/replies.ts`, `ideas/rule-bot-v7.md`) on v6.1: a candidate plan played
// forward in imagined worlds, its placement as real moves, the rest of my turn by v6.1, then each
// opponent's turn by a reply bot, to the start of my next turn, where the board is scored on the
// power v6.1 prices. Copied whole for those three changes: v6.1 for v6 in my own play and the
// reply bots, and the standing's armies at v6.1's price.

/** Armies to place, by territory index. */
export type Placement = ReadonlyMap<number, number>;

/** Where the turn's plan is chosen: the turn's own reinforce phase as it stood before its first
 *  placement, which every placement of the phase can rebuild from its own view and history. */
export interface SearchPoint {
  view: GameView;
  history: readonly GameEvent[];
  /** What the phase has placed since, by territory index. */
  placed: Map<number, number>;
}

/** The search point of the reinforce phase in progress, or null outside the turn's own one (an
 *  elimination's forced trade mid-attack is v6.1's alone). */
export function searchPoint(view: GameView, history: readonly GameEvent[]): SearchPoint | null {
  let at = history.length - 1;
  while (at >= 0 && history[at].kind !== "phase") at--;
  const phase = history[at] as GameEvent | undefined;
  if (phase?.kind !== "phase" || phase.phase !== "reinforce" || phase.rule === "ELIM-3" || view.phase !== "reinforce") return null;
  const placed = new Map<number, number>();
  let first = -1;
  for (let i = at + 1; i < history.length; i++) {
    const e = history[i];
    if (e.kind !== "placed") continue;
    if (first < 0) first = i;
    placed.set(idx(e.territory), (placed.get(idx(e.territory)) ?? 0) + e.armies);
  }
  if (first < 0) return { view, history, placed };
  let total = 0;
  const territories = { ...view.territories };
  for (const [t, armies] of placed) {
    total += armies;
    territories[IDS[t]] = { owner: territories[IDS[t]].owner, armies: territories[IDS[t]].armies - armies };
  }
  const seats = view.seats.map((s) => (s.seat === view.active ? { ...s, armies: s.armies - total } : s));
  return { view: { ...view, territories, seats, armiesToPlace: view.armiesToPlace + total }, history: history.slice(0, first), placed };
}

/** The next placement of a plan, its biggest allocation still to place (as v6 places), or null
 *  once the plan has placed everything. */
export function nextPlacement(place: Placement, placed: ReadonlyMap<number, number>): { territory: number; armies: number } | null {
  let best: { territory: number; armies: number } | null = null;
  for (const [territory, planned] of place) {
    const armies = planned - (placed.get(territory) ?? 0);
    if (armies < 0) throw new Error(`placed more on territory ${IDS[territory]} than the plan did`);
    if (armies > 0 && (best === null || armies > best.armies || (armies === best.armies && territory < best.territory))) best = { territory, armies };
  }
  for (const t of placed.keys()) if (!place.has(t)) throw new Error(`placed on territory ${IDS[t]}, which the plan doesn't`);
  return best;
}

/** My standing at the start of my turn: my share of everyone's power, less v6's charge for a
 *  runaway leader. The replies have played the opponents' turns that v6's opponent model
 *  forecasts, and I move before anyone does from here, so none of the model's forecast terms
 *  (kill exposure, border losses, next turn's kill) are counted again. Where v6.1's settings are in
 *  effect with `power` "armies", every seat's armies count at v6.1's price (mine at `armyBeyond`
 *  past the cap, a rival's at `rivalBeyond`) and the threat's bar is scaled by `threatScale`, so
 *  the search scores the board as the plans it chooses between were scored. */
export function standing(b: Board, me: Seat, params: Params): number {
  const prefs = params.prefs;
  const alive: Seat[] = [];
  for (let s = 0; s < b.players; s++) if (b.alive[s]) alive.push(s);
  if (!b.alive[me]) return 0;
  if (alive.length === 1) return 1;
  const settings = inEffect(params, b.players, alive.length);
  const priced = settings?.power === "armies" ? settings : null;
  const armiesAt = (p: Seat) => {
    const armies = armiesOf(b, p);
    if (priced === null) return armies;
    const beyond = p === me || priced.rivalBeyond < 0 ? priced.armyBeyond : priced.rivalBeyond;
    return pricedArmies(armies, boardIncome(b, p), priced.armyRounds, beyond);
  };
  const H = prefs.incomeHorizon;
  const power = new Array<number>(b.players).fill(0);
  let total = 0;
  for (const p of alive) {
    let income = Math.max(3, Math.floor(countOf(b, p) / 3));
    for (let c = 0; c < CONTINENT_BONUS.length; c++) {
      if (holdsContinent(b, p, c)) income += CONTINENT_BONUS[c] * (p === me ? prefs.myContinentWeight : 1);
    }
    const cards = p === me ? prefs.myCardWeight * myCards(b, me) : hiddenCards(b.handSize[p]);
    power[p] = armiesAt(p) + H * (income + DRAW_CHANCE * CARD_WORTH) + cards;
    total += power[p];
  }
  const ratio = (params.opponents.leaderRatio + params.opponents.leaderRatioPerPlayer * (alive.length - 4)) * (priced?.threatScale ?? 1);
  let threat: Seat | null = null;
  for (const p of alive) if (alive.every((q) => q === p || power[p] > ratio * power[q])) threat = p;
  let value = power[me] / total;
  if (threat !== null) {
    let next = 0;
    for (const p of alive) if (p !== threat) next = Math.max(next, power[p]);
    const weight = threat === me ? prefs.leadPenaltyWeight : prefs.commonThreatWeight;
    value -= (weight * (power[threat] - ratio * next)) / total;
  }
  return value;
}

/** The bots a reply's opponents are drawn from, by weight. v6.1 is the strongest model of a good
 *  player; GD's Aggressive persona and greedy attack wherever they are bigger, the sweeping
 *  play v6's model underrates. A new persona joins by a line here. */
const MIX: readonly { bot: Bot; weight: number }[] = [
  { bot: ruleV6_1Bot, weight: 2 },
  { bot: gdAggressiveBot, weight: 1 },
  { bot: greedyBot, weight: 1 },
];
const MIX_WEIGHT = MIX.reduce((sum, m) => sum + m.weight, 0);

/** Each seat's reply bot in reply `r`, drawn from the search's seed. */
export function replyBots(players: number, me: Seat, mixed: boolean, seed: string): (Bot | null)[] {
  const rng = createRng(`${seed}|bots`);
  return Array.from({ length: players }, (_, s) => {
    if (s === me) return null;
    if (!mixed) return ruleV6_1Bot;
    let x = rng.next() * MIX_WEIGHT;
    for (const m of MIX) {
      x -= m.weight;
      if (x < 0) return m.bot;
    }
    return MIX[MIX.length - 1].bot;
  });
}

/** `events` as `viewer` sees them: cards others drew lose their face, as the engine redacts. */
function redactFor(events: readonly GameEvent[], viewer: Seat): GameEvent[] {
  return events.map((e) => (e.kind === "card-drawn" && e.seat !== viewer && e.card !== undefined ? { rule: e.rule, kind: e.kind, seat: e.seat } : e));
}

/** One imagined world of a search, the same for every candidate, so plans are compared on the
 *  same guess at the hidden cards, the same dice and the same reply bots. */
export interface Reply {
  world: World;
  bots: readonly (Bot | null)[];
  seed: string;
}

/** What scores the board at a reply's end, from my view there: the one place a learned
 *  evaluation would replace the standing. */
export type Leaf = (view: GameView, me: Seat, params: Params) => number;

export const standingLeaf: Leaf = (view, me, params) => standing(fromView(view), me, params);

/** Where a reply's guess at the hidden cards comes from: the one place a better-informed source
 *  (card odds read from the trades) would replace a uniform deal. */
export type Guess = (view: GameView, history: readonly GameEvent[], seed: string) => HiddenCards;

export interface Searcher {
  me: Seat;
  params: Params;
  leaf: Leaf;
  guess: Guess;
  humans: readonly boolean[];
  /** My own play after the placement: v6.1's, on my settings. */
  mine: Bot;
  /** The search point's history as each seat sees it. */
  histories: readonly (readonly GameEvent[])[];
}

/** A search's shared inputs, from its search point. */
export function searcher(point: SearchPoint, me: Seat, params: Params, humans: readonly boolean[], mine: Bot): Searcher {
  const histories = point.view.seats.map((s) => (s.seat === me ? point.history : redactFor(point.history, s.seat)));
  return { me, params, leaf: standingLeaf, guess: sampleHidden, humans, mine, histories };
}

/** Reply `r`'s world: hidden cards and dice drawn from the search's seed, never the game's. */
export function replyWorld(point: SearchPoint, s: Searcher, seed: string, r: number): Reply {
  const at = `${seed}|${r.toString()}`;
  const hidden = s.guess(point.view, point.history, `${at}|cards`);
  return {
    world: buildWorld(point.view, point.history, hidden, `${at}|dice`),
    bots: replyBots(point.view.seats.length, s.me, s.params.search.mixed === 1, at),
    seed: at,
  };
}

/** A reply can't run on: no game of Risk takes this many decisions for one round. */
const MOST_DECISIONS = 20_000;

/** The reply's end: the world at the start of my next turn, or null if the game ended first
 *  (`won` says whether I won it). */
export interface ReplyEnd {
  world: World | null;
  won: boolean;
  decisions: number;
}

/** Plays `place` and then the round to my next turn in the reply's world. */
export function playReply(reply: Reply, s: Searcher, place: Placement): ReplyEnd {
  const { me } = s;
  let world = reply.world;
  const histories = s.histories.map((h) => [...h]);
  let latest: GameEvent[] = [];
  const placed = new Map<number, number>();
  let active = me;
  let ownReinforce = true;
  for (let decision = 0; decision < MOST_DECISIONS; decision++) {
    const view = world.view(active);
    const options = world.options(active);
    if (options === null) throw new Error(`seat ${active.toString()} is to move in a reply but has no options`);
    let move: Move | null = null;
    if (active === me && ownReinforce && options.kind === "reinforce" && options.mayPlace) {
      const next = nextPlacement(place, placed);
      if (next !== null) {
        move = { kind: "place", territory: IDS[next.territory], armies: next.armies };
        placed.set(next.territory, (placed.get(next.territory) ?? 0) + next.armies);
      }
    }
    if (move === null) {
      const bot = active === me ? s.mine : reply.bots[active];
      if (bot === null) throw new Error("a reply has no bot for an opponent");
      move = bot({
        seat: active,
        view,
        options,
        events: redactFor(latest, active),
        history: histories[active],
        humans: s.humans,
        seed: `${reply.seed}|${decision.toString()}`,
      });
    }
    const result = world.apply(active, move);
    if (!result.ok) throw new Error(`seat ${active.toString()}'s bot made an illegal move in a reply (${result.reason}): ${JSON.stringify(move)}`);
    world = result.world;
    latest = [...result.events];
    histories.forEach((h, seat) => h.push(...redactFor(latest, seat)));
    for (const e of latest) {
      if (e.kind === "game-over") return { world: null, won: e.winner === me, decisions: decision + 1 };
      if (e.kind === "eliminated" && e.seat === me) return { world: null, won: false, decisions: decision + 1 };
      if (e.kind === "phase" && e.phase !== "reinforce") ownReinforce = false;
      if (e.kind === "turn-started") {
        if (e.seat === me) return { world, won: false, decisions: decision + 1 };
        active = e.seat;
      }
    }
  }
  throw new Error(`a reply passed ${MOST_DECISIONS.toString()} decisions without reaching my next turn`);
}

/** What a reply's end is worth to me. */
export function scoreEnd(end: ReplyEnd, s: Searcher): number {
  if (end.world === null) return end.won ? 1 : 0;
  return s.leaf(end.world.view(s.me), s.me, s.params);
}
