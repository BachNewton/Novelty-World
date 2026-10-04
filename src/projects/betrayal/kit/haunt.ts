import type {
  FigureDefinition,
  FigureId,
  HauntTexts,
  GameState,
  Json,
  RuleRef,
  SetId,
  Side,
  Step,
  TraitorRule,
} from "../types";
import { explorerOf, figureOf } from "../engine/figures";
import {
  count,
  counterValue,
  dropItems,
  hauntRule,
  seatsIn,
  setAsideCompanions,
  setCounter,
  setSecret,
  spawn,
  statusOnGroup,
  topUpRooms,
  type Count,
  type FigureGroup,
  type HauntRules,
  type RoomMatch,
  type SeatGroup,
} from "../engine/haunt";
import type { Modifier } from "../engine/questions";
import { sideOf } from "../engine/sides";
import {
  hauntSourceId,
  local,
  localStep,
  type Behaviour,
  type Condition,
  type Reaction,
  type SourceAction,
} from "../engine/sources";
import type { Engine, StepHandler } from "../engine/step-loop";

// The haunt parts kit: a haunt is typed data assembled from these parts, with
// small local functions only where the kit doesn't cover something. Each
// definition compiles into the rules the engine runs (`HauntRules`), and its
// figures and statuses register in the catalogue beside every other one.

/** One step of a side's "Right Now", naming the content ruling its events
 *  cite where one ruling of the haunt settles it. */
export type SetupPart = (
  /** Start a counter (a track, or a count of tokens taken). */
  | { part: "counter"; counter: string; start: Count }
  /** Write down a value only some seats know. */
  | { part: "secret"; secret: string; value: Count; knownBy: SeatGroup }
  /** Put a status, defined by the haunt, on a group's explorers. */
  | { part: "status"; who: FigureGroup; status: string; params?: Json }
  /** Put a number of the haunt's figures in the room of a group's first
   *  living explorer, owned by a group's one seat or by none. */
  | {
      part: "spawn";
      figure: string;
      count: Count;
      at: FigureGroup;
      owner: SeatGroup | null;
    }
  /** Each explorer of a group drops every card that works as an item
   *  where it stands. */
  | { part: "drop-items"; who: FigureGroup }
  /** Each explorer of a group sets its companions aside, out of the game. */
  | { part: "set-aside-companions"; who: FigureGroup }
  /** Tops up the rooms in the house that match to at least a number, the
   *  rooms chosen from the stack and the discards and placed by the seat
   *  of a group's explorer. */
  | { part: "rooms"; match: RoomMatch; atLeast: Count; chooser: FigureGroup }
  /** One of the haunt's own steps, for what the kit doesn't cover. */
  | { part: "local"; step: string; params?: Json }
) & { ruling?: string };

/** When a goal is met. */
export type GoalTest =
  /** A counter has reached a number. */
  | { counter: string; atLeast: Count }
  /** The explorer of a seat in a group has died. */
  | { explorerDead: SeatGroup }
  /** A card has left the game: discarded, or set aside out of the game.
   *  One still in its stack can still be drawn. */
  | { cardOutOfGame: string }
  /** A test the kit doesn't cover. */
  | { local: (state: GameState, engine: Engine) => boolean };

/** A side's "You win when". Meeting it ends the game at once. */
export interface Goal {
  id: string;
  side: Exclude<Side, "neutral">;
  when: GoalTest;
  /** Secrets shown to everyone as it is met. */
  reveals?: string[];
  /** The content ruling it rests on, for the result's "why?". */
  ruling?: string;
}

/** An objective action: something a figure on a side can do on its turn to
 *  change the haunt's state. */
export interface ObjectiveAction {
  label: string;
  /** Which side's figures may take it. */
  side: Exclude<Side, "neutral"> | "any";
  /** Offered even while the figure can't otherwise act. */
  escape?: boolean;
  /** Where and when it can be taken, past being on the right side. */
  available?: (state: GameState, figure: FigureId, engine: Engine) => boolean;
  steps: (state: GameState, figure: FigureId) => Step[];
}

export interface HauntDefinition {
  number: number;
  name: string;
  set: SetId;
  /** Its file under content/haunts/. */
  content: string;
  /** Each side's half of its text: the content file's generated
   *  data/haunt-texts/ JSON, imported (a test holds the two together). */
  texts: HauntTexts;
  /** Who becomes the traitor, where the haunt says otherwise than its chart
   *  entry. */
  traitor?: TraitorRule;
  /** Each side's "Right Now", in order. */
  setup?: { traitor?: SetupPart[]; heroes?: SetupPart[] };
  /** Its monsters and allies, registered as figure definitions. */
  figures?: FigureDefinition[];
  /** The statuses it puts on figures, each a rule source of its own. */
  statuses?: Record<string, Behaviour>;
  /** Its counters and secrets, with names for the log. */
  counters?: Record<string, { name: string }>;
  secrets?: Record<string, { name: string }>;
  /** Rule changes: modifiers to the engine's questions. */
  modifiers?: Modifier[];
  reactions?: Reaction[];
  actions?: Record<string, ObjectiveAction>;
  goals?: Goal[];
  /** Conditions that do something other than end the game. */
  conditions?: Condition[];
  /** Its own steps, run with `local(hauntSourceId(number), name)`. */
  steps?: Record<string, StepHandler>;
  /** Wording for events its rules cause, where the general wording says too
   *  little. */
  describe?: Behaviour["describe"];
  /** The ids of the content notes it depends on. */
  rulings?: string[];
}

const SETUP_SECTION = {
  traitor: "Traitor's setup",
  heroes: "Heroes' setup",
} as const;

const GOAL_SECTION = {
  traitor: "Traitor wins when",
  heroes: "Heroes win when",
} as const;

