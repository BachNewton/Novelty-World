import type {
  FigureId,
  GameState,
  HauntReveal,
  InsertedTurn,
  Json,
  RuleRef,
  Seat,
  Status,
  Step,
  TraitorRule,
} from "../types";
import { addStatus, defineStep, loseCard, step } from "./effects";
import { explorerOf, figureOf } from "./figures";
import { traitValue } from "./questions";
import { heroes } from "./sides";
import {
  liveSources,
  type Behaviour,
  type Condition,
  type Source,
} from "./sources";
import type { Random } from "./random";
import type { Engine, StepContext, StepHandler } from "./step-loop";

// The haunt, from its reveal to the end of the game: choosing the traitor,
// the ready wait, each side's setup, the haunt's own state (secrets and
// counters), and the conditions that end the game. The engine reads the
// active haunt's compiled rules from the catalogue by number and never
// branches on which haunt it is.

/** A haunt as the engine runs it, compiled from its kit definition. */
export interface HauntRules {
  number: number;
  name: string;
  /** Who becomes the traitor, where the haunt says otherwise than its
   *  chart entry. */
  traitor: TraitorRule | null;
  /** The haunt as a rule source, live while it is played: its modifiers,
   *  reactions, objective actions, conditions and its own steps. */
  behaviour: Behaviour;
  /** Each side's "Right Now", in the order it is carried out. */
  setup: { traitor: Step[]; heroes: Step[] };
  /** Its counters and secrets, by id, with names for the log. */
  counters: Record<string, { name: string }>;
  secrets: Record<string, { name: string }>;
}

/** Every haunt that has been built, by number. */
export type Haunts = Partial<Record<number, HauntRules>>;

const rulebook = (page: number, ruling?: string): RuleRef =>
  ruling === undefined
    ? { source: "rulebook", page }
    : { source: "rulebook", page, ruling };

export const HAUNT_START: RuleRef = {
  source: "rulebook",
  page: 16,
  ruling: "haunt-start",
};

export function hauntRule(haunt: number, section: string): RuleRef {
  return { source: "haunt", haunt, section };
}

/** The rules of the haunt being played, if it has been built. */
export function activeHaunt(
  engine: Engine,
  state: GameState,
): HauntRules | null {
  return state.haunt === null ? null : (engine.haunts[state.haunt.number] ?? null);
}

function requireHaunt(engine: Engine, state: GameState): HauntRules {
  const rules = activeHaunt(engine, state);
  if (!rules) throw new Error("No haunt that has been built is being played");
  return rules;
}

function hauntState(state: GameState) {
  if (state.haunt === null) throw new Error("The haunt hasn't begun");
  return state.haunt;
}

// ---------------------------------------------------------------------------
// The reveal
// ---------------------------------------------------------------------------

/** The haunt begins. Both ways in, the haunt roll and a scenario's "start
 *  haunt N", come through here: the turn that revealed it is over and
 *  exploration's remaining work is dropped (rules p. 16, ruling
 *  haunt-start). */
export function revealHaunt(
  state: GameState,
  ctx: StepContext,
  reveal: HauntReveal,
): void {
  state.haunt = { ...reveal, secrets: [], counters: {} };
  state.status = "haunt";
  state.work = [];
  state.turn = null;
  state.insertedTurns = [];
  ctx.push(step<null>("haunt-begins", null));
}

/** Seats who could become the traitor under a chart rule. A tie goes to the
 *  revealer if tied, otherwise to the tied seat nearest the revealer's left
 *  (p. 15, ruling traitor-tie). */
function pickExtreme(
  state: GameState,
  rule: Extract<TraitorRule, { exceptRevealer: boolean }>,
  revealer: number,
  value: (seat: number) => number,
  highest: boolean,
): { seat: number; tied: number[] } {
  const candidates = state.seats
    .map((_seat, i) => i)
    .filter((seat) => explorerOf(state, seat) !== null)
    .filter((seat) => !(rule.exceptRevealer && seat === revealer));
  if (candidates.length === 0) throw new Error("No one can become the traitor");
  const values = candidates.map(value);
  const best = highest ? Math.max(...values) : Math.min(...values);
  const tied = candidates.filter((_seat, i) => values[i] === best);
  const count = state.seats.length;
  const seat = tied.includes(revealer)
    ? revealer
    : [...tied].sort(
        (a, b) =>
          ((a - revealer + count) % count) - ((b - revealer + count) % count),
      )[0];
  return { seat, tied };
}

