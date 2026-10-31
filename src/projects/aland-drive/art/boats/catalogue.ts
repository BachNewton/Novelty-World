import type { RoadsideModel } from "../roadside/models";
import { buildOptimist, buildSingleHander } from "./dinghies";
import { buildFishingBoat, buildLaunch, buildPassengerBoat, buildPilotBoat, buildRescueBoat, buildRib } from "./motor";
import { buildAllmogebat, buildDoubleEnder, buildGaleas } from "./traditional";
import { buildCruiser, buildFolkboat, buildLargeCruiser } from "./yachts";

/*
 * Every boat in the kit in each state it comes in, with its triangle limits and its
 * length, for the budget test and the gallery.
 */

export const NEAR_LIMIT = 900;
export const FAR_LIMIT = 60;
export const GALEAS_LIMIT = 2500;

export interface Entry {
  name: string;
  label: string;
  /** Overall, for framing a view. */
  lengthM: number;
  /** The top of its rig or cabin. */
  tallM: number;
  /** Which way a side view stands off it. */
  sailing: boolean;
  limit: number;
  model: () => RoadsideModel;
}

const entry = (name: string, label: string, lengthM: number, tallM: number, sailing: boolean, model: () => RoadsideModel, limit = NEAR_LIMIT): Entry => ({ name, label, lengthM, tallM, sailing, limit, model });

export const CATALOGUE: readonly Entry[] = [
  entry("folkboat", "Nordic Folkboat, moored", 7.7, 10.8, false, () => buildFolkboat()),
  entry("folkboat-sailing", "Nordic Folkboat, close-hauled", 7.7, 10.8, true, () => buildFolkboat({ state: "sailing" })),
  entry("cruiser", "33 ft cruiser, moored", 10, 15, false, () => buildCruiser({ cover: "navy" })),
  entry("cruiser-sailing", "33 ft cruiser, close-hauled", 10, 15, true, () => buildCruiser({ state: "sailing" })),
  entry("large", "45 ft cruiser, moored", 13.7, 21, false, () => buildLargeCruiser({ cover: "grey" })),
  entry("large-sailing", "45 ft cruiser, on a reach", 13.7, 21, true, () => buildLargeCruiser({ state: "sailing", trim: "reach", sails: "laminate", lee: -1 })),
  entry("double-ender", "double-ender, on a buoy", 12.5, 16, false, () => buildDoubleEnder()),
  entry("double-ender-sailing", "double-ender, gaff ketch", 15.5, 16, true, () => buildDoubleEnder({ state: "sailing" })),
  entry("galeas", "galeas, at the quay", 30, 21, false, () => buildGaleas(), GALEAS_LIMIT),
  entry("galeas-sailing", "galeas, all plain sail", 30, 21, true, () => buildGaleas({ state: "sailing" }), GALEAS_LIMIT),
  entry("allmogebat", "allmogebåt, sail on the yard", 6.2, 5.6, false, () => buildAllmogebat()),
  entry("allmogebat-sailing", "allmogebåt, lug sail", 6.2, 5.6, true, () => buildAllmogebat({ state: "sailing" })),
  entry("optimist", "Optimist, bare", 2.3, 2.3, false, () => buildOptimist()),
  entry("optimist-sailing", "Optimist, sprit sail", 2.3, 2.5, true, () => buildOptimist({ state: "sailing" })),
  entry("single-hander", "Laser-type, bare", 4.2, 6.4, false, () => buildSingleHander()),
  entry("single-hander-sailing", "Laser-type, sailing", 4.2, 6.4, true, () => buildSingleHander({ state: "sailing" })),
  entry("launch", "Swedish-style open launch", 7.25, 2, false, () => buildLaunch()),
  entry("rib", "RIB", 7, 2.5, false, () => buildRib()),
  entry("fishing", "inshore fishing boat", 8.8, 6.4, false, () => buildFishingBoat()),
  entry("rescue", "sea-rescue boat", 10.1, 6, false, () => buildRescueBoat()),
  entry("pilot", "pilot boat", 16.3, 7.6, false, () => buildPilotBoat()),
  entry("passenger", "archipelago passenger boat", 19.2, 8, false, () => buildPassengerBoat()),
];
