import type { Exterior } from "../exteriors";
import { Shell } from "../shell";
import { PASSERELLE_END, SHELL_DOOR } from "./plan";

/** How far out from the yacht's middle its door's marker stands: on the quay's service road, beyond the passerelle's foot. */
const ROAD_Z = 16.3;

/**
 * The yacht as a dealership seen from the island: no art of the dealer kit's, since its hull is a boat, and its
 * entrance on the quay at the passerelle, where the player's car is put back. Its origin is the sea's surface.
 */
export function yachtExterior(): Exterior {
  return {
    id: "yacht",
    soup: new Shell().build(),
    slots: [],
    plotHalf: [36.5, 6.3],
    entrance: { at: [(SHELL_DOOR.fromX + SHELL_DOOR.toX) / 2, PASSERELLE_END.y, ROAD_Z], radiusM: 3.5 },
  };
}
