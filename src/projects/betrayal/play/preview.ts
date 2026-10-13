import type { RuleNotes } from "../data/rule-notes";
import { TOKENS } from "../data/tokens";
import { traitName } from "../engine/describe";
import type { Through } from "../engine/sources";
import type { Engine } from "../engine/step-loop";
import type { FigureId, Place } from "../types";
import type { Lookahead, Reach, RouteWarning } from "./lookahead";
import { ruleStatement } from "./status";

/*
 * The route preview: what pointing at a place in the house shows before
 * anything is sent. It is one small value, plain data with nothing worked
 * out from it, so it can be sent to other players as it is and worded on
 * their screens: the target, who walks, the route, its cost, and the rules
 * it sets off on the way.
 */

export interface RoutePreview {
  /** The target's id. */
  target: string;
  figure: FigureId;
  /** Every place stood in on the way, from where the turn stands. */
  route: Place[];
  /** Spaces of movement the route spends, and the spaces left before it. */
  spaces: number;
  left: number;
  warnings: RouteWarning[];
}

export function routePreview(target: string, ahead: Lookahead, reach: Reach): RoutePreview {
  return { target, figure: ahead.figure, route: reach.route, spaces: reach.spaces, left: ahead.left, warnings: reach.warnings };
}

/** "3 of 4 spaces". */
export function costText(preview: Pick<RoutePreview, "spaces" | "left">): string {
  return `${preview.spaces} of ${preview.left} ${preview.left === 1 ? "space" : "spaces"}`;
}

/** Each rule a route sets off, in one plain sentence with its source named first, once each. */
export function warningLines(engine: Engine, notes: RuleNotes | null, preview: Pick<RoutePreview, "warnings">): string[] {
  const lines = preview.warnings.map(({ rule, event }) => ruleStatement(engine, notes, rule, event === null ? null : { type: event, data: {} }));
  return lines.filter((line, i) => lines.indexOf(line) === i);
}

/** The rooms a route walks through, each once in a row: a barrier room's sides are one room to walk. */
export function routeRooms(preview: Pick<RoutePreview, "route">): string[] {
  return preview.route.map((place) => place.room).filter((room, i, rooms) => i === 0 || rooms[i - 1] !== room);
}

/** Going through a connection, as its tag names it: "Wall Switch: Knowledge roll 3+", or "Wall Switch: no roll" for a figure it doesn't bind. */
export function throughText(through: Pick<Through, "token" | "roll">): string {
  const token = TOKENS.find((each) => each.id === through.token);
  if (!token) throw new Error(`No token kind ${through.token}`);
  return through.roll ? `${token.name}: ${traitName(through.roll.trait)} roll ${String(through.roll.min)}+` : `${token.name}: no roll`;
}

/** The exact chance that this many dice, each showing 0, 1 or 2 alike, total at least `min`. */
export function chanceAtLeast(dice: number, min: number): number {
  let ways = [1];
  for (let die = 0; die < dice; die++) {
    const next = Array<number>(ways.length + 2).fill(0);
    ways.forEach((count, total) => {
      for (let face = 0; face <= 2; face++) next[total + face] += count;
    });
    ways = next;
  }
  return ways.reduce((sum, count, total) => (total >= min ? sum + count : sum), 0) / 3 ** dice;
}

/** A chance as a whole percent, never rounded to 0% or 100% when it could still go either way. */
export function percentText(chance: number): string {
  if (chance === 0 || chance === 1) return `${String(chance * 100)}%`;
  return `${String(Math.min(99, Math.max(1, Math.round(chance * 100))))}%`;
}
