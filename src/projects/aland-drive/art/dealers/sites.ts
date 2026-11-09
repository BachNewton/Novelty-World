import { buildExterior, EXTERIOR_IDS, type ExteriorId, type Rectangle } from "./exteriors";

/*
 * Where each dealership stands on the island, at a real car business's place on the map (OpenStreetMap's `shop=car`,
 * `shop=tyres` and `amenity=fuel`, ODbL). Real firms stand at these places, so a site names a place and a road, never a
 * firm. Each is set by one point of its model laid on one real point, with its street side turned square to its road,
 * so a site says what it stands on. The pipeline takes away the map's buildings under each plot and stops the car at
 * the dealership's own walls (`art/dealers/sites.json`, `landmarks.dealer_sites`), so **a moved site or a changed plot
 * needs its tile rebuilt**.
 */

export interface DealerSite {
  id: ExteriorId;
  /** The model's origin, ETRS-TM35FIN metres. */
  east: number;
  north: number;
  /** Turns the model's +z, its street side, towards (sin yaw, cos yaw) in the scene: east and south. */
  yaw: number;
  place: string;
  road: string;
  why: string;
}

/** A model's point (x, z) laid on a real point, east and north, turned by `yaw`: the site's origin. */
function laid(id: ExteriorId, [x, z]: readonly [number, number], [east, north]: readonly [number, number], yaw: number, words: Pick<DealerSite, "place" | "road" | "why">): DealerSite {
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  return { id, east: east - (x * cos + z * sin), north: north - (x * sin - z * cos), yaw, ...words };
}

export const DEALER_SITES: readonly DealerSite[] = [
  laid("village-garage", [-2, -4.5], [120997, 6695848], -2.964, {
    place: "Sund, east past Kastelholm",
    road: "Sundsvägen",
    why: "the village's fuel stop: the workshop on the map's building beside the pump, the yard towards the road",
  }),
  laid("town-dealer", [0, -11], [107869, 6685591], 1.93, {
    place: "Mariehamn's north edge, among the town's car businesses",
    road: "Nya Godbyvägen, the main road into town",
    why: "a car business's H-shaped block, the showroom on its middle and the forecourt to the road",
  }),
  laid("premium-showroom", [0, 11.5], [106995.8, 6683735], 1.5916, {
    place: "Västerhamn, by the marina's northernmost pier",
    road: "Sjöpromenaden",
    why: "the harbour's front, where the yacht moors: the road leaves a few metres of shore, so the deck stands out over the water",
  }),
  laid("used-lot", [0, 0], [108252.9, 6687424.8], -1.963, {
    place: "Mariehamn's north edge",
    road: "Godbyvägen, by Dalvägen",
    why: "the open ground between a car trade's hall and the road; the hall stays, the lot's hut by it",
  }),
  laid("tyre-shop", [0, -6], [108073.5, 6687118.5], -0.06, {
    place: "Mariehamn's north edge",
    road: "Michaelsvägen",
    why: "a tyre business's own building, the bays facing the road",
  }),
];

export function siteOf(id: ExteriorId): DealerSite {
  const site = DEALER_SITES.find((candidate) => candidate.id === id);
  if (site === undefined) throw new Error(`no site for ${id}`);
  return site;
}

/** A point of a site's model, (x, z) in its own metres, as ETRS-TM35FIN east and north. */
export function onSite({ east, north, yaw }: DealerSite, x: number, z: number): [number, number] {
  const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
  return [east + x * cos + z * sin, north + x * sin - z * cos];
}

/** A dealership as the pipeline reads it, in `art/landmarks/sites.json`'s format. */
export interface DealerSiteRecord {
  id: string;
  east: number;
  north: number;
  baseM: null;
  /** Every building the map has under its plot. */
  replaces: "inside";
  plan: { corners: [number, number][]; triangles: [number, number, number][] };
  walls: [number, number][][];
}

const round = (metres: number) => Math.round(metres * 100) / 100;

export function dealerSiteRecords(): DealerSiteRecord[] {
  return EXTERIOR_IDS.map((id) => {
    const site = siteOf(id);
    const { plot, walls } = buildExterior(id, "far");
    const outline = ([x0, z0, x1, z1]: Rectangle): [number, number][] =>
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ].map(([x, z]) => onSite(site, x, z).map(round) as [number, number]);
    return { id: `dealer ${id}`, east: round(site.east), north: round(site.north), baseM: null, replaces: "inside", plan: { corners: outline(plot), triangles: [[0, 1, 2], [0, 2, 3]] }, walls: walls.map(outline) };
  });
}