type Chosen = {
  /** The traitor's seats: none for a haunt with no traitor. */
  traitors: number[];
  hidden: boolean;
  /** Seats that tied for it, when a tie was broken. */
  tied: number[];
};

/** Who the chart's traitor rule picks, from the explorers as they stand. */
function chooseTraitors(
  engine: Engine,
  state: GameState,
  rule: TraitorRule,
  revealer: number,
  random: Random,
): Chosen {
  const count = state.seats.length;
  const one = (seat: number): Chosen => ({
    traitors: [seat],
    hidden: false,
    tied: [],
  });
  switch (rule.kind) {
    case "revealer":
      return one(revealer);
    case "left-of-revealer":
      return one((revealer + 1) % count);
    case "named": {
      const named = rule.character in state.figures
        ? figureOf(state, rule.character).owner
        : null;
      return named === null
        ? chooseTraitors(engine, state, rule.otherwise, revealer, random)
        : one(named);
    }
    case "trait":
    case "age": {
      const explorer = (seat: number): FigureId => {
        const id = explorerOf(state, seat);
        if (id === null) throw new Error(`Seat ${seat} has no explorer`);
        return id;
      };
      const picked =
        rule.kind === "trait"
          ? pickExtreme(
              state,
              rule,
              revealer,
              (seat) => traitValue(engine, state, explorer(seat), rule.trait),
              rule.extreme === "highest",
            )
          : pickExtreme(
              state,
              rule,
              revealer,
              (seat) =>
                engine.catalog.characters[figureOf(state, explorer(seat)).definition]
                  .age,
              rule.extreme === "oldest",
            );
      return {
        traitors: [picked.seat],
        hidden: false,
        tied: picked.tied.length > 1 ? picked.tied : [],
      };
    }
    // Small monster tokens numbered from 1 are dealt face down; token 1 is
    // the traitor (p. 17).
    case "hidden":
      return {
        traitors: [random.shuffle(state.seats.map((_seat, i) => i))[0]],
        hidden: true,
        tied: [],
      };
    case "none":
      return { traitors: [], hidden: false, tied: [] };
  }
}

/** Who knows a seat's side once a hidden traitor is dealt: each seat its own,
 *  and the traitor everyone's. */
function hiddenKnowledge(seat: number, traitor: number): number[] {
  return seat === traitor ? [seat] : [seat, traitor];
}

// ---------------------------------------------------------------------------
// The haunt's own state: secrets, counters, seat and figure groups
// ---------------------------------------------------------------------------

/** A number a haunt's rules read off the game: a fixed one, the players
 *  (every seat, dead explorers included, p. 16), the heroes still in play,
 *  a counter, or a secret holding a number. It is worked out when the step
 *  using it runs, so a setup step fixes it at the haunt's start. */
export type Count =
  | number
  | { of: "players" }
  | { of: "living-heroes" }
  | { of: "counter"; counter: string }
  | { of: "secret"; secret: string };

export function count(engine: Engine, state: GameState, value: Count): number {
  if (typeof value === "number") return value;
  switch (value.of) {
    case "players":
      return state.seats.length;
    case "living-heroes":
      return heroes(engine, state).length;
    case "counter":
      return counterValue(state, value.counter);
    case "secret": {
      const secret = secretValue(state, value.secret);
      if (typeof secret !== "number")
        throw new Error(`The secret ${value.secret} isn't a number`);
      return secret;
    }
  }
}

export function counterValue(state: GameState, counter: string): number {
  const { counters } = hauntState(state);
  if (!(counter in counters)) throw new Error(`No haunt counter ${counter}`);
  return counters[counter];
}

export function secretValue(state: GameState, secret: string): Json {
  const found = hauntState(state).secrets.find((s) => s.id === secret);
  if (!found) throw new Error(`No haunt secret ${secret}`);
  return found.value;
}

/** A set of seats a haunt's rule names by role. */
export type SeatGroup = "traitor" | "heroes" | "everyone";

