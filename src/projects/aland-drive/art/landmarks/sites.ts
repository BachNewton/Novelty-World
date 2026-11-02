import { buildChurch } from "../facades/church";
import { CHURCHES } from "../facades/churches";
import type { Inks } from "../facades/paint";
import { LANDMARKS } from "./index";
import type { Landmark } from "./landmark";

/*
 * Every model that stands at a real place of its own, the stone churches and the landmarks, as the pipeline reads them
 * (`sites.json`, which `tools/landmark-sites.ts` writes from here and a test holds equal): where each stands, what it
 * takes the place of, and its plan, the far version's footprint, which is what the car hits and what "inside" means.
 * The ferry isn't here: it isn't a building, and `art/town-kit` replaces it.
 */

/** What a site takes the place of: NLS solids by name, or every solid inside its plan. A generated shape under it always goes. */
export type Replaces = { solids: string[] } | "inside" | null;

export interface SiteRecord {
  id: string;
  east: number;
  north: number;
  /** The model's y = 0 above sea level, where its art fixes one; null stands it on the ground at its origin. */
  baseM: number | null;
  replaces: Replaces;
  /** The far version's plan: corners, ETRS-TM35FIN metres, and its triangles, a wall's seen from above as a line. */
  plan: { corners: [number, number][]; triangles: [number, number, number][] };
}

type HeightAt = (east: number, north: number) => number;

const LANDMARK_REPLACES: Record<string, Replaces> = {
  "water-tower": null,
  pommern: null,
  "von-knorring": null,
  church: { solids: ["ahvenanmaa_2022_15285"] },
  "town-hall": { solids: ["ahvenanmaa_2022_135417"] },
  kastelholm: "inside",
  "bomarsund-fort": "inside",
  notvikstornet: "inside",
};

const NOT_A_SITE = new Set(["ferry"]);

/** The model at a site: a church is built on the ground round it, a landmark as its art has it. */
export function buildSite(id: string, inks: Inks, heightAt: HeightAt): Landmark {
  const church = CHURCHES.find((spec) => spec.id === id);
  if (church) return buildChurch(church, inks, heightAt);
  const landmark = LANDMARKS().find((candidate) => candidate.id === id);
  if (!landmark || NOT_A_SITE.has(id)) throw new Error(`no site called ${id}`);
  return landmark;
}

function planOf(landmark: Landmark): SiteRecord["plan"] {
  const { positions, indices } = landmark.far;
  const round = (metres: number) => Math.round(metres * 10) / 10;
  const corners: [number, number][] = [];
  const known = new Map<string, number>();
  const corner = (vertex: number) => {
    const point: [number, number] = [round(landmark.east + positions[vertex * 3]), round(landmark.north - positions[vertex * 3 + 2])];
    const key = point.join();
    let at = known.get(key);
    if (at === undefined) {
      at = corners.push(point) - 1;
      known.set(key, at);
    }
    return at;
  };
  const triangles: [number, number, number][] = [];
  for (let at = 0; at < indices.length; at += 3) {
    triangles.push([corner(indices[at]), corner(indices[at + 1]), corner(indices[at + 2])]);
  }
  return { corners, triangles };
}

/** Every site, in a fixed order: the landmarks, then the churches. */
export function siteRecords(): SiteRecord[] {
  const flat = () => 0;
  const landmarks = LANDMARKS()
    .filter(({ id }) => !NOT_A_SITE.has(id))
    .map((landmark) => {
      if (!(landmark.id in LANDMARK_REPLACES)) throw new Error(`${landmark.id} doesn't say what it replaces`);
      return { id: landmark.id, east: landmark.east, north: landmark.north, baseM: landmark.baseM, replaces: LANDMARK_REPLACES[landmark.id], plan: planOf(landmark) };
    });
  const churches = CHURCHES.map((spec) => ({ id: spec.id, east: spec.east, north: spec.north, baseM: null, replaces: { solids: spec.solids }, plan: planOf(buildChurch(spec, () => "#ffffff", flat)) }));
  return [...landmarks, ...churches];
}
