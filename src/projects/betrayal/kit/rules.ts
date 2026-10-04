import type {
  FigureId,
  GameEvent,
  GameState,
  RuleRef,
  Side,
  Step,
  Trait,
} from "../types";
import { roll, table } from "../engine/effects";
import { canLeave } from "../engine/exploration";
import { figureOf, together } from "../engine/figures";
import {
  count,
  escape,
  figuresIn,
  matchesRoom,
  offerReplacement,
  settingUp,
  taskResult,
  type Count,
  type FigureGroup,
  type RoomMatch,
  type SeatGroup,
} from "../engine/haunt";
import type { DamageKind, Modifier } from "../engine/questions";
import { sideOf } from "../engine/sides";
import { eventData, type Reaction } from "../engine/sources";
import type { Engine } from "../engine/step-loop";
import type { ObjectiveAction } from "./haunt";

// Rule changes, triggers and objective actions a haunt is assembled from,
// each written for any haunt that needs the same rule.

const isA = (state: GameState, figure: FigureId, definition: string) =>
  figureOf(state, figure).definition === definition;

/** Every point of damage a figure of this definition deals is of this kind,
 *  whether it attacks or defends (haunt 13's Nightmares deal mental damage),
 *  under this rule. Damage that isn't physical can't be swapped for a theft
 *  (p. 13). */
export function dealsDamageAs(
  definition: string,
  kind: DamageKind,
  rule: RuleRef,
): Modifier {
  return {
    question: "combatOutcome",
    change: {
      transform: (state, { attack }, answer) => {
        if (answer.harm?.kind !== "damage" || answer.loser === null)
          return answer;
        const winner =
          answer.loser === "defender" ? attack.attacker : attack.defender;
        if (winner === null || !isA(state, winner, definition)) return answer;
        return {
          ...answer,
          harm: { ...answer.harm, damage: kind, rule },
          steal: kind === "physical" && answer.steal,
        };
      },
    },
  };
}

/** A figure of this definition that a figure on this side beats while
 *  attacking it is killed, not stunned. Beaten as the attacker, it suffers
 *  what it would otherwise. */
export function killedWhenBeatenBy(
  definition: string,
  side: Exclude<Side, "neutral">,
  rule: RuleRef,
): Modifier {
  return {
    question: "combatOutcome",
    when: (state, { attack }, _source, engine) =>
      attack.attacker !== null &&
      isA(state, attack.defender, definition) &&
      sideOf(engine, state, attack.attacker) === side,
    change: {
      transform: (_state, _subject, answer) =>
        answer.loser === "defender" && answer.harm !== null
          ? { ...answer, harm: { kind: "kill", rule } }
          : answer,
    },
  };
}

/** How many figures of a definition may be in play at once, worked out as
 *  the question is asked (one per player). */
export function supplyOf(definition: string, amount: Count): Modifier {
  return {
    question: "supply",
    when: (_state, subject) => subject.definition === definition,
    change: (state, _subject, _source, engine) => ({
      set: count(engine, state, amount),
    }),
  };
}

/** No step of the haunt's setup can kill: a trait it takes to the skull
 *  stops at its lowest value above it (haunt 13's dreamer). */
export const SETUP_CANT_KILL: Modifier = {
  question: "lethalOutcome",
  when: (state) => settingUp(state),
  change: { transform: () => ({ kind: "clamp" }) },
};

/** A figure of a definition leaves the house from a room that matches and
 *  has no marker yet, as its move out of the room: it costs a move's spaces
 *  of its own movement, opponents in the way included, but one that hasn't
 *  moved this turn can always go. A marker is left in the room and a
 *  counter steps (haunt 13's Nightmares escaping). */
