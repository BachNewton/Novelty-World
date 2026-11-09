import { CAR_ENTRIES, CAR_IDS, type CarId } from "../sim/cars";
import type { Stock } from "./interior";

/** The cars a dealership sells, in the car list's order (fastest tier first): every car matching all the stock's fields. */
export function stockOf({ makers, tiers, from }: Stock): CarId[] {
  return CAR_IDS.filter((id) => {
    const entry = CAR_ENTRIES[id];
    return (makers === undefined || makers.includes(entry.maker)) && (tiers === undefined || tiers.includes(entry.tier)) && (from === undefined || from.includes(entry.from));
  });
}
