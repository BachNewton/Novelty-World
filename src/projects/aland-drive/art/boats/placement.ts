import { seeded } from "../roadside/mesh";
import type { Placement } from "../roadside";
import { rowAlong, shareOut, type LinePoint } from "../street/place";

/*
 * Where the boats might go, with no renderer in it, so a tile's worker can run it.
 * Nothing here is wired into the game. The counts are what the OSM extract under
 * `.data/raw/osm-api/` holds across the whole island's box, unique by id:
 *
 *   leisure=marina       37 (9 nodes, 28 ways), 4 with a capacity: 160 and 320 at the
 *                        two Mariehamn clubs, 30 and 2 elsewhere
 *   man_made=pier        1,576 ways and nodes, nearly all private jetties
 *   mooring=*            37 ways
 *   seamark harbour      28; small_craft_facility 15
 *   leisure=slipway      52
 *   man_made=breakwater  119 ways
 *   ferry terminals      32
 *
 * So: a marina's capacity where it has one, otherwise berths along the piers inside
 * its outline. A marina pier gets a row with `berthsAlong`, bow to the pier. A private
 * pier gets one small boat at most, a share of them, from `jettyBoat`. Sailing boats
 * sit in open water off the marinas, and the regatta off the south coast's horizon.
 */

export type BerthKind = "dinghy" | "motor" | "folkboat" | "cruiser" | "large" | "traditional";

/** The mix in a guest harbour, by share of its berths. */
export const MARINA_MIX: readonly (readonly [BerthKind, number])[] = [["cruiser", 0.42], ["motor", 0.24], ["large", 0.14], ["folkboat", 0.12], ["traditional", 0.04], ["dinghy", 0.04]];

/** A boat's berth width, the spacing a pier row needs. */
export const BERTH_WIDE_M: Record<BerthKind, number> = { dinghy: 2, motor: 3, folkboat: 3, cruiser: 4, large: 5, traditional: 5 };

/** Berths down a pier, each boat's bow towards it, `offsetM` off its line on one side, split by kind. */
export function berthsAlong(pier: readonly LinePoint[], offsetM: number, seed: number, spacingM = BERTH_WIDE_M.cruiser): Map<BerthKind, Placement[]> {
  const places = rowAlong(pier, spacingM, offsetM).map((place): Placement => ({ ...place, y: 0, yaw: (place.yaw ?? 0) + Math.PI }));
  const kinds = MARINA_MIX.flatMap(([kind, share]) => Array.from({ length: Math.round(share * 50) }, () => kind));
  const groups = shareOut(places, kinds.length, seed);
  const byKind = new Map<BerthKind, Placement[]>();
  kinds.forEach((kind, index) => byKind.set(kind, [...(byKind.get(kind) ?? []), ...groups[index]]));
  return byKind;
}

/** A private jetty's boat, or none: about one in four has one, seeded by the jetty so it comes back the same. */
export function jettyBoat(end: LinePoint, outwardYaw: number, seed: number): Placement | null {
  const random = seeded(seed);
  if (random() > 0.25) return null;
  return { x: end.x, y: 0, z: end.z, yaw: outwardYaw + Math.PI / 2 };
}

/** Yachts sailing off a harbour: each on its own heading, a broad spread of sea. They don't move: a sailing boat's motion is its sails and its rock. */
export function offshoreSailing(centre: { x: number; z: number }, radiusM: number, count: number, seed: number): Placement[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => {
    const [angle, reach] = [random() * 2 * Math.PI, Math.sqrt(random()) * radiusM];
    return { x: centre.x + Math.cos(angle) * reach, y: 0, z: centre.z + Math.sin(angle) * reach, yaw: random() * 2 * Math.PI };
  });
}