function setupSteps(
  definition: HauntDefinition,
  side: "traitor" | "heroes",
): Step[] {
  const section = hauntRule(definition.number, SETUP_SECTION[side]);
  return (definition.setup?.[side] ?? []).map((part) => {
    const rule =
      part.ruling === undefined ? section : { ...section, ruling: part.ruling };
    switch (part.part) {
      case "counter":
        return setCounter(part.counter, part.start, rule);
      case "secret":
        return setSecret(part.secret, part.value, part.knownBy, rule);
      case "status":
        return statusOnGroup(part.who, {
          id: part.status,
          rule,
          params: part.params ?? null,
        });
      case "spawn":
        return spawn(
          part.figure,
          { count: part.count, at: part.at, owner: part.owner },
          rule,
        );
      case "drop-items":
        return dropItems(part.who, rule);
      case "set-aside-companions":
        return setAsideCompanions(part.who, rule);
      case "rooms":
        return topUpRooms(part.match, part.atLeast, part.chooser, rule);
      case "local":
        return local(
          hauntSourceId(definition.number),
          part.step,
          part.params ?? null,
        );
    }
  });
}

function goalMet(state: GameState, engine: Engine, when: GoalTest): boolean {
  if ("local" in when) return when.local(state, engine);
  if ("explorerDead" in when)
    return seatsIn(state, when.explorerDead).some((seat) => {
      const explorer = explorerOf(state, seat);
      return explorer !== null && !figureOf(state, explorer).alive;
    });
  if ("cardOutOfGame" in when) {
    const { cardOutOfGame: card } = when;
    const type = engine.catalog.cards[card].type;
    return (
      state.decks[type].discard.includes(card) ||
      state.aside.some((a) => a.card === card && a.room === null)
    );
  }
  return counterValue(state, when.counter) >= count(engine, state, when.atLeast);
}

function goalCondition(definition: HauntDefinition, goal: Goal): Condition {
  const section = hauntRule(definition.number, GOAL_SECTION[goal.side]);
  const rule: RuleRef =
    goal.ruling === undefined ? section : { ...section, ruling: goal.ruling };
  return {
    id: goal.id,
    once: true,
    rule,
    holds: (state, _source, engine) => goalMet(state, engine, goal.when),
    then: {
      win: (state) =>
        state.seats.flatMap((seat, i) => (seat.side === goal.side ? [i] : [])),
      ...(goal.reveals === undefined ? {} : { reveal: goal.reveals }),
    },
  };
}

function sourceAction(action: ObjectiveAction): SourceAction {
  return {
    label: action.label,
    ...(action.escape === undefined ? {} : { escape: action.escape }),
    available: (state, figure, _source, engine) =>
      (action.side === "any" || sideOf(engine, state, figure) === action.side) &&
      (action.available?.(state, figure, engine) ?? true),
    steps: (state, figure) => action.steps(state, figure),
  };
}

/** A haunt definition as the engine runs it. */
export function compileHaunt(definition: HauntDefinition): HauntRules {
  const actions = Object.fromEntries(
    Object.entries(definition.actions ?? {}).map(([id, action]) => [
      id,
      sourceAction(action),
    ]),
  );
  const behaviour: Behaviour = {
    modifiers: definition.modifiers ?? [],
    reactions: definition.reactions ?? [],
    actions,
    conditions: [
      ...(definition.goals ?? []).map((goal) => goalCondition(definition, goal)),
      ...(definition.conditions ?? []),
    ],
    ...(definition.describe === undefined ? {} : { describe: definition.describe }),
    ...(definition.steps === undefined ? {} : { steps: definition.steps }),
  };
  return {
    number: definition.number,
    name: definition.name,
    texts: definition.texts,
    traitor: definition.traitor ?? null,
    behaviour,
    setup: {
      traitor: setupSteps(definition, "traitor"),
      heroes: setupSteps(definition, "heroes"),
    },
    counters: definition.counters ?? {},
    secrets: definition.secrets ?? {},
  };
}

function addOnce<R extends Partial<Record<string, unknown>>>(
  into: R,
  entries: R,
  what: string,
): R {
  const result = { ...into };
  for (const [id, entry] of Object.entries(entries)) {
    // A kit part several haunts share (a status, a monster) is one entry.
    if (result[id] === entry) continue;
    if (id in result) throw new Error(`${what} ${id} is registered twice`);
    Object.assign(result, { [id]: entry });
  }
  return result;
}

/** The engine with these haunts built in: each compiled and registered by
 *  number, its figures in the figure definitions, its statuses beside the
 *  cards' and its own steps under its source id. */
export function withHaunts(
  engine: Engine,
  definitions: HauntDefinition[],
): Engine {
  let { figures } = engine.catalog;
  let { statuses } = engine.behaviours;
  let { steps } = engine.rules;
  const haunts = { ...engine.haunts };
  for (const definition of definitions) {
    const { number } = definition;
    if (number in haunts) throw new Error(`Haunt ${number} is registered twice`);
    const rules = compileHaunt(definition);
    haunts[number] = rules;
    figures = addOnce(
      figures,
      Object.fromEntries((definition.figures ?? []).map((f) => [f.id, f])),
      "Figure definition",
    );
    statuses = addOnce(statuses, definition.statuses ?? {}, "Status");
    steps = addOnce(
      steps,
      Object.fromEntries(
        Object.entries(rules.behaviour.steps ?? {}).map(([name, handler]) => [
          localStep(hauntSourceId(number), name),
          handler,
        ]),
      ),
      "Step",
    );
  }
  return {
    catalog: { ...engine.catalog, figures },
    behaviours: { ...engine.behaviours, statuses },
    rules: { ...engine.rules, steps },
    haunts,
  };
}
