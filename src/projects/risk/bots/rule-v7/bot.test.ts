import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import type { GameEvent, GameState, Move, Seat } from "../../contract";
import { referenceEngine as engine } from "../../engine";
import { inside } from "../../engine/test-kit";
import type { EngineState } from "../../engine/state";
import type { Bot, BotInput } from "../bot";
import { greedyBot } from "../greedy";
import { ruleBot as ruleV6, ruleV6Bot } from "../rule-v6";
import { bestPlan } from "../rule-v6/planner";
import { fromView, idx } from "../rule-v1/board";
import { ruleBot } from ".";
import { V7_PARAMS, type Params } from "./params";
import { nextPlacement, playReply, replyWorld, scoreEnd, searcher, searchPoint, standing } from "./replies";

// v7 as a player (v6's checks, on real histories, which a world is built from): a function of its
// input alone, and that input only what its seat may see; `legal.slow.test.ts` plays it a whole
// game. Then the replies' own pieces.

/** A cheap v7: one reply over two candidates, still the whole loop. Each call builds a new bot
 *  with settings of its own, so nothing one remembers answers for another. */
const cheap = (): Bot => ruleBot({ ...V7_PARAMS, search: { replies: 1, candidates: 2, mixed: 1 } } satisfies Params);

interface Moment {
  state: GameState;
  input: BotInput;
  step: number;
}

function inputFor(state: GameState, seat: Seat, history: readonly GameEvent[], seed: string): BotInput {
  const options = engine.options(state, seat);
  if (!options) throw new Error(`seat ${seat.toString()} has no options`);
  const view = engine.view(state, seat);
  return { seat, view, options, events: [], history, humans: view.seats.map(() => false), seed };
}

/** Plays `bots` from `seed` with every seat's redacted history kept as the runner keeps it,
 *  `visit` seeing each decision and its move before it is applied, until the game ends, `steps`
 *  pass, or `visit` returns true. */
function walk(seed: string, bots: readonly Bot[], steps: number, visit: (m: Moment, move: Move) => boolean | void): void {
  const started = engine.newGame({ players: bots.length }, seed);
  let state = started.state;
  const histories: GameEvent[][] = bots.map((_, seat) => [...engine.redact(started.events, seat)]);
  for (let step = 0; step < steps; step++) {
    const view = engine.view(state, null);
    if (view.phase === "game-over") return;
    const seat = view.active;
    const input = inputFor(state, seat, [...histories[seat]], `${seed}/${step.toString()}`);
    const move = bots[seat](input);
    if (visit({ state, input, step }, move) === true) return;
    const result = engine.apply(state, seat, move);
    if (!result.ok) throw new Error(`step ${step.toString()}: seat ${seat.toString()} made an illegal move ${JSON.stringify(move)}: ${result.reason}`);
    histories.forEach((h, s) => h.push(...engine.redact(result.events, s)));
    state = result.state;
  }
}

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

const isSearch = (input: BotInput) => input.options.kind === "reinforce" && input.options.mayPlace && searchPoint(input.view, input.history) !== null;

describe("rule-v7", () => {
  it("gives the same move for the same input", () => {
    const again = cheap();
    let searched = 0;
    walk("same-input", [greedyBot, cheap(), greedyBot, greedyBot], 400, ({ input }, move) => {
      if (input.seat !== 1) return;
      if (isSearch(input)) searched++;
      expect(again(input)).toEqual(move);
      return searched >= 3;
    });
    expect(searched).toBe(3);
  });

  it("moves the same whatever its seat can't see, the dice to come included", () => {
    const rng = createRng("hidden");
    let checked = 0;
    walk("hidden", [greedyBot, greedyBot, cheap(), greedyBot, greedyBot], 500, ({ state, input }, move) => {
      if (input.seat !== 2 || !isSearch(input)) return;
      const other = redealHidden(state, 2, rng);
      expect(engine.view(other, 2)).toEqual(input.view);
      expect(cheap()({ ...inputFor(other, 2, input.history, input.seed) })).toEqual(move);
      checked++;
      return checked >= 3;
    });
    expect(checked).toBe(3);
  });
});

