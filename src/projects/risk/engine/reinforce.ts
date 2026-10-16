import type { Rng } from "@/shared/lib/seeded-random";
import type { CardId, Move, Seat } from "../contract";
import { CONTINENTS, type ContinentId, type TerritoryId } from "../map";
import { FULL_DECK, isValidSet, setValue } from "../cards";
import { bonusTerritories, mayTrade, mustTrade, reinforceState } from "./legal";
import { continentTerritories, holding, isTerritoryId, ownedBy, ownerOf, setPhase, type Ctx, type EngineState } from "./state";

export interface Reinforcements {
  fromTerritories: number;
  fromContinents: { continent: ContinentId; bonus: number }[];
  total: number;
}

/** `REINF-2` and `REINF-3`, counted from the territories `seat` owns now. */
export function reinforcements(s: EngineState, seat: Seat): Reinforcements {
  const fromTerritories = Math.max(3, Math.floor(ownedBy(s, seat).length / 3));
  const fromContinents = CONTINENTS.filter((c) =>
    continentTerritories(c.id).every((t) => ownerOf(s, t) === seat),
  ).map((c) => ({ continent: c.id, bonus: c.bonus }));
  const total = fromTerritories + fromContinents.reduce((sum, c) => sum + c.bonus, 0);
  return { fromTerritories, fromContinents, total };
}

/** `REINF-6`: the extra armies on each seat's first turn, by player count and then position in
 *  the turn order. */
const FIRST_TURN_BONUS: Record<number, readonly number[]> = {
  3: [0, 0, 1],
  4: [0, 0, 0, 1],
  5: [0, 0, 0, 1, 2],
  6: [0, 0, 0, 1, 2, 3],
};

/** `REINF-1`: the turn's reinforce phase, with this turn's armies counted. */
export function beginReinforce(ctx: Ctx, seat: Seat): void {
  const s = ctx.s;
  const earned = reinforcements(s, seat);
  const firstTurnBonus = s.round === 0 ? FIRST_TURN_BONUS[s.players][s.turnOrder.indexOf(seat)] : 0;
  ctx.events.push({
    rule: "REINF-1",
    kind: "reinforcements",
    seat,
    fromTerritories: earned.fromTerritories,
    fromContinents: earned.fromContinents,
    firstTurnBonus,
  });
  s.reinforce = {
    armiesToPlace: earned.total + firstTurnBonus,
    placedAny: false,
    afterElimination: false,
  };
  setPhase(ctx, "reinforce", "TURN-1");
}

/** `ELIM-3`: taking an eliminated player's cards brought the hand to 5 or more; trade down to 4
 *  or fewer and place the armies before the next battle. */
export function beginForcedTrade(ctx: Ctx): void {
  const s = ctx.s;
  s.reinforce = {
    armiesToPlace: 0,
    placedAny: false,
    afterElimination: true,
  };
  setPhase(ctx, "reinforce", "ELIM-3");
}

/** `REINF-5`: armies on any owned territories, all of them before the first battle (`REINF-1`). */
export function placeReinforcements(ctx: Ctx, seat: Seat, move: Extract<Move, { kind: "place" }>): string | null {
  const s = ctx.s;
  const r = reinforceState(s);
  if (mustTrade(s)) return "trade a set before placing";
  if (!isTerritoryId(move.territory) || ownerOf(s, move.territory) !== seat) {
    return "armies can only be placed on a territory you own";
  }
  if (!Number.isInteger(move.armies) || move.armies < 1 || move.armies > r.armiesToPlace) {
    return `place between 1 and ${r.armiesToPlace} armies`;
  }

  holding(s, move.territory).armies += move.armies;
  r.armiesToPlace -= move.armies;
  r.placedAny = true;
  const rule = r.afterElimination ? "ELIM-3" : "REINF-5";
  ctx.events.push({ rule, kind: "placed", owner: seat, territory: move.territory, armies: move.armies });

  if (r.armiesToPlace === 0) {
    s.reinforce = null;
    setPhase(ctx, "attack", rule === "ELIM-3" ? "ELIM-3" : "TURN-1");
  }
  return null;
}

const CARD_IDS = new Set<unknown>(FULL_DECK);

/** `CARDS-5` (or `ELIM-3`): three cards from the hand forming a set (`CARDS-3`), worth its fixed
 *  value (`CARDS-6`), and the occupied-territory bonus where due (`CARDS-7`). The cards go back
 *  into the deck (`CARDS-8`). */
export function trade(ctx: Ctx, seat: Seat, move: Extract<Move, { kind: "trade" }>): string | null {
  const s = ctx.s;
  const r = reinforceState(s);
  if (!mayTrade(s)) return "no trade is allowed now";

  const given: readonly unknown[] = move.cards;
  const hand = s.hands[seat];
  if (given.length !== 3 || new Set(given).size !== 3) return "a trade is three different cards";
  if (!given.every((card) => CARD_IDS.has(card) && hand.includes(card as CardId))) {
    return "you can only trade cards in your hand";
  }
  const cards = move.cards;
  if (!isValidSet(cards)) return "those cards are not a set";

  const choices = bonusTerritories(s, seat, cards);
  let bonusTerritory: TerritoryId | null = null;
  if (move.bonusTerritory !== undefined) {
    if (!choices.includes(move.bonusTerritory)) return "that territory cannot take the occupied-territory bonus";
    bonusTerritory = move.bonusTerritory;
  } else if (choices.length === 1) {
    bonusTerritory = choices[0];
  } else if (choices.length > 1) {
    return "choose which territory takes the occupied-territory bonus";
  }

  const armies = setValue(cards);
  s.hands[seat] = hand.filter((card) => !cards.includes(card));
  for (const card of cards) returnToDeck(s.deck, card, ctx.rng);
  s.trades.push({ seat, cards: [cards[0], cards[1], cards[2]] });
  r.armiesToPlace += armies;
  let bonus: { territory: TerritoryId; armies: number } | null = null;
  if (bonusTerritory !== null) {
    // CARDS-7: both bonus armies go on the pictured territory, so the engine places them.
    holding(s, bonusTerritory).armies += 2;
    bonus = { territory: bonusTerritory, armies: 2 };
  }
  ctx.events.push({
    rule: r.afterElimination ? "ELIM-3" : "CARDS-5",
    kind: "traded",
    seat,
    cards: [cards[0], cards[1], cards[2]],
    armies,
    bonus,
  });
  return null;
}

/** `CARDS-8`: a traded card goes back into the deck at a random place below its top 3 cards, or
 *  anywhere in a deck of 3 or fewer. */
function returnToDeck(deck: CardId[], card: CardId, rng: Rng): void {
  const lowest = deck.length > 3 ? 3 : 0;
  const at = lowest + Math.floor(rng.next() * (deck.length - lowest + 1));
  deck.splice(at, 0, card);
}
