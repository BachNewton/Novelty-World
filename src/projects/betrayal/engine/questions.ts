import type {
  Edge,
  FigureId,
  GameState,
  Place,
  RuleRef,
  Side,
  Trait,
  TurnRef,
} from "../types";
import {
  adjacent,
  connections,
  doorToward,
  lineOfSight,
  placed,
  turn,
} from "./board";
import {
  figureDefinition,
  figureOf,
  PHYSICAL,
  takesDamage,
  together,
  trackTraits,
} from "./figures";
import {
  LAYER_OF,
  LAYERS,
  liveSources,
  type Layer,
  type RollContext,
  type Source,
} from "./sources";
import type { Engine } from "./step-loop";
import { baseRound } from "./turns";

// The engine never hard-codes a rule a card, room or haunt might change. It
// asks a question, and every live source may change the answer. Choice listing
// and applying ask the same questions, so legality has one source.

export interface NumberQuestions {
  /** A figure's value in a trait: the number its clip points at, or its
   *  fixed value. Ask `hasTrait` first for a figure that may lack one. */
  traitValue: { figure: FigureId; trait: Trait };
  /** How many dice a roll gets. */
  dicePool: { figure: FigureId; roll: RollContext };
  /** How much damage lands, before the player splits it. */
  damageAmount: {
    figure: FigureId;
    damage: DamageKind;
    amount: number;
    rule: RuleRef;
  };
  /** Spaces of movement a turn allows. */
  movement: { figure: FigureId };
  /** Extra spaces of movement it costs a figure to leave the place it is
   *  in, past the 1 every move costs. */
  leaveCost: { figure: FigureId; from: Place };
}

export interface PermissionQuestions {
  /** Whether a figure may take any action on its turn. */
  canAct: { figure: FigureId };
  /** Whether a figure may attack this target at all, whoever makes the
   *  attack happen. Who counts as an opponent, reach and the ways to attack
   *  are their own questions. */
  canAttack: { attacker: FigureId; target: AttackTarget };
  /** Whether a figure may move from one room to another. */
  canMove: { figure: FigureId; from: string; to: string };
}

/** What moves: a figure, or a companion token travelling for the figure
 *  holding its card (the Dog). */
export type Mover =
  | { kind: "figure"; figure: FigureId }
  | { kind: "companion"; card: string; holder: FigureId };

export interface SetQuestions {
  /** The places one space of movement away. */
  connections: { mover: Mover; from: Place };
  /** Rooms sharing a side with a room: the rulebook's "adjacent". */
  adjacency: { room: string };
  /** Rooms in line of sight of a room (p. 22). */
  lineOfSight: { room: string };
}

interface SetItems {
  connections: Place;
  adjacency: string;
  lineOfSight: string;
}

export type NumberChange =
  | { set: number }
  | { add: number }
  /** Takes away up to `fewer`, never below `minimum`, and never lifts an
   *  answer already at or below it ("1 fewer die, to a minimum of 1"). */
  | { fewer: number; minimum: number }
  | { multiply: number }
  | { atMost: number }
  | { atLeast: number }
  /** A final fixed value, after everything else. */
  | { fix: number };

export type PermissionChange = { deny: true } | { allow: true };

type NumberModifier = {
  [Q in keyof NumberQuestions]: {
    question: Q;
    when?: (
      state: GameState,
      subject: NumberQuestions[Q],
      source: Source,
      engine: Engine,
    ) => boolean;
    change: NumberChange;
  };
}[keyof NumberQuestions];

type PermissionModifier = {
  [Q in keyof PermissionQuestions]: {
    question: Q;
    when?: (
      state: GameState,
      subject: PermissionQuestions[Q],
      source: Source,
      engine: Engine,
    ) => boolean;
    change: PermissionChange;
  };
}[keyof PermissionQuestions];

