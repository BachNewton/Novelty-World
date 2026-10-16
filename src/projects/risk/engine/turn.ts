import type { Seat } from "../contract";
import { beginReinforce } from "./reinforce";
import { nextSeat, setPhase, type Ctx } from "./state";

/** A turn begins with its reinforce phase (`TURN-1`, `REINF-1`). */
export function startTurn(ctx: Ctx, seat: Seat, rule: string): void {
  const s = ctx.s;
  s.turn++;
  s.active = seat;
  s.capturedThisTurn = false;
  ctx.events.push({ rule, kind: "turn-started", seat, turn: s.turn });
  beginReinforce(ctx, seat);
}

/** The end of the attack phase: on to the fortify phase (`TURN-1`). */
export function endAttackPhase(ctx: Ctx): void {
  setPhase(ctx, "fortify", "TURN-1");
}

/** `CARDS-1` and `CARDS-8`: as the turn ends, one card from the top of the deck if the turn
 *  captured anything; none when the deck is empty. */
function drawCard(ctx: Ctx): void {
  const s = ctx.s;
  const card = s.deck.shift();
  if (card === undefined) return;
  s.hands[s.active].push(card);
  ctx.events.push({ rule: "CARDS-1", kind: "card-drawn", seat: s.active, card });
}

/** `FORT-3`, `CARDS-1` and `TURN-2`: the turn's card, then the turn passes to the next seat still
 *  in the game, a new round beginning when the turn order wraps round (`REINF-6`). */
export function endTurn(ctx: Ctx): void {
  const s = ctx.s;
  if (s.capturedThisTurn) drawCard(ctx);
  const next = nextSeat(s, s.active, (seat) => !s.eliminated[seat]);
  if (next === null) throw new Error("no seat is left to take a turn");
  if (s.turnOrder.indexOf(next) <= s.turnOrder.indexOf(s.active)) s.round++;
  startTurn(ctx, next, "TURN-2");
}
