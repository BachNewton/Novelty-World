import { LISTINGS } from "../art/dealers/listings";
import type { DealerDoor } from "../dealership/doors";
import type { Stock } from "../dealership/interior";
import { stockOf } from "../dealership/stock";
import { CAR_ENTRIES } from "../sim/cars";

/** A dealership on a map: at its door, with its name and what it sells for the world map's card. */
export interface MapDealer {
  id: string;
  x: number;
  z: number;
  name: string;
  sells: string;
}

/** Every dealership with a walk-in, marked at its door. */
export function mapDealersOf(doors: readonly DealerDoor[]): MapDealer[] {
  return doors.map(({ dealership, x, z }) => {
    const { name, stock } = LISTINGS[dealership.site];
    return { id: dealership.site, x, z, name, sells: sellsOf(stock) };
  });
}

/** What a dealership sells, as its card says it: the makers of the cars it has, after the tiers it's limited to. */
export function sellsOf(stock: Stock): string {
  const makers = [...new Set(stockOf(stock).map((id) => CAR_ENTRIES[id].maker))];
  const tiers = stock.tiers?.filter((tier) => tier !== null) ?? [];
  return `${tiers.length > 0 ? `Tiers ${tiers.join(", ")}: ` : ""}${makers.join(", ")}`;
}