type SetModifier = {
  [Q in keyof SetQuestions]: {
    question: Q;
    when?: (
      state: GameState,
      subject: SetQuestions[Q],
      source: Source,
      engine: Engine,
    ) => boolean;
    change:
      | {
          add: (
            state: GameState,
            subject: SetQuestions[Q],
            source: Source,
          ) => SetItems[Q][];
        }
      /** Rooms taken out of the answer. */
      | {
          remove: (
            state: GameState,
            subject: SetQuestions[Q],
            source: Source,
          ) => string[];
        };
  };
}[keyof SetQuestions];

/** What an attack is aimed at. Haunts 84 and 86 attack rooms; so far only a
 *  figure can be attacked. */
export type AttackTarget =
  | { kind: "figure"; figure: FigureId }
  | { kind: "room"; room: string };

/** What an attack is made with: the trait both sides roll, the card the
 *  attacker uses for it (a weapon, the Ring), if any, and how far it
 *  reaches: into the attacker's own room, or along a line of sight (the
 *  Revolver, p. 13). */
export type AttackMode = {
  trait: Trait;
  card: string | null;
  reach: "room" | "sight";
};

export type DamageKind = "physical" | "mental";

/** What the loser of an attack suffers, and the rule that says so: damage,
 *  to split between the matching traits; being stunned, as a monster is
 *  instead of taking damage (p. 18); or being killed outright, where a haunt
 *  says so. */
export type Harm =
  | { kind: "damage"; damage: DamageKind; points: number; rule: RuleRef }
  | { kind: "stun"; rule: RuleRef }
  | { kind: "kill"; rule: RuleRef };

/** A trait at the skull: the figure dies, or the trait stops at its lowest
 *  value above the skull. */
export type LethalOutcome = { kind: "death" } | { kind: "clamp" };

/** What an attack's comparison leads to. */
export type CombatOutcome = {
  /** Who lost, or null for a tie. */
  loser: "attacker" | "defender" | null;
  /** What the loser suffers, if anything. */
  harm: Harm | null;
  /** Whether the attacker may steal an item instead of dealing the harm. */
  steal: boolean;
};

export interface StructuredQuestions {
  /** The seat that decides for a figure: what it does, and every choice
   *  the rules give it. Null when no seat does. */
  controller: {
    question: { figure: FigureId };
    answer: number | null;
  };
  /** The side a figure is on, if any. */
  side: {
    question: { figure: FigureId };
    answer: Side | null;
  };
  /** Whether one figure is another's opponent: one that wants to stop its
   *  movement or interfere with it (p. 22). */
  isOpponent: {
    question: { figure: FigureId; other: FigureId };
    answer: boolean;
  };
  /** What a trait reaching the skull means, asked per trait with the rule
   *  whose effect took it there. */
  lethalOutcome: {
    question: { figure: FigureId; trait: Trait; cause: RuleRef };
    answer: LethalOutcome;
  };
  /** Whether a figure in a room makes leaving it cost another figure more:
   *  an opponent does, unless it is stunned (p. 17). */
  hinders: {
    question: { hinderer: FigureId; mover: FigureId };
    answer: boolean;
  };
  /** The ways a figure may attack another. */
  attackModes: {
    question: { attacker: FigureId; defender: FigureId };
    answer: AttackMode[];
  };
  /** One round of turns, in order. The next turn is worked out from it at
   *  every turn boundary, never saved. */
  turnOrder: {
    question: Record<string, never>;
    answer: TurnRef[];
  };
  /** What an attack's two results lead to. */
  combatOutcome: {
    question: {
      attack: AttackSubject;
      mode: AttackMode;
      attackResult: number;
      defenceResult: number;
    };
    answer: CombatOutcome;
  };
}

/** Who attacks whom: a figure, or (null) an attacker a card stands in for. */
export type AttackSubject = {
  attacker: FigureId | null;
  defender: FigureId;
  rule: RuleRef;
};

type StructuredModifier = {
  [Q in keyof StructuredQuestions]: {
    question: Q;
    when?: (
      state: GameState,
      subject: StructuredQuestions[Q]["question"],
      source: Source,
      engine: Engine,
    ) => boolean;
    /** Turns the answer so far into this source's answer. */
    change: {
      transform: (
        state: GameState,
        subject: StructuredQuestions[Q]["question"],
        answer: StructuredQuestions[Q]["answer"],
        source: Source,
      ) => StructuredQuestions[Q]["answer"];
    };
  };
}[keyof StructuredQuestions];

