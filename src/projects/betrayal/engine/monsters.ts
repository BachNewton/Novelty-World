import type { Edge, FigureId, GameState, RuleRef, Step } from "../types";
import { chooseOne, chooseSide, defineStep, roll, step } from "./effects";
import { allFigures, figureName, figureOf, placeOf } from "./figures";
import { distanceTo, moveCloser } from "./movement";
import { askStructured, barrierSides } from "./questions";
import { inPlay } from "./sides";
import type { Engine, StepHandler } from "./step-loop";

// The monster turn (rules pp. 18-19, and its project ruling): at its start
// each monster stunned before it begins misses it, and one movement roll is
// made for each type of monster left; then the seat's controller has its
// monsters act one at a time, each moving and attacking as an explorer does
// before the next goes; at its end the monsters that missed it recover.
// Monsters that come into play during the turn wait for the next. Moving and
// attacking are the turn's own choices (exploration.ts), made for whichever
// figure is acting, so a monster moves by the same code as an explorer.

const RULEBOOK = (page: number): RuleRef => ({ source: "rulebook", page });

/** Monsters the seat controls that are in play: those its monster turn is
 *  for. */
function monstersOf(engine: Engine, state: GameState, seat: number): FigureId[] {
  return allFigures(state)
    .filter(
      (f) =>
        inPlay(f) &&
        askStructured(engine, state, "monsterRules", { figure: f.id }) &&
        askStructured(engine, state, "controller", { figure: f.id }) === seat,
    )
    .map((f) => f.id);
}

/** The turn's actors still to act: not finished, not acting now, and
 *  still able to (in play, and not stunned). */
export function readyActors(state: GameState): FigureId[] {
  const turn = state.turn;
  if (turn === null) return [];
  return turn.actors.filter((id) => {
    const figure = figureOf(state, id);
    return (
      id !== turn.acting &&
      !turn.done.includes(id) &&
      inPlay(figure) &&
      !figure.stunned
    );
  });
}

/** Sets up a monster turn: who misses it, who acts, and the movement rolls. */
export function monsterTurnStart(): Step {
  return step<null>("monster-turn-start", null);
}

/** A figure starts taking its actions. */
export function activate(figure: FigureId): Step {
  return step<{ figure: FigureId }>("activate", { figure });
}

/** The figure acting has finished. A monster that ends its movement in a
 *  barrier room is put on the side its controller chooses (p. 7). */
export function finishActing(): Step {
  return step<null>("finish-acting", null);
}

/** At a monster turn's end, the monsters that missed it recover (p. 18). */
export function recoverStunned(): Step {
  return step<null>("recover-stunned", null);
}

type Pull = {
  /** The figure the monsters are pulled toward. */
  toward: FigureId;
  rule: RuleRef;
  /** Monsters its own controller controls stay put (the Bell, when the
   *  traitor rings it). */
  skipOwn: boolean;
};

/** Monsters are pulled 1 space closer to a figure (the Bell, the Spirit
 *  Board): each controller chooses, monster by monster, whether to pull
 *  theirs; a monster no seat controls ("if there is no traitor") always
 *  comes. A pull spends no movement and gives no attack (the Bell's project
 *  ruling). Stunned monsters can be pulled. */
export function pullMonsters(
  toward: FigureId,
  rule: RuleRef,
  { skipOwn = false }: { skipOwn?: boolean } = {},
): Step {
  return step<Pull>("pull-monsters", { toward, rule, skipOwn });
}

