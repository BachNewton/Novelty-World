import type { Edge, FigureId, GameState, Place, RuleRef, Step } from "../types";
import { sideName } from "./board";
import { chooseOne, defineStep, relocate, step } from "./effects";
import { figureName, figureOf, placeOf } from "./figures";
import { askSet, barrierSides, type Mover } from "./questions";
import type { Engine, StepHandler } from "./step-loop";

// Routes through the house, barrier crossings and moves that aren't a
// player's own movement. Every route follows the connections question, so
// whatever adds or blocks a connection changes them all.

const placeKey = (place: Place) => `${place.room}|${place.side ?? ""}`;

/** Spaces of movement from a place to every place reachable from it, by the
 *  mover's connections. With `crossBarriers`, crossing a barrier room counts
 *  as no space (p. 7), as when measuring a route; otherwise it can't be
 *  crossed. */
export function routeDistances(
  engine: Engine,
  state: GameState,
  mover: Mover,
  from: Place,
  crossBarriers: boolean,
): { place: Place; distance: number }[] {
  const found = new Map<string, { place: Place; distance: number }>([
    [placeKey(from), { place: from, distance: 0 }],
  ]);
  // A breadth-first search where crossing costs nothing: free steps go to the
  // front of the queue, so each place is first settled at its least distance.
  const queue: Place[] = [from];
  while (queue.length > 0) {
    const place = queue.shift();
    if (!place) break;
    const distance = found.get(placeKey(place))?.distance ?? 0;
    const across = crossBarriers
      ? barrierSides(engine, place.room)
          .filter((side) => side !== place.side)
          .map((side) => ({ place: { room: place.room, side }, cost: 0 }))
      : [];
    const steps = askSet(engine, state, "connections", {
      mover,
      from: place,
    }).map((next) => ({ place: next, cost: 1 }));
    for (const next of [...across, ...steps]) {
      const key = placeKey(next.place);
      const known = found.get(key);
      if (known && known.distance <= distance + next.cost) continue;
      found.set(key, { place: next.place, distance: distance + next.cost });
      if (next.cost === 0) queue.unshift(next.place);
      else queue.push(next.place);
    }
  }
  return [...found.values()];
}

/** Spaces from a place to the nearest side of a room, or null when no route leads there. */
export function distanceTo(
  engine: Engine,
  state: GameState,
  mover: Mover,
  from: Place,
  room: string,
): number | null {
  const there = routeDistances(engine, state, mover, from, true).filter(
    (r) => r.place.room === room,
  );
  return there.length === 0
    ? null
    : Math.min(...there.map((r) => r.distance));
}

type Closer = {
  figure: FigureId;
  toward: string;
  chooser: FigureId;
  rule: RuleRef;
};

/** Moves a figure 1 space closer to a room, along a shortest route by the
 *  connections it could move through. The seat controlling `chooser` picks
 *  among routes that tie. Already there, or with no way closer, it stays. It
 *  spends none of its movement, and leaving its room runs its rules for
 *  leaving. */
export function moveCloser(
  figure: FigureId,
  toward: string,
  chooser: FigureId,
  rule: RuleRef,
): Step {
  return step<Closer>("move-closer", { figure, toward, chooser, rule });
}

type Cross = { figure: FigureId; side: Edge; rule: RuleRef };

/** A figure crosses its barrier room to the other side. */
export function crossBarrier(
  figure: FigureId,
  side: Edge,
  rule: RuleRef,
): Step {
  return step<Cross>("cross-barrier", { figure, side, rule });
}

export const MOVEMENT_STEPS: Record<string, StepHandler> = {
  "move-closer": defineStep<Closer>((state, p, ctx) => {
    const mover: Mover = { kind: "figure", figure: p.figure };
    const away = (from: Place) =>
      distanceTo(ctx.engine, state, mover, from, p.toward);
    const now = away(placeOf(state, p.figure));
    if (now === null || now === 0) return;
    const closer = askSet(ctx.engine, state, "connections", {
      mover,
      from: placeOf(state, p.figure),
    }).filter((next) => {
      const distance = away(next);
      return distance !== null && distance < now;
    });
    if (closer.length === 0) return;
    const name = figureName(ctx.catalog, state, p.figure);
    ctx.push(
      chooseOne(
        p.chooser,
        closer.map((next) => ({
          label: `Move ${name} to the ${ctx.catalog.rooms[next.room].name}${next.side === null ? "" : `, on its ${sideName(state.board, next.room, next.side)} side`}`,
          steps: [relocate(p.figure, next.room, p.rule, next.side)],
        })),
        p.rule,
      ),
    );
  }),

  "cross-barrier": defineStep<Cross>((state, p, ctx) => {
    const { room } = placeOf(state, p.figure);
    if (!barrierSides(ctx.engine, room).includes(p.side))
      throw new Error(`${room} has no ${p.side} side to cross to`);
    figureOf(state, p.figure).place = { room, side: p.side };
    ctx.emit("crossed", p.rule, { figure: p.figure, room, side: p.side });
  }),
};