export type Modifier =
  NumberModifier | PermissionModifier | SetModifier | StructuredModifier;

export interface Permission {
  allowed: boolean;
  /** The rules behind the answer, for the "why?" in the log. */
  because: RuleRef[];
}

/** The most dice any roll may have. */
export const MAX_DICE = 8;

const NUMBER_BASE: {
  [Q in keyof NumberQuestions]: (
    engine: Engine,
    state: GameState,
    subject: NumberQuestions[Q],
  ) => number;
} = {
  traitValue: (engine, state, { figure, trait }) => {
    const source = figureDefinition(engine.catalog, state, figure).traits;
    if (source.kind === "fixed") {
      const value = source.values[trait];
      if (value === undefined) throw new Error(`${figure} has no ${trait}`);
      return value;
    }
    const { tracks, live } = trackTraits(engine.catalog, state, figure);
    return tracks[trait][live.clips[trait]];
  },
  dicePool: (engine, state, { figure, roll }) => {
    switch (roll.spec.kind) {
      case "trait":
        return traitValue(engine, state, figure, roll.spec.trait);
      case "dice":
        return roll.spec.count;
      case "haunt":
        return 6;
      case "attack":
        return (
          roll.spec.dice ?? traitValue(engine, state, figure, roll.spec.trait)
        );
    }
  },
  damageAmount: (_engine, _state, { amount }) => amount,
  movement: (engine, state, { figure }) =>
    traitValue(engine, state, figure, "speed"),
  // After the haunt starts, leaving a room costs 1 extra space for each
  // opponent in it that gets in the way (p. 17).
  leaveCost: (engine, state, { figure, from }) => {
    if (state.status === "exploring") return 0;
    const here = { ...figureOf(state, figure), place: from };
    return Object.values(state.figures).filter(
      (other) =>
        other.id !== figure &&
        together(other, here) &&
        askStructured(engine, state, "hinders", {
          hinderer: other.id,
          mover: figure,
        }),
    ).length;
  },
};

interface Applied<C> {
  layer: Layer;
  change: C;
  rule: RuleRef;
}

function applicable<C>(
  engine: Engine,
  state: GameState,
  question: string,
  subject: unknown,
): Applied<C>[] {
  const result: Applied<C>[] = [];
  for (const { source, behaviour } of liveSources(engine, state)) {
    for (const modifier of behaviour.modifiers ?? []) {
      if (modifier.question !== question) continue;
      // The modifier's own type ties `when` to this question's subject.
      const when = modifier.when as
        | ((
            s: GameState,
            subject: unknown,
            source: Source,
            engine: Engine,
          ) => boolean)
        | undefined;
      if (when && !when(state, subject, source, engine)) continue;
      result.push({
        layer: source.layer,
        change: modifier.change as C,
        rule: source.rule,
      });
    }
  }
  return result;
}

export function askNumber<Q extends keyof NumberQuestions>(
  engine: Engine,
  state: GameState,
  question: Q,
  subject: NumberQuestions[Q],
): number {
  const changes = [
    ...applicable<NumberChange>(engine, state, question, subject),
    ...ownChanges(question, subject),
  ];
  let answer = NUMBER_BASE[question](engine, state, subject);
  const set = highest(changes, "set", question);
  if (set !== undefined) answer = set;
  for (const { change } of changes) if ("add" in change) answer += change.add;
  for (const { change } of changes)
    if ("fewer" in change && answer > change.minimum)
      answer = Math.max(answer - change.fewer, change.minimum);
  for (const { change } of changes)
    if ("multiply" in change) answer *= change.multiply;
  for (const { change } of changes)
    if ("atMost" in change) answer = Math.min(answer, change.atMost);
  for (const { change } of changes)
    if ("atLeast" in change) answer = Math.max(answer, change.atLeast);
  const fix = highest(changes, "fix", question);
  if (fix !== undefined) answer = fix;
  if (question === "dicePool") answer = Math.min(Math.max(answer, 0), MAX_DICE);
  return answer;
}