export function seatsIn(state: GameState, group: SeatGroup): number[] {
  const all = state.seats.map((_seat, i) => i);
  switch (group) {
    case "traitor":
      return all.filter((i) => state.seats[i].roles.includes("traitor"));
    case "heroes":
      return all.filter((i) => state.seats[i].side === "heroes");
    case "everyone":
      return all;
  }
}

/** Explorers a haunt's rule names by their seat's role: the traitor's, the
 *  heroes', or the revealer's, those alive. */
export type FigureGroup = "traitor" | "heroes" | "revealer";

function figuresIn(state: GameState, group: FigureGroup): FigureId[] {
  const seats =
    group === "revealer" ? [hauntState(state).revealer] : seatsIn(state, group);
  return seats.flatMap((seat) => {
    const id = explorerOf(state, seat);
    return id !== null && figureOf(state, id).alive ? [id] : [];
  });
}

type SetSecret = {
  secret: string;
  value: Count;
  knownBy: SeatGroup;
  rule: RuleRef;
};
type SetCounter = { counter: string; value: Count; rule: RuleRef };
type AddCounter = { counter: string; amount: number; rule: RuleRef };
type GroupStatus = { who: FigureGroup; status: Status };

/** A secret's value is set, known only to a group of seats. */
export function setSecret(
  secret: string,
  value: Count,
  knownBy: SeatGroup,
  rule: RuleRef,
): Step {
  return step<SetSecret>("set-secret", { secret, value, knownBy, rule });
}

/** A secret is shown to everyone. */
export function revealSecret(secret: string, rule: RuleRef): Step {
  return step<{ secret: string; rule: RuleRef }>("reveal-secret", {
    secret,
    rule,
  });
}

export function setCounter(counter: string, value: Count, rule: RuleRef): Step {
  return step<SetCounter>("set-counter", { counter, value, rule });
}

export function addToCounter(
  counter: string,
  amount: number,
  rule: RuleRef,
): Step {
  return step<AddCounter>("add-to-counter", { counter, amount, rule });
}

/** Puts a status on each living explorer of a group. */
export function statusOnGroup(who: FigureGroup, status: Status): Step {
  return step<GroupStatus>("group-status", { who, status });
}

/** Puts a turn into the order, taken at the next turn boundary. */
export function insertTurn(turn: InsertedTurn): Step {
  return step<InsertedTurn>("insert-turn", turn);
}

// ---------------------------------------------------------------------------
// Conditions and the end of the game
// ---------------------------------------------------------------------------

/** The rulebook's goal for every haunt: with every hero dead, the heroes
 *  can't win, so the traitor's side wins at once (p. 19, ruling game-end).
 *  A haunt that says otherwise changes who wins with a condition of its
 *  own. */
const ALL_HEROES_DEAD: Condition = {
  id: "all-heroes-dead",
  once: true,
  rule: rulebook(19, "game-end"),
  holds: (state, _source, engine) =>
    state.seats.some((seat) => seat.side === "heroes") &&
    heroes(engine, state).length === 0,
  then: { win: (state) => seatsIn(state, "traitor") },
};

const RULEBOOK_SOURCE: Source = {
  layer: "rulebook",
  kind: "rulebook",
  id: "rulebook",
  rule: rulebook(19),
  holder: null,
  room: null,
  beside: null,
  token: null,
  status: null,
};

type Goal = { winners: number[]; rule: RuleRef };

/** Re-checks every live condition, after every step, once the haunt is set
 *  up and its first turn has begun (until then its counters and secrets
 *  aren't all there to test). A condition fires when it turns true; a
 *  once-only one is remembered for good, any other until it stops holding.
 *  A goal met ends the game at once; if one step meets goals with different
 *  winners, the side whose turn it is wins (p. 19, ruling game-end). */
