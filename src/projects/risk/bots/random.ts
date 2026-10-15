import { createRng, pick, type Rng } from "@/shared/lib/seeded-random";
import type { CardId, Move } from "../contract";
import type { TerritoryId } from "../map";
import type { Bot } from "./bot";

const between = (rng: Rng, low: number, high: number) => low + Math.floor(rng.next() * (high - low + 1));

/** The floor: a legal move picked at random, with no plan at all. It is the sanity
 *  check every real bot must crush, not a member of any field (see the project's
 *  CLAUDE.md, Bots). */
export const randomBot: Bot = ({ options, view, seed }) => {
  const rng = createRng(seed);
  switch (options.kind) {
    case "reinforce": {
      if (options.sets.length > 0 && (options.mustTrade || rng.next() < 0.5)) {
        return tradeMove(pick(rng, options.sets), options.bonusTerritories, (choices) => pick(rng, choices));
      }
      return {
        kind: "place",
        territory: pick(rng, options.ownTerritories),
        armies: between(rng, 1, options.armiesToPlace),
      };
    }
    case "attack": {
      if (rng.next() < 0.5) return { kind: "end-attack" };
      const a = pick(rng, options.attacks);
      if (rng.next() < 0.5) return { kind: "attack", from: a.from, to: a.to, dice: between(rng, 1, a.maxDice) as 1 | 2 | 3 };
      return { kind: "blitz", from: a.from, to: a.to, keepAtLeast: between(rng, 1, view.territories[a.from].armies - 1) };
    }
    case "occupy":
      return { kind: "occupy", armies: between(rng, options.min, options.max) };
    case "fortify": {
      if (rng.next() < 0.5) return { kind: "end-turn" };
      const m = pick(rng, options.moves);
      return { kind: "fortify", from: m.from, to: m.to, armies: between(rng, 1, m.maxArmies) };
    }
  }
};

/** A trade of `cards`, naming the +2 territory when the set pictures more than one
 *  of the owned territories it may go to (`CARDS-7`); the engine picks when one does. */
export function tradeMove(
  cards: readonly [CardId, CardId, CardId],
  bonusTerritories: readonly TerritoryId[],
  choose: (choices: readonly TerritoryId[]) => TerritoryId,
): Move {
  const choices = bonusTerritories.filter((t) => (cards as readonly string[]).includes(t));
  return choices.length > 1 ? { kind: "trade", cards, bonusTerritory: choose(choices) } : { kind: "trade", cards };
}