/** A change the subject carries itself: dice the rule asking for one roll
 *  adds or takes away ("an explorer in the Gardens rolls 2 fewer dice"). The
 *  rule needn't be live by the time the roll is made, so it isn't a source. */
function ownChanges(
  question: keyof NumberQuestions,
  subject: NumberQuestions[keyof NumberQuestions],
): Applied<NumberChange>[] {
  if (question !== "dicePool") return [];
  const { roll } = subject as NumberQuestions["dicePool"];
  if (roll.extraDice === 0) return [];
  return [
    {
      layer: LAYER_OF[roll.rule.source],
      change: { add: roll.extraDice },
      rule: roll.rule,
    },
  ];
}

/** The highest layer's value for an operation. Two different values in one layer are a rules conflict the rulebook doesn't settle. */
function highest(
  changes: Applied<NumberChange>[],
  op: "set" | "fix",
  question: string,
): number | undefined {
  for (const layer of [...LAYERS].reverse()) {
    const values = changes.filter((c) => c.layer === layer && op in c.change);
    if (values.length === 0) continue;
    const distinct = new Set(
      values.map((c) => (c.change as Record<string, number>)[op]),
    );
    if (distinct.size > 1) {
      throw new Error(
        `Conflicting ${op} on ${question} in the ${layer} layer: ${JSON.stringify(values.map((v) => v.rule))}`,
      );
    }
    return [...distinct][0];
  }
  return undefined;
}

/** Allowed unless a source denies it. Within a layer a denial beats an allowance; a higher layer's allowance overrules a lower denial. */
export function askPermission<Q extends keyof PermissionQuestions>(
  engine: Engine,
  state: GameState,
  question: Q,
  subject: PermissionQuestions[Q],
): Permission {
  const changes = applicable<PermissionChange>(
    engine,
    state,
    question,
    subject,
  );
  let answer: Permission = { allowed: true, because: [] };
  for (const layer of LAYERS) {
    const here = changes.filter((c) => c.layer === layer);
    const denials = here.filter((c) => "deny" in c.change);
    if (denials.length > 0)
      answer = { allowed: false, because: denials.map((c) => c.rule) };
    else if (here.length > 0)
      answer = { allowed: true, because: here.map((c) => c.rule) };
  }
  return answer;
}

/** A barrier room's sides, one by each door, named by its printed edge
 *  (p. 7). Any other room has none. */
export function barrierSides(engine: Engine, room: string): Edge[] {
  return engine.behaviours.rooms[room]?.barrier
    ? engine.catalog.rooms[room].doors
    : [];
}

const SET_BASE: {
  [Q in keyof SetQuestions]: (
    engine: Engine,
    state: GameState,
    subject: SetQuestions[Q],
  ) => SetItems[Q][];
} = {
  // Through a barrier room only its own side's door leads on; arriving in one
  // through a door puts you on that door's side.
  connections: (engine, state, { from }) => {
    const { board } = state;
    const sides = barrierSides(engine, from.room);
    let directions: Edge[] | undefined;
    if (sides.length > 0) {
      const tile = placed(board, from.room);
      if (!tile || from.side === null)
        throw new Error(`No side given in the barrier room ${from.room}`);
      directions = [turn(from.side, tile.rotation)];
    }
    return connections(board, engine.catalog, from.room, directions).map(
      (room) => ({
        room,
        side:
          barrierSides(engine, room).length > 0
            ? doorToward(board, engine.catalog, room, from.room)
            : null,
      }),
    );
  },
  adjacency: (_engine, state, { room }) => adjacent(state.board, room),
  lineOfSight: (engine, state, { room }) =>
    lineOfSight(state.board, engine.catalog, room),
};

const itemRoom = (item: Place | string) =>
  typeof item === "string" ? item : item.room;

/** The base answer, then each layer's additions and removals in layer order.
 *  Within a layer a removal beats an addition. */
