import type { Stock } from "../../dealership/interior";
import { SELLER_MAKERS } from "./stock";

/*
 * Each dealership's name and what it sells, the one place both are written: its room reads them (`DealerInterior`'s
 * `name` and `stock`), and so do the maps, which name a dealership and say what it sells without loading its room.
 */

export interface Listing {
  name: string;
  stock: Stock;
}

export const LISTINGS = {
  "village-garage": { name: "Klippa Bilverkstad", stock: { makers: SELLER_MAKERS["village-garage"], from: ["dealer"] } },
  "town-dealer": { name: "Norrvind Bilar", stock: { makers: SELLER_MAKERS["town-dealer"], from: ["dealer"] } },
  "premium-showroom": { name: "Tärna & Aurelle", stock: { makers: SELLER_MAKERS["premium-showroom"], from: ["dealer"] } },
  "used-lot": { name: "Begagnade bilar", stock: { tiers: ["A7", "B3", "B4"], from: ["dealer"] } },
  "delivery-hall": { name: "Västerhamn delivery hall", stock: { from: ["harbour"], tiers: ["A3", "A4", "B2", "B3"] } },
  yacht: { name: "Solvind", stock: { from: ["harbour"], tiers: ["A1", "A2"] } },
} satisfies Record<string, Listing>;

export type ListedId = keyof typeof LISTINGS;
