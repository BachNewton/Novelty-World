import { shuffleArray } from "@/shared/lib/utils";
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

/** `CARDS-1`: the end of the attack phase draws one card if the turn captured anything; then the
 *  fortify phase. */
export function endAttackPhase(ctx: Ctx): void {
  if (ctx.s.capturedThisTurn) drawCard(ctx);
  setPhase(ctx, "fortify", "TURN-1");
}

/** `CARDS-8` and note `empty-deck`: an empty draw pile is replaced by the shuffled discard pile;
 *  with both empty, no card is drawn. */
function drawCard(ctx: Ctx): void {
  const s = ctx.s;
  if (s.drawPile.length === 0) {
    if (s.discardPile.length === 0) return;
    s.drawPile = shuffleArray(s.discardPile, ctx.rng.next);
    s.discardPile = [];
    ctx.events.push({ rule: "empty-deck", kind: "deck-reshuffled" });
  }
  const card = s.drawPile.shift();
  if (card === undefined) throw new Error("the draw pile is empty after a reshuffle");
  s.hands[s.active].push(card);
  ctx.events.push({ rule: "CARDS-1", kind: "card-drawn", seat: s.active, card });
}

/** `FORT-3` and `TURN-2`: the turn passes to the next seat still in the game. */
export function endTurn(ctx: Ctx): void {
  const s = ctx.s;
  const next = nextSeat(s, s.active, (seat) => !s.eliminated[seat]);
  if (next === null) throw new Error("no seat is left to take a turn");
  startTurn(ctx, next, "TURN-2");
}
