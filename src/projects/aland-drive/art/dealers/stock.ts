import { CAR_ENTRIES, CAR_IDS, type CarId } from "../../sim/cars";
import type { Maker } from "../../sim/cars/character";

/*
 * What each place sells (`ideas/cars.md`, "Dealers"): every car that reaches the island from a dealer, by its maker. The
 * cars themselves say who makes them and where they come from, so a new car of a dealer's maker is in its stock with no
 * change here. The used lot trades whatever a player brings, so it has no makers of its own.
 */

export const SELLER_IDS = ["town-dealer", "premium-showroom", "village-garage"] as const;
export type SellerId = (typeof SELLER_IDS)[number];

export const SELLER_MAKERS: Readonly<Record<SellerId, readonly Maker[]>> = {
  "town-dealer": ["Västan", "Ödmark", "Norrsken"],
  "premium-showroom": ["Tärna", "Aurelle"],
  "village-garage": ["Klippa"],
};

/** A seller's cars, in the game's own order. */
export function stockOf(seller: SellerId): CarId[] {
  const makers = SELLER_MAKERS[seller];
  return CAR_IDS.filter((id) => CAR_ENTRIES[id].from === "dealer" && makers.includes(CAR_ENTRIES[id].maker));
}
