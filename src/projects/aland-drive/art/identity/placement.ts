import { seeded } from "../roadside/mesh";
import type { Placement } from "../roadside/material";

/*
 * Where each model goes. The counts are distinct OSM objects in the raw answers in
 * `.data/raw/osm-api/`, so they're the island's box, sea tiles included: a rule that
 * says "a share of" is an invention for a game, where the data has no such object.
 */

export interface PlacementSource {
  model: string;
  /** An OSM selector with its count, or the rule when OSM doesn't list the thing. */
  source: string;
  count: number | null;
}

export const PLACEMENT_SOURCES: readonly PlacementSource[] = [
  { model: "buildSauna", source: "leisure=sauna (name 'bastu' among them)", count: 18 },
  { model: "buildSauna (more)", source: "rule: one building=cabin or building=hut in five within 40 m of water", count: null },
  { model: "buildCottage", source: "building=cabin 136, building=bungalow 54, tourism=chalet 41; the NLS buildings already stand here, so use deck and chairs as a dressing or the cottage on unmodelled sites", count: 231 },
  { model: "buildDeckChair", source: "rule: two beside any cabin within 40 m of water", count: null },
  { model: "buildDryingNets, buildNetHeap", source: "rule: one or two by each seamark:type=harbour (28) and building=boathouse cluster of three or more (201 boathouses)", count: 28 },
  { model: "buildUpturnedBoat", source: "rule: by leisure=slipway (52) and building=boathouse (201), one in three", count: 253 },
  { model: "buildBonfireStack", source: "leisure=firepit (6), amenity=bbq (13), or rule: the shore nearest each village's midsummer pole", count: 19 },
  { model: "buildFarmStall", source: "shop=farm (1, Mattas Gårdsmejeri: no real name on the sign) and rule: on main roads at farmyards next to landuse=orchard, one per parish, a few km apart", count: 1 },
  { model: "buildAppleTree + buildOrchardLadder + buildAppleCrates", source: "landuse=orchard polygons; fill with `orchardPlan`", count: 194 },
  { model: "buildHarvestFlag, buildOpenFarmSign", source: "rule: at each farm stall and the road junction nearest each landuse=orchard over 0.5 ha; the open-farm signs face the road's traffic", count: null },
  { model: "buildCyclist, buildBicycle", source: "rule: at tourism=viewpoint (40), tourism=picnic_site (28), and along route=bicycle (16 relations) every few km, one in three stops", count: 68 },
  { model: "buildTouringRack", source: "amenity=bicycle_parking (5), amenity=bicycle_rental (6), and at amenity=ferry_terminal (32) on a bicycle route", count: 11 },
  { model: "buildPicnicTable", source: "leisure=picnic_table (88), tourism=picnic_site (28)", count: 116 },
  { model: "buildLighthouse", source: "man_made=lighthouse (20); seamark:type=light_major (17) overlaps. Scale by the tag's height where tagged", count: 20 },
  { model: "buildKummel", source: "seamark:type=landmark (9) and seamark:type=beacon_special_purpose (163) with a stone or cairn tag; man_made=cairn", count: 172 },
  { model: "buildWoodenDaymark", source: "seamark:type=beacon_* with a tower or wood tag (beacon_cardinal 3, beacon_isolated_danger 1); else a share of beacon_special_purpose", count: 4 },
  { model: "buildFishingHut", source: "landuse=harbour (3), seamark:type=harbour (28), leisure=marina (37): two to four on the quay; shop=seafood (3)", count: 68 },
  { model: "buildCableFerry, buildFerryCable", source: "route=ferry (75) with a short crossing: Prästö-Töftö is a cable ferry; the others by the operator's cable-ferry list, checked by hand", count: null },
  { model: "buildViewingTower", source: "tower:type=observation (16), which includes the bird towers", count: 16 },
  { model: "buildViewpointPlatform", source: "tourism=viewpoint (40), less those that are towers", count: 24 },
];

export interface OrchardPlan {
  trees: Placement[];
  ladders: Placement[];
  crates: Placement[];
}

/** A rectangle of the orchard in plan, its first row along `yaw` from a corner. A real polygon's fill clips to these rows. */
export function orchardPlan(corner: { x: number; y: number; z: number }, yaw: number, rows: number, perRow: number, seed: number, spacingM = 4.5, rowM = 5.5): OrchardPlan {
  const random = seeded(seed);
  const [ax, az] = [Math.cos(yaw), -Math.sin(yaw)];
  const [bx, bz] = [Math.sin(yaw), Math.cos(yaw)];
  const at = (along: number, across: number) => ({ x: corner.x + ax * along + bx * across, y: corner.y, z: corner.z + az * along + bz * across });
  const trees: Placement[] = [];
  const ladders: Placement[] = [];
  const crates: Placement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let tree = 0; tree < perRow; tree++) {
      trees.push({ ...at(tree * spacingM, row * rowM), yaw: random() * 2 * Math.PI, scale: 0.92 + random() * 0.22 });
      if (random() < 0.08) ladders.push({ ...at(tree * spacingM + 1.8, row * rowM - 1), yaw: yaw + random() });
    }
    crates.push({ ...at(-3, row * rowM + 1), yaw: yaw + random() - 0.5 });
  }
  return { trees, ladders, crates };
}
