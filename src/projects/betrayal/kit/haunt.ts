import type {
  FigureDefinition,
  FigureId,
  GameState,
  Json,
  RuleRef,
  SetId,
  Side,
  Step,
  TraitorRule,
} from "../types";
import {
  count,
  counterValue,
  hauntRule,
  setCounter,
  setSecret,
  statusOnGroup,
  type Count,
  type FigureGroup,
  type HauntRules,
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

/** One step of a side's "Right Now". */
export type SetupPart =
  /** Start a counter (a track, or a count of tokens taken). */
  | { part: "counter"; counter: string; start: Count }
  /** Write down a value only some seats know. */
  | { part: "secret"; secret: string; value: Count; knownBy: SeatGroup }
  /** Put a status, defined by the haunt, on a group's explorers. */
  | { part: "status"; who: FigureGroup; status: string; params?: Json }
  /** One of the haunt's own steps, for what the kit doesn't cover. */
  | { part: "local"; step: string; params?: Json };

/** When a goal is met. */
export type GoalTest =
  /** A counter has reached a number. */
  | { counter: string; atLeast: Count }
  /** A test the kit doesn't cover. */
  | { local: (state: GameState, engine: Engine) => boolean };

/** A side's "You win when". Meeting it ends the game at once. */
export interface Goal {
  id: string;
  side: Exclude<Side, "neutral">;
  when: GoalTest;
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
  const rule = hauntRule(definition.number, SETUP_SECTION[side]);
  return (definition.setup?.[side] ?? []).map((part) => {
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
      case "local":
        return local(
          hauntSourceId(definition.number),
          part.step,
          part.params ?? null,
        );
    }
  });
}

function goalCondition(definition: HauntDefinition, goal: Goal): Condition {
  const { when } = goal;
  const rule: RuleRef = hauntRule(definition.number, GOAL_SECTION[goal.side]);
  return {
    id: goal.id,
    once: true,
    rule,
    holds: (state, _source, engine) =>
      "local" in when
        ? when.local(state, engine)
        : counterValue(state, when.counter) >= count(engine, state, when.atLeast),
    then: {
      win: (state) =>
        state.seats.flatMap((seat, i) => (seat.side === goal.side ? [i] : [])),
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