/** The first decision of seat `me`'s own reinforce phase in a v6 game, with everything a search
 *  there reads. */
function firstSearch(seed: string, me: Seat): Moment {
  const found: Moment[] = [];
  walk(seed, [ruleV6Bot, ruleV6Bot, ruleV6Bot, ruleV6Bot, ruleV6Bot], 2_000, (m) => {
    // Past every seat's first turn, so the turn number says how far a reply went.
    if (m.input.seat !== me || m.input.view.turn < 8 || !isSearch(m.input)) return;
    found.push(m);
    return true;
  });
  if (found.length === 0) throw new Error("no search point");
  return found[0];
}

describe("the replies", () => {
  const me = 1;
  const at = firstSearch("replies", me);
  const point = searchPoint(at.input.view, at.input.history);
  if (point === null) throw new Error("no search point");
  const s = searcher(point, me, V7_PARAMS, at.input.humans, ruleV6(V7_PARAMS));
  const plan = bestPlan(fromView(point.view), me, point.view.armiesToPlace, V7_PARAMS);

  it("rebuild the search point from any placement of the phase", () => {
    const territory = at.input.options.kind === "reinforce" ? at.input.options.ownTerritories[0] : null;
    if (territory === null) throw new Error("not a reinforce decision");
    const result = engine.apply(at.state, me, { kind: "place", territory, armies: 1 });
    if (!result.ok) throw new Error(result.reason);
    const later = searchPoint(engine.view(result.state, me), [...at.input.history, ...engine.redact(result.events, me)]);
    expect(later?.view).toEqual(point.view);
    expect(later?.history).toEqual(point.history);
    expect(later?.placed).toEqual(new Map([[idx(territory), 1]]));
  });

  it("play the round out to the start of my next turn", () => {
    const end = playReply(replyWorld(point, s, "test", 0), s, plan.place);
    if (end.world === null) throw new Error("the game ended in one round");
    const view = end.world.view(me);
    const alive = point.view.seats.filter((x) => !x.eliminated).length;
    expect(view.active).toBe(me);
    expect(view.phase).toBe("reinforce");
    expect(view.turn).toBeGreaterThan(point.view.turn);
    expect(view.turn).toBeLessThanOrEqual(point.view.turn + alive);
    const score = scoreEnd(end, s);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("are the same for every candidate and every run: one guess, one set of dice, one set of bots", () => {
    const a = replyWorld(point, s, "test", 3);
    const b = replyWorld(point, s, "test", 3);
    expect(b.world.view(null)).toEqual(a.world.view(null));
    expect(b.bots).toEqual(a.bots);
    const endA = playReply(a, s, plan.place);
    const endB = playReply(b, s, plan.place);
    expect(endB.world?.view(me)).toEqual(endA.world?.view(me));
  });

  it("play the plan's placement first, as real moves", () => {
    const placed = new Map<number, number>();
    for (let next = nextPlacement(plan.place, placed); next !== null; next = nextPlacement(plan.place, placed)) {
      placed.set(next.territory, (placed.get(next.territory) ?? 0) + next.armies);
    }
    expect(placed).toEqual(plan.place);
    expect(() => nextPlacement(plan.place, new Map([[42 - 1, 99]]))).toThrow();
  });

  it("score a lost game 0 and a won one 1", () => {
    expect(scoreEnd({ world: null, won: false, decisions: 1 }, s)).toBe(0);
    expect(scoreEnd({ world: null, won: true, decisions: 1 }, s)).toBe(1);
    const b = fromView(point.view);
    b.alive[me] = false;
    expect(standing(b, me, V7_PARAMS)).toBe(0);
  });
});