export function escapeAction(how: {
  label: string;
  figure: string;
  rooms: RoomMatch;
  marker: string;
  counter: string;
  /** The secret the escapes race, for the log. */
  of: string | null;
  rule: RuleRef;
}): ObjectiveAction {
  return {
    label: how.label,
    side: "any",
    available: (state, figure, engine) => {
      const { place } = figureOf(state, figure);
      if (!isA(state, figure, how.figure) || place === null) return false;
      return (
        matchesRoom(engine.catalog, place.room, how.rooms) &&
        !state.tokens.some(
          (t) => t.token === how.marker && t.room === place.room,
        ) &&
        canLeave(engine, state, figure)
      );
    },
    steps: (_state, figure) => [
      escape(
        figure,
        { marker: how.marker, counter: how.counter, of: how.of },
        how.rule,
      ),
    ],
  };
}

/** Whenever a figure of a definition is killed or leaves play, the owning
 *  seat may at once put another beside a group's explorer, within the
 *  supply; a chance not taken is lost (haunt 13's Nightmares unleashed). */
export function replaceWhenLost(how: {
  figure: string;
  at: FigureGroup;
  owner: SeatGroup;
  rule: RuleRef;
}): Reaction[] {
  const lost = (state: GameState, event: GameEvent) =>
    isA(state, eventData<{ figure: FigureId }>(event).figure, how.figure);
  return ["died", "escaped"].map((type) => ({
    event: type,
    when: (state, event) => lost(state, event),
    steps: () => [
      offerReplacement(how.figure, { at: how.at, owner: how.owner }, how.rule),
    ],
  }));
}

/** A task roll (rules p. 13): a trait roll against a target, attempted at
 *  most once on each of the figure's turns, with any one of the traits that
 *  could do it. One objective action per trait, by id `<id>-<trait>`. */
export function taskRoll(how: {
  id: string;
  /** What the roll is for, in words ("wake the dreamer"). */
  task: string;
  traits: Trait[];
  target: number;
  side: Exclude<Side, "neutral">;
  available?: (state: GameState, figure: FigureId, engine: Engine) => boolean;
  /** What a success wins with each trait: a token, for the log, and its
   *  steps. */
  success: (trait: Trait) => { token: string | null; steps: Step[] };
  rule: RuleRef;
}): Record<string, ObjectiveAction> {
  return Object.fromEntries(
    how.traits.map((trait) => {
      const won = how.success(trait);
      const action: ObjectiveAction = {
        label: `Make a ${trait[0].toUpperCase()}${trait.slice(1)} roll of ${how.target}+ to ${how.task}`,
        side: how.side,
        available: (state, figure, engine) =>
          !(state.turn?.rolls.includes(how.id) ?? false) &&
          (how.available?.(state, figure, engine) ?? true),
        steps: (_state, figure) => [
          roll(
            figure,
            { kind: "trait", trait },
            how.rule,
            table([
              {
                min: how.target,
                max: null,
                steps: [
                  taskResult(
                    figure,
                    how.task,
                    { success: true, token: won.token },
                    how.rule,
                  ),
                  ...won.steps,
                ],
              },
              {
                min: 0,
                max: how.target - 1,
                steps: [
                  taskResult(
                    figure,
                    how.task,
                    { success: false, token: null },
                    how.rule,
                  ),
                ],
              },
            ]),
            { id: how.id },
          ),
        ],
      };
      return [`${how.id}-${trait}`, action];
    }),
  );
}

/** Whether a figure is in the room of a group's first living explorer. */
export function withExplorerOf(
  state: GameState,
  figure: FigureId,
  group: FigureGroup,
): boolean {
  const there = figuresIn(state, group).at(0);
  return (
    there !== undefined && together(figureOf(state, figure), figureOf(state, there))
  );
}

/** Whether a figure on a side, in this figure's room, carries a card. */
export function carriedHere(
  engine: Engine,
  state: GameState,
  figure: FigureId,
  card: string,
  side: Exclude<Side, "neutral">,
): boolean {
  const here = figureOf(state, figure);
  return Object.values(state.figures).some(
    (f) =>
      f.alive &&
      together(f, here) &&
      f.cards.includes(card) &&
      sideOf(engine, state, f.id) === side,
  );
}
