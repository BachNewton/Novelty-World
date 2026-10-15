import type { CardId, Move, Seat } from "../contract";
import { CONTINENTS, type ContinentId, type TerritoryId } from "../map";
import { FULL_DECK, isValidSet, setValue } from "./cards";
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

/** `REINF-1`: the turn's reinforce phase, with this turn's armies counted. */
export function beginReinforce(ctx: Ctx, seat: Seat): void {
  const s = ctx.s;
  const earned = reinforcements(s, seat);
  ctx.events.push({
    rule: "REINF-1",
    kind: "reinforcements",
    seat,
    fromTerritories: earned.fromTerritories,
    fromContinents: earned.fromContinents,
  });
  s.reinforce = {
    armiesToPlace: earned.total,
    handAtStart: s.hands[seat].length,
    tradesMade: 0,
    placedAny: false,
    afterElimination: false,
  };
  setPhase(ctx, "reinforce", "TURN-1");
}

/** `ELIM-3`: taking an eliminated player's cards brought the hand to 6 or more; trade down to 4
 *  or fewer and place the armies before the next battle. */
export function beginForcedTrade(ctx: Ctx): void {
  const s = ctx.s;
  s.reinforce = {
    armiesToPlace: 0,
    handAtStart: s.hands[s.active].length,
    tradesMade: 0,
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

/** `CARDS-5` (or `ELIM-3`): three cards from the hand forming a set (`CARDS-3`), worth the next
 *  set value (`CARDS-6`), and the occupied-territory bonus where due (`CARDS-7`). */
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

  s.setsTraded++;
  const armies = setValue(s.setsTraded);
  s.hands[seat] = hand.filter((card) => !cards.includes(card));
  s.discardPile.push(...cards);
  r.armiesToPlace += armies;
  r.tradesMade++;
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