export function checkConditions(
  engine: Engine,
  state: GameState,
  ctx: StepContext,
): void {
  if (state.status !== "haunt" || state.turn === null) return;
  const sources = [
    { source: RULEBOOK_SOURCE, behaviour: { conditions: [ALL_HEROES_DEAD] } },
    ...liveSources(engine, state),
  ];
  const fired = state.memory.conditions;
  const goals: Goal[] = [];
  const steps: Step[] = [];
  for (const { source, behaviour } of sources) {
    for (const condition of behaviour.conditions ?? []) {
      const key = `${source.kind}:${source.id}:${condition.id}`;
      const holds = condition.holds(state, source, engine);
      if (!holds) {
        if (!condition.once && fired.includes(key))
          state.memory.conditions = state.memory.conditions.filter(
            (k) => k !== key,
          );
        continue;
      }
      if (fired.includes(key)) continue;
      state.memory.conditions = [...state.memory.conditions, key];
      const then = condition.then;
      if ("win" in then)
        goals.push({
          winners: [...new Set(then.win(state, source, engine))].sort(
            (a, b) => a - b,
          ),
          rule: condition.rule ?? source.rule,
        });
      else steps.push(...then.steps(state, source, engine));
    }
  }
  if (goals.length > 0) {
    endGame(state, ctx, pickGoal(state, goals));
    return;
  }
  ctx.push(...steps);
}

function pickGoal(state: GameState, goals: Goal[]): Goal & { tied: boolean } {
  const distinct = goals.filter(
    (goal, i) =>
      goals.findIndex(
        (other) => JSON.stringify(other.winners) === JSON.stringify(goal.winners),
      ) === i,
  );
  if (distinct.length === 1) return { ...distinct[0], tied: false };
  const seat = state.turn?.seat;
  const ours = distinct.filter(
    (goal) => seat !== undefined && goal.winners.includes(seat),
  );
  if (ours.length !== 1)
    throw new Error(
      `Goals met at once with no one side's turn to settle them: ${JSON.stringify(goals)}`,
    );
  return { ...ours[0], tied: true };
}

/** The game is over: nothing after this step happens. */
function endGame(
  state: GameState,
  ctx: StepContext,
  goal: Goal & { tied: boolean },
): void {
  state.status = "finished";
  state.result = { winners: goal.winners, rule: goal.rule };
  state.work = [];
  state.pending = null;
  state.turn = null;
  state.insertedTurns = [];
  ctx.emit("game-over", goal.rule, {
    winners: goal.winners,
    side: winningSide(state.seats, goal.winners),
    tied: goal.tied,
  });
}