export const MONSTER_STEPS: Record<string, StepHandler> = {
  "monster-turn-start": defineStep<null>((state, _p, ctx) => {
    const turn = state.turn;
    if (turn === null) throw new Error("No monster turn to start");
    const monsters = monstersOf(ctx.engine, state, turn.seat);
    turn.recovering = monsters.filter((id) => figureOf(state, id).stunned);
    turn.actors = monsters.filter((id) => !figureOf(state, id).stunned);
    turn.acting = null;
    for (const figure of turn.recovering)
      ctx.emit("turn-missed", RULEBOOK(18), { figure });
    const types = [
      ...new Set(turn.actors.map((id) => figureOf(state, id).definition)),
    ];
    ctx.push(
      ...types.map((definition) => {
        const first = turn.actors.find(
          (id) => figureOf(state, id).definition === definition,
        );
        if (first === undefined) throw new Error(`No ${definition} acts`);
        return roll(
          first,
          { kind: "movement" },
          RULEBOOK(18),
          step<{ definition: string }>("movement-rolled", { definition }),
        );
      }),
    );
  }),

  "movement-rolled": defineStep<{ definition: string; result: number }>(
    (state, p) => {
      if (state.turn === null) throw new Error("No turn to move on");
      state.turn.rolled[p.definition] = p.result;
    },
  ),

  activate: defineStep<{ figure: FigureId }>((state, p, ctx) => {
    if (state.turn === null) throw new Error("No turn to act on");
    state.turn.acting = p.figure;
    ctx.emit("acting", RULEBOOK(18), {
      figure: p.figure,
      room: placeOf(state, p.figure).room,
    });
  }),

  "finish-acting": defineStep<null>((state, _p, ctx) => {
    const turn = state.turn;
    const figure = turn?.acting ?? null;
    if (turn === null || figure === null) return;
    turn.acting = null;
    turn.done.push(figure);
    const place = figureOf(state, figure).place;
    if (
      place === null ||
      !figureOf(state, figure).alive ||
      !askStructured(ctx.engine, state, "ignoresBarriers", { figure })
    )
      return;
    const sides = barrierSides(ctx.engine, place.room);
    if (sides.length === 0) return;
    ctx.push(
      chooseSide(
        state,
        figure,
        place.room,
        sides,
        RULEBOOK(7),
        step<{ figure: FigureId }>("settle-side", { figure }),
        ctx.catalog.rooms[place.room].name,
      ),
    );
  }),

  "settle-side": defineStep<{ figure: FigureId; side: Edge }>(
    (state, p, ctx) => {
      const { room } = placeOf(state, p.figure);
      figureOf(state, p.figure).place = { room, side: p.side };
      ctx.emit("side-chosen", RULEBOOK(7), {
        figure: p.figure,
        room,
        side: p.side,
      });
    },
  ),

  "recover-stunned": defineStep<null>((state, _p, ctx) => {
    for (const id of state.turn?.recovering ?? []) {
      const figure = figureOf(state, id);
      if (!figure.alive || !figure.stunned) continue;
      figure.stunned = false;
      ctx.emit("recovered", RULEBOOK(18), { figure: id });
    }
  }),

  "pull-monsters": defineStep<Pull>((state, p, ctx) => {
    const here = placeOf(state, p.toward).room;
    const own = askStructured(ctx.engine, state, "controller", {
      figure: p.toward,
    });
    const pulled = allFigures(state).filter((f) => {
      if (!inPlay(f)) return false;
      if (!askStructured(ctx.engine, state, "monsterRules", { figure: f.id }))
        return false;
      const away = distanceTo(
        ctx.engine,
        state,
        { kind: "figure", figure: f.id },
        placeOf(state, f.id),
        here,
      );
      return away !== null && away > 0;
    });
    for (const monster of pulled) {
      const controller = askStructured(ctx.engine, state, "controller", {
        figure: monster.id,
      });
      if (p.skipOwn && controller !== null && controller === own) continue;
      const move = moveCloser(
        monster.id,
        here,
        controller === null ? p.toward : monster.id,
        p.rule,
      );
      if (controller === null) {
        ctx.push(move);
        continue;
      }
      const name = figureName(ctx.catalog, state, monster.id);
      ctx.push(
        chooseOne(
          monster.id,
          [
            { label: `Move ${name} 1 space closer`, steps: [move] },
            { label: `Leave ${name} where it is`, steps: [] },
          ],
          p.rule,
        ),
      );
    }
  }),
};
