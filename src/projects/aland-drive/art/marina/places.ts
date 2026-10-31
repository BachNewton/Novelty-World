import data from "./places.json";

/*
 * Real places from OpenStreetMap's tags, by `places.py`: `x` and `z` in the game's
 * scene metres (east +x, north -z). Height is the integrator's: the water for a mark,
 * `heightAt` for what's ashore. Nothing's yaw is known. `marina`, `boatyard` and
 * `boat-storage` say where a harbour is, to dress with the kit, not one object.
 */

export type PlaceKind = keyof typeof data.places;
export const PLACE_KINDS = Object.keys(data.places) as PlaceKind[];
export const PLACE_COUNTS = Object.fromEntries(PLACE_KINDS.map((kind) => [kind, data.places[kind].length])) as Record<PlaceKind, number>;

/** Where this kind stands, with no height yet. */
export function placesOf(kind: PlaceKind): { x: number; z: number }[] {
  return data.places[kind].map(([x, z]) => ({ x, z }));
}