export function askSet<Q extends keyof SetQuestions>(
  engine: Engine,
  state: GameState,
  question: Q,
  subject: SetQuestions[Q],
): SetItems[Q][] {
  type Change =
    | { add: (s: GameState, subject: unknown, source: Source) => SetItems[Q][] }
    | { remove: (s: GameState, subject: unknown, source: Source) => string[] };
  const changes: (Applied<Change> & { source: Source })[] = [];
  for (const { source, behaviour } of liveSources(engine, state)) {
    for (const modifier of behaviour.modifiers ?? []) {
      if (modifier.question !== question) continue;
      // The modifier's own type ties `when` and its change to this question.
      const when = modifier.when as
        | ((
            s: GameState,
            subject: unknown,
            source: Source,
            engine: Engine,
          ) => boolean)
        | undefined;
      if (when && !when(state, subject, source, engine)) continue;
      changes.push({
        layer: source.layer,
        change: modifier.change as Change,
        rule: source.rule,
        source,
      });
    }
  }
  const answer = new Map<string, SetItems[Q]>();
  for (const item of SET_BASE[question](engine, state, subject))
    answer.set(JSON.stringify(item), item);
  for (const layer of LAYERS) {
    const here = changes.filter((c) => c.layer === layer);
    for (const { change, source } of here)
      if ("add" in change)
        for (const item of change.add(state, subject, source))
          answer.set(JSON.stringify(item), item);
    for (const { change, source } of here)
      if ("remove" in change) {
        const rooms = change.remove(state, subject, source);
        for (const [key, item] of answer)
          if (rooms.includes(itemRoom(item))) answer.delete(key);
      }
  }
  return [...answer.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, item]) => item);
}

const STRUCTURED_BASE: {
  [Q in keyof StructuredQuestions]: (
    engine: Engine,
    state: GameState,
    subject: StructuredQuestions[Q]["question"],
  ) => StructuredQuestions[Q]["answer"];
} = {
  controller: (_engine, state, { figure }) => figureOf(state, figure).owner,
  // A figure is on its owning seat's side; one no seat owns is on none
  // unless a rule says otherwise.
  side: (_engine, state, { figure }) => {
    const owner = figureOf(state, figure).owner;
    return owner === null ? null : state.seats[owner].side;
  },
  // Monsters and the traitor are the heroes' opponents, and the heroes
  // theirs (p. 22): figures on two different sides, neither of them neutral.
  isOpponent: (engine, state, { figure, other }) => {
    if (figure === other) return false;
    const mine = askStructured(engine, state, "side", { figure });
    const theirs = askStructured(engine, state, "side", { figure: other });
    return (
      mine !== null &&
      theirs !== null &&
      mine !== "neutral" &&
      theirs !== "neutral" &&
      mine !== theirs
    );
  },
  hinders: (engine, state, { hinderer, mover }) => {
    const figure = figureOf(state, hinderer);
    return (
      figure.alive &&
      !figure.stunned &&
      askStructured(engine, state, "isOpponent", {
        figure: mover,
        other: hinderer,
      })
    );
  },
  // Before the haunt no one can die: a trait stops at its lowest value. From
  // the haunt on, a trait at the skull kills (p. 5).
  lethalOutcome: (_engine, state) =>
    state.status === "exploring" ? { kind: "clamp" } : { kind: "death" },
  turnOrder: (_engine, state) => baseRound(state),
  // All attacks use Might unless a card or ability says otherwise (p. 13).
  attackModes: () => [{ trait: "might", card: null, reach: "room" }],
  // The higher result deals the difference as damage to the loser; a tie
  // hurts no one. Sanity and Knowledge attacks deal mental damage (p. 13). A
  // monster that would take damage is stunned instead (p. 18).
  combatOutcome: (
    engine,
    state,
    { attack, mode, attackResult, defenceResult },
  ) => {
    const margin = attackResult - defenceResult;
    if (margin === 0) return { loser: null, harm: null, steal: false };
    const kind = PHYSICAL.includes(mode.trait) ? "physical" : "mental";
    const harm = (figure: FigureId, points: number): Harm =>
      takesDamage(engine.catalog, state, figure)
        ? { kind: "damage", damage: kind, points, rule: attack.rule }
        : { kind: "stun", rule: { source: "rulebook", page: 18 } };
    const defender = figureOf(state, attack.defender);
    // An attack on someone in another room is a distance attack: an
    // attacker it beats takes no damage, and nothing can be stolen (p. 13).
    const near =
      attack.attacker !== null &&
      together(figureOf(state, attack.attacker), defender);
    if (margin > 0)
      return {
        loser: "defender",
        harm: harm(attack.defender, margin),
        steal: near && kind === "physical" && margin >= 2,
      };
    // Nor is an attacker a card stands in for harmed: it has no traits. A
    // stunned monster defends, but deals no damage when it wins (p. 13).
    if (attack.attacker === null || !near || defender.stunned)
      return { loser: "attacker", harm: null, steal: false };
    return {
      loser: "attacker",
      harm: harm(attack.attacker, -margin),
      steal: false,
    };
  },
};

