import type { Move, Seat } from "../contract";
import { fortifyDestinations } from "./legal";
import { holding, isTerritoryId, ownerOf, type Ctx } from "./state";
import { endTurn } from "./turn";

/** `FORT-1`: one move along owned territories, leaving at least 1 army behind; it ends the turn
 *  (`FORT-3`). */
export function fortify(ctx: Ctx, seat: Seat, move: Extract<Move, { kind: "fortify" }>): string | null {
  const s = ctx.s;
  if (!isTerritoryId(move.from) || !isTerritoryId(move.to)) return "no such territory";
  if (ownerOf(s, move.from) !== seat) return "fortify from a territory you own";
  if (!fortifyDestinations(s, seat, move.from).includes(move.to)) {
    return "fortify to a territory joined to it through your own";
  }
  const from = holding(s, move.from);
  if (!Number.isInteger(move.armies) || move.armies < 1 || move.armies >= from.armies) {
    return `move between 1 and ${from.armies - 1} armies`;
  }

  from.armies -= move.armies;
  holding(s, move.to).armies += move.armies;
  ctx.events.push({ rule: "FORT-1", kind: "fortified", from: move.from, to: move.to, armies: move.armies });
  endTurn(ctx);
  return null;
}

/** `FORT-3`: the turn ends without fortifying. */
export function skipFortify(ctx: Ctx): string | null {
  endTurn(ctx);
  return null;
}