/** The side that won, when the winners are exactly one side's seats. */
function winningSide(seats: Seat[], winners: number[]): Seat["side"] {
  if (winners.length === 0) return null;
  const side = seats[winners[0]].side;
  const all = seats.flatMap((seat, i) => (seat.side === side ? [i] : []));
  return all.length === winners.length && winners.every((w) => all.includes(w))
    ? side
    : null;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type Side = "traitor" | "heroes";

export const HAUNT_STEPS: Record<string, StepHandler> = {
  // A haunt not built yet stops the game at its reveal.
  "haunt-begins": defineStep<null>((state, _p, ctx) => {
    const haunt = hauntState(state);
    if (!activeHaunt(ctx.engine, state)) {
      ctx.emit("haunt-unbuilt", HAUNT_START, { haunt: haunt.number });
      return;
    }
    if (state.seats.some((seat) => seat.side !== null))
      throw new Error(
        `Haunt ${haunt.number} decides the sides at its reveal, so a scenario that starts it can't set them`,
      );
    ctx.push(
      step<null>("choose-traitor", null),
      step<null>("traitor-freed", null),
      step<null>("haunt-ready", null),
      step<{ side: Side }>("haunt-setup", { side: "traitor" }),
      step<{ side: Side }>("haunt-setup", { side: "heroes" }),
      step<null>("next-turn", null),
    );
  }),

  // The chart picks the traitor from the explorers' traits as they stand
  // at the reveal (rules p. 15); everyone else becomes a hero (p. 16).
  "choose-traitor": defineStep<null>((state, _p, ctx) => {
    const haunt = hauntState(state);
    const rules = requireHaunt(ctx.engine, state);
    const { traitors } = ctx.catalog.chart;
    if (rules.traitor === null && !(haunt.number in traitors))
      throw new Error(`The chart has no traitor for haunt ${haunt.number}`);
    const rule = rules.traitor ?? traitors[haunt.number];
    const chosen = chooseTraitors(
      ctx.engine,
      state,
      rule,
      haunt.revealer,
      ctx.random,
    );
    if (chosen.tied.length > 0)
      ctx.emit("traitor-tie", rulebook(15, "traitor-tie"), {
        tied: chosen.tied,
        seat: chosen.traitors[0],
      });
    const traitor = chosen.traitors.at(0);
    state.seats = state.seats.map((seat, i) => {
      const isTraitor = chosen.traitors.includes(i);
      return {
        ...seat,
        side: isTraitor ? "traitor" : "heroes",
        roles: isTraitor ? ["traitor"] : [],
        knownBy:
          chosen.hidden && traitor !== undefined
            ? hiddenKnowledge(i, traitor)
            : null,
      };
    });
    if (chosen.hidden) {
      ctx.emit("sides-dealt", rulebook(17), {});
      return;
    }
    const order = [
      ...chosen.traitors,
      ...state.seats.map((_s, i) => i).filter((i) => !chosen.traitors.includes(i)),
    ];
    for (const seat of order) {
      const { side, roles } = state.seats[seat];
      ctx.emit("side-set", rulebook(15), { seat, side, roles, secret: false });
    }
  }),

  // The traitor's explorer is freed from the event cards impeding them
  // (p. 17, ruling traitor-freed).
  "traitor-freed": defineStep<null>((state, _p, ctx) => {
    const freed = rulebook(17, "traitor-freed");
    ctx.push(
      ...figuresIn(state, "traitor").flatMap((figure) =>
        figureOf(state, figure)
          .cards.filter((card) => ctx.engine.behaviours.cards[card]?.impedes)
          .map((card) => loseCard(figure, card, { to: "discard" }, freed)),
      ),
    );
  }),

  // Everyone reads their own half, and the game waits until every player
  // has said they are ready (p. 16).
  "haunt-ready": defineStep<null>((state, _p, ctx) => {
    ctx.waitForReady(
      state.seats.map((_seat, i) => i),
      HAUNT_START,
    );
  }),

  // The traitor's "Right Now" is carried out first, then the heroes'
  // (ruling haunt-start).
  "haunt-setup": defineStep<{ side: Side }>((state, p, ctx) => {
    const rules = requireHaunt(ctx.engine, state);
    const work = rules.setup[p.side];
    if (work.length === 0) return;
    ctx.emit(
      "haunt-setup",
      hauntRule(rules.number, p.side === "traitor" ? "Traitor's setup" : "Heroes' setup"),
      { side: p.side },
    );
    ctx.push(...work);
  }),

  "set-secret": defineStep<SetSecret>((state, p, ctx) => {
    const haunt = hauntState(state);
    if (haunt.secrets.some((s) => s.id === p.secret))
      throw new Error(`The secret ${p.secret} is already set`);
    const knownBy = p.knownBy === "everyone" ? null : seatsIn(state, p.knownBy);
    haunt.secrets.push({
      id: p.secret,
      value: count(ctx.engine, state, p.value),
      knownBy,
    });
    // The event names the secret, never its value.
    ctx.emit("secret-set", p.rule, {
      secret: p.secret,
      knownBy,
    });
  }),

  "reveal-secret": defineStep<{ secret: string; rule: RuleRef }>((state, p, ctx) => {
    const haunt = hauntState(state);
    const secret = haunt.secrets.find((s) => s.id === p.secret);
    if (!secret) throw new Error(`No haunt secret ${p.secret}`);
    secret.knownBy = null;
    ctx.emit("secret-revealed", p.rule, {
      secret: p.secret,
    });
  }),

  "set-counter": defineStep<SetCounter>((state, p, ctx) => {
    const value = count(ctx.engine, state, p.value);
    hauntState(state).counters[p.counter] = value;
    ctx.emit("counter-changed", p.rule, { counter: p.counter, value });
  }),

  "add-to-counter": defineStep<AddCounter>((state, p, ctx) => {
    const value = counterValue(state, p.counter) + p.amount;
    hauntState(state).counters[p.counter] = value;
    ctx.emit("counter-changed", p.rule, { counter: p.counter, value });
  }),

  "group-status": defineStep<GroupStatus>((state, p, ctx) => {
    ctx.push(...figuresIn(state, p.who).map((f) => addStatus(f, p.status)));
  }),

  "insert-turn": defineStep<InsertedTurn>((state, p, ctx) => {
    state.insertedTurns.push(p);
    ctx.emit("turn-inserted", p.rule, { seat: p.seat, kind: p.kind });
  }),
};
