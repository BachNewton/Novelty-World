import { die } from "../engine/effects";
import { figureOf } from "../engine/figures";
import {
  addToCounter,
  count,
  hauntRule,
  insertTurn,
} from "../engine/haunt";
import { hauntNumbers } from "../engine/scenario";
import { sideOf } from "../engine/sides";
import {
  eventData,
  hauntSourceId,
  local,
  type Behaviour,
} from "../engine/sources";
import type { Engine } from "../engine/step-loop";
import { ENGINE } from "../game";
import { withHaunts, type HauntDefinition } from "../kit/haunt";
import type { FigureDefinition, FigureId, TurnKind } from "../types";

// A small haunt built from the kit, for testing the haunt framework without
// any real haunt's rules. The traitor dozes (can't act, slows no one) beside
// a Phantom, a monster with no Knowledge that the haunt places and never
// moves; a hero moving into a room adds a wake token, and the heroes win
// with one per player; each monster turn a nightmare escapes, and the
// traitor wins once as many have escaped as the number the traitor wrote
// down (the players).
// A few objective actions reach the framework's corners: an extra turn, both
// goals met in one step, and a hero dropping dead.

/** One status for every copy of the toy haunt, as a kit status shared by
 *  several haunts is one entry. */
export const DOZING: Behaviour = {
  name: "asleep",
  modifiers: [
    {
      question: "canAct",
      when: (_state, { figure }, source) => figure === source.holder,
      change: { deny: true },
    },
    {
      question: "hinders",
      when: (_state, { hinderer }, source) => hinderer === source.holder,
      change: { transform: () => false },
    },
  ],
};

/** The toy haunt's monster, one entry for every copy of the haunt. */
export const PHANTOM: FigureDefinition = {
  id: "phantom",
  name: "Phantom",
  kind: "monster",
  traits: { kind: "fixed", values: { speed: 3, might: 4, sanity: 3 } },
  token: null,
};

export function toyHaunt(
  number: number,
  changes: Partial<HauntDefinition> = {},
): HauntDefinition {
  const rule = hauntRule(number, "Rules");
  return {
    number,
    name: "Toy haunt",
    set: "base",
    content: "(a test haunt)",
    statuses: { dozing: DOZING },
    figures: [PHANTOM],
    counters: {
      wakes: { name: "wake tokens" },
      escapes: { name: "escaped nightmares" },
    },
    secrets: { target: { name: "number of escapes" } },
    setup: {
      traitor: [
        { part: "status", who: "traitor", status: "dozing" },
        {
          part: "spawn",
          figure: "phantom",
          count: 1,
          at: "traitor",
          owner: "traitor",
        },
        { part: "counter", counter: "escapes", start: 0 },
        {
          part: "secret",
          secret: "target",
          value: { of: "players" },
          knownBy: "traitor",
        },
      ],
      heroes: [{ part: "counter", counter: "wakes", start: 0 }],
    },
    reactions: [
      {
        event: "entered",
        when: (state, event, _source, engine) => {
          const d = eventData<{ figure: FigureId; moved: boolean }>(event);
          return d.moved && sideOf(engine, state, d.figure) === "heroes";
        },
        steps: () => [addToCounter("wakes", 1, rule)],
      },
      {
        event: "turn-started",
        when: (_state, event) =>
          eventData<{ kind: TurnKind }>(event).kind === "monster",
        steps: () => [addToCounter("escapes", 1, rule)],
      },
    ],
    actions: {
      extra: {
        label: "Take an extra turn after this one",
        side: "any",
        available: (state) =>
          state.insertedTurns.length === 0 && state.turn?.follows === null,
        steps: (state, figure) => {
          const seat = figureOf(state, figure).owner;
          if (seat === null) throw new Error(`${figure} has no seat`);
          return [insertTurn({ seat, kind: "explorer", rule })];
        },
      },
      both: {
        label: "Meet both goals at once",
        side: "any",
        steps: () => [local(hauntSourceId(number), "both")],
      },
      perish: {
        label: "Drop dead",
        side: "heroes",
        steps: (_state, figure) => [die(figure, rule)],
      },
    },
    steps: {
      // One step that meets both sides' goals.
      both: (state, _params, ctx) => {
        const haunt = state.haunt;
        if (haunt === null) throw new Error("No haunt");
        haunt.counters.wakes = state.seats.length;
        haunt.counters.escapes = count(ctx.engine, state, {
          of: "secret",
          secret: "target",
        });
      },
    },
    goals: [
      {
        id: "woken",
        side: "heroes",
        when: { counter: "wakes", atLeast: { of: "players" } },
      },
      {
        id: "escaped",
        side: "traitor",
        when: { counter: "escapes", atLeast: { of: "secret", secret: "target" } },
      },
    ],
    ...changes,
  };
}

/** The real engine with the toy haunt built as haunt 13 (lowest Sanity,
 *  except the revealer, on the chart) and haunt 6 (lowest Sanity). */
export const TOY_ENGINE: Engine = withHaunts(ENGINE, [toyHaunt(13), toyHaunt(6)]);

/** The real engine with the toy haunt built under every number on the
 *  chart, so random play goes through the haunt to its end. */
export const ALL_TOY_ENGINE: Engine = withHaunts(
  ENGINE,
  hauntNumbers(ENGINE.catalog).map((n) => toyHaunt(n)),
);