/** The base answer, then each layer's modifiers transforming it in layer order. */
export function askStructured<Q extends keyof StructuredQuestions>(
  engine: Engine,
  state: GameState,
  question: Q,
  subject: StructuredQuestions[Q]["question"],
): StructuredQuestions[Q]["answer"] {
  type Answer = StructuredQuestions[Q]["answer"];
  type Transform = (
    s: GameState,
    subject: unknown,
    answer: Answer,
    source: Source,
  ) => Answer;
  const changes: { layer: Layer; transform: Transform; source: Source }[] = [];
  for (const { source, behaviour } of liveSources(engine, state)) {
    for (const modifier of behaviour.modifiers ?? []) {
      if (modifier.question !== question) continue;
      // The modifier's own type ties `when` and its change to this question.
      const when = modifier.when as
        | ((
            s: GameState,
            subject: unknown,
            source: Source,
            engine: Engine,
          ) => boolean)
        | undefined;
      if (when && !when(state, subject, source, engine)) continue;
      const change = modifier.change as { transform: Transform };
      changes.push({
        layer: source.layer,
        transform: change.transform,
        source,
      });
    }
  }
  let answer = STRUCTURED_BASE[question](engine, state, subject) as Answer;
  for (const layer of LAYERS)
    for (const { transform, source } of changes.filter(
      (c) => c.layer === layer,
    ))
      answer = transform(state, subject, answer, source);
  return answer;
}

/** The spaces a figure's next move out of its room costs: 1, and whatever
 *  leaving costs on top (opponents in the way, p. 17). */
export function moveCost(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): number {
  return (
    1 +
    askNumber(engine, state, "leaveCost", {
      figure,
      from: figureOf(state, figure).place ?? noPlace(figure),
    })
  );
}

function noPlace(figure: FigureId): never {
  throw new Error(`${figure} isn't on the board`);
}

/** A figure's value in a trait, as the rules stand. */
export function traitValue(
  engine: Engine,
  state: GameState,
  figure: FigureId,
  trait: Trait,
): number {
  return askNumber(engine, state, "traitValue", { figure, trait });
}

/** Whether a figure has a trait at all: an explorer has all four, a monster
 *  only those its definition gives (p. 13). */
export function hasTrait(
  engine: Engine,
  state: GameState,
  figure: FigureId,
  trait: Trait,
): boolean {
  const source = figureDefinition(engine.catalog, state, figure).traits;
  return source.kind === "tracks" || source.values[trait] !== undefined;
}

/** The seat that decides for a figure, where one must. */
export function controllerOf(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): number {
  const seat = askStructured(engine, state, "controller", { figure });
  if (seat === null) throw new Error(`No seat controls ${figure}`);
  return seat;
}

/** Whether it is the turn of the seat controlling a figure. */
export function onTurn(
  engine: Engine,
  state: GameState,
  figure: FigureId,
): boolean {
  return (
    state.turn !== null &&
    askStructured(engine, state, "controller", { figure }) === state.turn.seat
  );
}
