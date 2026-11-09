import { buildExterior, DEALER_SITES, onSite, type DealerSite } from "../art/dealers";
import { DEALERSHIPS, type Dealership } from "./registry";

/** A dealership's door on the island: its exterior's `entrance` at its site, in the scene's metres. */
export interface DealerDoor {
  dealership: Dealership;
  site: DealerSite;
  x: number;
  z: number;
}

/** A point of a site's model in the scene: east +x, north -z, from the world's origin. */
export function inScene(site: DealerSite, origin: { east: number; north: number }, x: number, z: number): [number, number] {
  const [east, north] = onSite(site, x, z);
  return [east - origin.east, origin.north - north];
}

/** Every dealership's door, where the walk-in stands its ring and the maps their marks. */
export function dealerDoors(origin: { east: number; north: number }): DealerDoor[] {
  return DEALERSHIPS.map((dealership) => {
    const site = DEALER_SITES.find(({ id }) => id === dealership.site);
    if (!site) throw new Error(`no site for ${dealership.site}`);
    const { entrance } = buildExterior(site.id);
    const [x, z] = inScene(site, origin, entrance.at[0], entrance.at[2]);
    return { dealership, site, x, z };
  });
}
