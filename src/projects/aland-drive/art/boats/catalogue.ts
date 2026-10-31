import type { RoadsideModel } from "../roadside/models";
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
];
