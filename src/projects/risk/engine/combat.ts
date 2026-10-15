import type { Move, Seat } from "../contract";
import type { TerritoryId } from "../map";
import { findAttack } from "./legal";
import { beginForcedTrade } from "./reinforce";
import { holding, isTerritoryId, ownedBy, rollDie, seatsInGame, setPhase, type Ctx } from "./state";
import { endAttackPhase } from "./turn";

/** One battle (`COMBAT-4`) with the attacker's chosen dice. */
export function attack(ctx: Ctx, seat: Seat, move: Extract<Move, { kind: "attack" }>): string | null {
  const s = ctx.s;
  if (s.occupying) return "move armies into the captured territory first";
  if (!isTerritoryId(move.from) || !isTerritoryId(move.to)) return "no such territory";
  const legal = findAttack(s, seat, move.from, move.to);
  if (!legal) return "that attack is not allowed";
  if (!Number.isInteger(move.dice) || move.dice < 1 || move.dice > legal.maxDice) {
    return `roll between 1 and ${legal.maxDice} dice`;
  }
  battle(ctx, seat, move.from, move.to, move.dice);
  return null;
}

/** Battles with the most dice allowed until `to` is captured or `from` is down to `keepAtLeast`.
 *  The dice are capped so that a battle can never take `from` below `keepAtLeast`: the attacker
 *  loses at most one army per die rolled (`COMBAT-4`). */
export function blitz(ctx: Ctx, seat: Seat, move: Extract<Move, { kind: "blitz" }>): string | null {
  const s = ctx.s;
  if (s.occupying) return "move armies into the captured territory first";
  if (!isTerritoryId(move.from) || !isTerritoryId(move.to)) return "no such territory";
  if (!findAttack(s, seat, move.from, move.to)) return "that attack is not allowed";
  const from = holding(s, move.from);
  if (!Number.isInteger(move.keepAtLeast) || move.keepAtLeast < 1 || move.keepAtLeast >= from.armies) {
    return `keep between 1 and ${from.armies - 1} armies`;
  }

  for (;;) {
    const dice = Math.min(3, from.armies - move.keepAtLeast);
    const captured = battle(ctx, seat, move.from, move.to, dice);
    if (captured || from.armies <= move.keepAtLeast) return null;
  }
}

/** `COMBAT-3` and `COMBAT-4`: the defender rolls the most dice it may (note `defender-dice`), the
 *  dice pair off highest first, and ties go to the defender. Returns whether `to` was captured. */
function battle(ctx: Ctx, seat: Seat, fromId: TerritoryId, toId: TerritoryId, dice: number): boolean {
  const s = ctx.s;
  const from = holding(s, fromId);
  const to = holding(s, toId);
  const attackerDice = rollDice(ctx, dice);
  const defenderDice = rollDice(ctx, Math.min(2, to.armies));

  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < Math.min(attackerDice.length, defenderDice.length); i++) {
    if (attackerDice[i] > defenderDice[i]) defenderLosses++;
    else attackerLosses++;
  }
  from.armies -= attackerLosses;
  to.armies -= defenderLosses;
  ctx.events.push({
    rule: "COMBAT-4",
    kind: "battle",
    from: fromId,
    to: toId,
    attackerDice,
    defenderDice,
    attackerLosses,
    defenderLosses,
  });

  if (to.armies > 0) return false;
  capture(ctx, seat, fromId, toId, dice);
  return true;
}

function rollDice(ctx: Ctx, count: number): number[] {
  const dice = Array.from({ length: count }, () => rollDie(ctx.rng));
  return dice.sort((a, b) => b - a);
}

/** `COMBAT-6`: the attacker takes the territory at once, moving in at least the dice just rolled.
 *  That minimum moves in with the capture, so no territory is ever empty (`INV-1`); the attacker
 *  then picks the total (`occupy`), unless the minimum is also the maximum. */
function capture(ctx: Ctx, seat: Seat, fromId: TerritoryId, toId: TerritoryId, dice: number): void {
  const s = ctx.s;
  const from = holding(s, fromId);
  const to = holding(s, toId);
  const previous = to.owner;
  const max = from.armies - 1;
  to.owner = seat;
  to.armies = dice;
  from.armies -= dice;
  s.capturedThisTurn = true;
  ctx.events.push({ rule: "COMBAT-6", kind: "captured", seat, territory: toId, from: previous });

  const eliminating = ownedBy(s, previous).length === 0 ? previous : null;
  if (eliminating !== null && seatsInGame(s).length === 2) {
    // WIN-1: the last opponent is gone and the game ends at once.
    eliminate(ctx, eliminating);
    s.winner = seat;
    setPhase(ctx, "game-over", "WIN-1");
    ctx.events.push({ rule: "WIN-1", kind: "game-over", winner: seat });
    return;
  }
  s.occupying = { from: fromId, to: toId, min: dice, max, eliminating };
}

/** `COMBAT-6`: the total armies moving in, between the dice rolled and all but one. */
export function occupy(ctx: Ctx, move: Extract<Move, { kind: "occupy" }>): string | null {
  const o = ctx.s.occupying;
  if (!o) return "there is no captured territory to move into";
  if (!Number.isInteger(move.armies) || move.armies < o.min || move.armies > o.max) {
    return `move between ${o.min} and ${o.max} armies`;
  }
  moveIn(ctx, move.armies);
  return null;
}

/** Completes a capture's move-in; an elimination follows it (note `elimination-order`). */
export function moveIn(ctx: Ctx, armies: number): void {
  const s = ctx.s;
  const o = s.occupying;
  if (!o) throw new Error("no capture is waiting for its move-in");
  const extra = armies - o.min;
  holding(s, o.from).armies -= extra;
  holding(s, o.to).armies += extra;
  s.occupying = null;
  ctx.events.push({ rule: "COMBAT-6", kind: "occupied", from: o.from, to: o.to, armies });

  if (o.eliminating === null) return;
  eliminate(ctx, o.eliminating);
  if (s.hands[s.active].length >= 6) beginForcedTrade(ctx);
}

/** `ELIM-1` and `ELIM-2`: out of the game, with every card going to the capturer. */
function eliminate(ctx: Ctx, loser: Seat): void {
  const s = ctx.s;
  const taken = s.hands[loser];
  s.eliminated[loser] = true;
  s.hands[s.active].push(...taken);
  s.hands[loser] = [];
  ctx.events.push({ rule: "ELIM-2", kind: "eliminated", seat: loser, by: s.active, cardsTaken: taken.length });
}

export function endAttack(ctx: Ctx): string | null {
  if (ctx.s.occupying) return "move armies into the captured territory first";
  endAttackPhase(ctx);
  return null;
}

