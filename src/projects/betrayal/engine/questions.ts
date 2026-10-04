import type { GameState, RuleRef } from "../types";
import { traitValue } from "./explorers";
import {
  LAYERS,
  liveSources,
  type Layer,
  type RollContext,
  type Source,
} from "./sources";
import type { Engine } from "./step-loop";

// The engine never hard-codes a rule a card, room or haunt might change. It
// asks a question, and every live source may change the answer. Choice listing
// and applying ask the same questions, so legality has one source.

export interface NumberQuestions {
  /** How many dice a roll gets. */
  dicePool: { seat: number; roll: RollContext };
  /** How much damage lands, before the player splits it. */
  damageAmount: {
    seat: number;
    damage: "physical" | "mental";
    amount: number;
    rule: RuleRef;
  };
  /** Spaces of movement a turn allows. */
  movement: { seat: number };
}

export interface PermissionQuestions {
  /** Whether an explorer may take any action on their turn. */
  canAct: { seat: number };
  /** Whether an explorer may move from one room to another. */
  canMove: { seat: number; from: string; to: string };
}

export type NumberChange =
  | { set: number }
  | { add: number }
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
    ) => boolean;
    change: PermissionChange;
  };
}[keyof PermissionQuestions];

export type Modifier = NumberModifier | PermissionModifier;

export interface Permission {
  allowed: boolean;
  /** The rules behind the answer, for the "why?" in the log. */
  because: RuleRef[];
}

const MAX_DICE = 8;

const NUMBER_BASE: {
  [Q in keyof NumberQuestions]: (
    engine: Engine,
    state: GameState,
    subject: NumberQuestions[Q],
  ) => number;
} = {
  dicePool: (engine, state, { seat, roll }) => {
    switch (roll.spec.kind) {
      case "trait":
        return traitValue(engine.catalog, state, seat, roll.spec.trait);
      case "dice":
        return roll.spec.count;
      case "haunt":
        return 6;
    }
  },
  damageAmount: (_engine, _state, { amount }) => amount,
  movement: (engine, state, { seat }) =>
    traitValue(engine.catalog, state, seat, "speed"),
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
  for (const { source, behaviour } of liveSources(engine.behaviours, state)) {
    for (const modifier of behaviour.modifiers ?? []) {
      if (modifier.question !== question) continue;
      // The modifier's own type ties `when` to this question's subject.
      const when = modifier.when as
        | ((s: GameState, subject: unknown, source: Source) => boolean)
        | undefined;
      if (when && !when(state, subject, source)) continue;
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
  const changes = applicable<NumberChange>(engine, state, question, subject);
  let answer = NUMBER_BASE[question](engine, state, subject);
  const set = highest(changes, "set", question);
  if (set !== undefined) answer = set;
  for (const { change } of changes) if ("add" in change) answer += change.add;
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
