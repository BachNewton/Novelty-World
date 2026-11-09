import type { Exterior } from "../exteriors";
import type { Shell } from "../shell";
import { drawHull, HULL_PLAN } from "./hull";
import { PASSERELLE_END, SHELL_DOOR } from "./plan";

/** How far out from the yacht's middle its door's marker stands: on the quay's service road, beyond the passerelle's foot. */
const ROAD_Z = 16.3;
/**
 * The yacht as a dealership seen from the island: its hull and decks, and its entrance on the quay at the passerelle,
 * where the player's car is put back. Its origin is the sea's surface under the middle of the hull, and the car is
 * stopped by the hull's side; its plot reaches the quay where the passerelle lands.
 */
export function yachtExterior(s: Shell): Omit<Exterior, "soup"> {
  drawHull(s, s.version === "near");
  const { sternX, bowX, halfBeam } = HULL_PLAN;
  return {
    id: "yacht",
    slots: [],
    plot: [sternX - 2.8, -halfBeam - 0.1, bowX + 0.2, PASSERELLE_END.z + 0.4],
    walls: [[sternX, -halfBeam, bowX, halfBeam]],
    entrance: { at: [(SHELL_DOOR.fromX + SHELL_DOOR.toX) / 2, PASSERELLE_END.y, ROAD_Z], radiusM: 3.5 },
  };
}
