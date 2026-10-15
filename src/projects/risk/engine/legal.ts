import type { Seat } from "../contract";
import { ADJACENCY, type TerritoryId } from "../map";
import { territoryOf } from "./cards";
import { holding, ownedBy, ownerOf, type EngineState, type ReinforceState } from "./state";

// What is legal right now. `options` lists these and `apply` checks moves against them, so the
// two cannot drift apart.

export interface Attack {
  from: TerritoryId;
  to: TerritoryId;
  maxDice: 1 | 2 | 3;
}

/** `COMBAT-1` and `COMBAT-2`: from an owned territory with at least 2 armies into an adjacent
 *  territory someone else owns, with up to 3 dice and fewer dice than armies. */
export function attacks(s: EngineState, seat: Seat): Attack[] {
  const result: Attack[] = [];
  for (const from of ownedBy(s, seat)) {
    const armies = holding(s, from).armies;
    if (armies < 2) continue;
    const maxDice = Math.min(3, armies - 1) as 1 | 2 | 3;
    for (const to of ADJACENCY[from]) {
      if (ownerOf(s, to) !== seat) result.push({ from, to, maxDice });
    }
  }
  return result;
}

export function findAttack(s: EngineState, seat: Seat, from: TerritoryId, to: TerritoryId): Attack | null {
  return attacks(s, seat).find((a) => a.from === from && a.to === to) ?? null;
}

/** `FORT-1` (note `fortify-reach`): a fortifying move from `from` may reach any owned territory
 *  joined to it through a chain of the player's own territories. */
export function fortifyDestinations(s: EngineState, seat: Seat, from: TerritoryId): TerritoryId[] {
  const own = (t: TerritoryId) => ownerOf(s, t) === seat;

  const reached = new Set<TerritoryId>([from]);
  const frontier: TerritoryId[] = [from];
  while (frontier.length > 0) {
    const at = frontier.pop() as TerritoryId;
    for (const next of ADJACENCY[at]) {
      if (own(next) && !reached.has(next)) {
        reached.add(next);
        frontier.push(next);
      }
    }
  }
  reached.delete(from);
  return [...reached];
}

export interface Fortify {
  from: TerritoryId;
  to: TerritoryId;
  maxArmies: number;
}

/** `FORT-1`: any number of armies, leaving at least 1 behind. */
export function fortifyMoves(s: EngineState, seat: Seat): Fortify[] {
  const result: Fortify[] = [];
  for (const from of ownedBy(s, seat)) {
    const maxArmies = holding(s, from).armies - 1;
    if (maxArmies < 1) continue;
    for (const to of fortifyDestinations(s, seat, from)) result.push({ from, to, maxArmies });
  }
  return result;
}

export function reinforceState(s: EngineState): ReinforceState {
  if (!s.reinforce) throw new Error(`no reinforce phase in progress (phase ${s.phase})`);
  return s.reinforce;
}

/** `CARDS-5`: 5 or more cards must trade at least one set before placing. `ELIM-3`: after taking
 *  an eliminated player's cards, trade until holding 4 or fewer. */
export function mustTrade(s: EngineState): boolean {
  const r = reinforceState(s);
  const hand = s.hands[s.active].length;
  if (r.afterElimination) return hand >= 5;
  return r.handAtStart >= 5 && r.tradesMade === 0;
}

/** `CARDS-5`: trades come before placing; one set from 3 or 4 cards, up to two from 5 or 6.
 *  `ELIM-3`: only the forced trades, stopping at 4 or fewer cards. */
export function mayTrade(s: EngineState): boolean {
  const r = reinforceState(s);
  if (r.afterElimination) return mustTrade(s);
  const allowed = r.handAtStart >= 5 ? 2 : 1;
  return !r.placedAny && r.tradesMade < allowed;
}

/** `CARDS-7`: the territories pictured among `cards` that the trading seat owns, any one of which
 *  may take a trade's +2 (once per trade, note `territory-bonus`). */
export function bonusTerritories(s: EngineState, seat: Seat, cards: readonly string[]): TerritoryId[] {
  const result: TerritoryId[] = [];
  for (const card of s.hands[seat]) {
    if (!cards.includes(card)) continue;
    const territory = territoryOf(card);
    if (territory !== null && ownerOf(s, territory) === seat) result.push(territory);
  }
  return result;
}
