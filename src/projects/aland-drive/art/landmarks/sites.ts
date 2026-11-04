import { buildChurch } from "../facades/church";
import { CHURCHES } from "../facades/churches";
import FUEL from "../facades/fuel-stations.json";
import { onBearing, painter, type Inks } from "../facades/paint";
import { fuelFootprints, fuelStation, type FuelStation } from "../facades/roadside-shops";
import { buildTerminal, FALSE_SOLID, TERMINAL_LEG_M, TERMINAL_ORIGIN, terminalFeet } from "../town-kit/terminal";
import { BRANNKLINT_SITE } from "./bomarsund";
import { KUNGSO_SITE } from "./defences";
import { JOHANNISBERG_SITE, PRASTO_SITES } from "./graves";
import { LANDMARKS } from "./index";
import type { Landmark } from "./landmark";
import { groundOf, type GroundSite, type Replaces } from "./places";
import { STATUE_SITES } from "./statues";
import { TOWER_SITES } from "./towers";

/*
 * Every model that stands at a real place of its own, as the pipeline reads them (`sites.json`, which
 * `tools/landmark-sites.ts` writes from here and a test holds equal): where each stands, what it takes the place of,
 * and its plan, the far version's footprint, which is what "inside" means and, unless it says otherwise, what the car
 * hits. The stone churches and the landmarks stand from any distance. The Västerhamn terminal and the fuel stations
 * are near only: drawn with their tile's detail, as the buildings round them are, and stopping the car only at their
 * legs, islands, kiosks and posts, so the roads under a walkway or a canopy stay open.
 */

export type { Replaces } from "./places";

export interface SiteRecord {
  id: string;
  east: number;
  north: number;
  /** The model's y = 0 above sea level, where its art fixes one; null stands it on the ground at its origin. */
  baseM: number | null;
  replaces: Replaces;
  /** The far version's plan: corners, ETRS-TM35FIN metres, and its triangles, a wall's seen from above as a line. */
  plan: { corners: [number, number][]; triangles: [number, number, number][] };
  /** What the car can't pass, where that isn't the plan: outlines, ETRS-TM35FIN metres. */
  walls?: [number, number][][];
  /** Drawn only with its tile's detail, not from the start. */
  nearOnly?: true;
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

/** The towers, statues, ruins and graves the data has no building for, each built on the ground round it (`places.ts`). */
export const GROUND_SITES: readonly GroundSite[] = [...TOWER_SITES, ...STATUE_SITES, BRANNKLINT_SITE, ...PRASTO_SITES, JOHANNISBERG_SITE, KUNGSO_SITE];

/** Where a ground site's far version takes over: the game swaps every site at one distance (`render/landmarks.ts`). */
const LANDMARK_FAR_FROM_M = 1400;

export function buildGroundSite(site: GroundSite, heightAt: HeightAt): Landmark {
  const { near, far } = site.build(groundOf(heightAt, site.east, site.north));
  return { id: site.id, name: site.name, east: site.east, north: site.north, baseM: heightAt(site.east, site.north), near, far, farFromM: LANDMARK_FAR_FROM_M };
}

/** The model at a site: a church or a ground site is built on the ground round it, a landmark as its art has it. */
export function buildSite(id: string, inks: Inks, heightAt: HeightAt): Landmark {
  const church = CHURCHES.find((spec) => spec.id === id);
  if (church) return buildChurch(church, inks, heightAt);
  const ground = GROUND_SITES.find((spec) => spec.id === id);
  if (ground) return buildGroundSite(ground, heightAt);
  const landmark = LANDMARKS().find((candidate) => candidate.id === id);
  if (!landmark) throw new Error(`no site called ${id}`);
  return landmark;
}

const round = (metres: number) => Math.round(metres * 10) / 10;

/** A model's plan from above, its positions metres east and south (the scene's +z) of the site. */
function planOf({ positions, indices }: { positions: ArrayLike<number>; indices: ArrayLike<number> }, east: number, north: number): SiteRecord["plan"] {
  const corners: [number, number][] = [];
  const known = new Map<string, number>();
  const corner = (vertex: number) => {
    const point: [number, number] = [round(east + positions[vertex * 3]), round(north - positions[vertex * 3 + 2])];
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

/** A rectangle in a model's own plan (x east, z south), as an outline of corners east and north of the site. */
function outlineOf([west, south, east, north]: readonly number[], toPlan: (x: number, z: number) => readonly [number, number], siteEast: number, siteNorth: number): [number, number][] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ].map(([x, z]) => {
    const [px, pz] = toPlan(x, z);
    return [round(siteEast + px), round(siteNorth - pz)];
  });
}

export const TERMINAL_SITE = "terminal";
export const FUEL_SITE_PREFIX = "fuel-";

/** The stations by site id. */
export const FUEL_STATIONS = new Map((FUEL as unknown as FuelStation[]).map((station) => [`${FUEL_SITE_PREFIX}${station.osm}`, station]));

/** The terminal's walkways stand on legs over the quay's roads: only its legs stop the car. */
function terminalRecord(): SiteRecord {
  const { east, north } = TERMINAL_ORIGIN;
  const far = buildTerminal().far;
  if (far === null) throw new Error("the terminal has no far version");
  const half = TERMINAL_LEG_M / 2;
  const walls = terminalFeet().map(([x, z]) => outlineOf([x - half, z - half, x + half, z + half], (px, pz) => [px, pz], east, north));
  return { id: TERMINAL_SITE, east, north, baseM: 0, replaces: { solids: [FALSE_SOLID] }, plan: planOf({ positions: far.getAttribute("position").array, indices: far.getIndex()?.array ?? [] }, east, north), walls, nearOnly: true };
}

/** A station replaces whatever lies under its canopy, and stops the car at its pump islands and pylon. */
function fuelRecord(id: string, station: FuelStation): SiteRecord {
  const { east, north } = station;
  const frame = onBearing(station.bearing);
  const toPlan = (x: number, z: number) => {
    const [px, , pz] = frame([x, 0, z]);
    return [px, pz] as const;
  };
  const mesh = fuelStation(painter(() => "#ffffff"), station);
  return { id, east, north, baseM: null, replaces: "inside", plan: planOf(mesh, east, north), walls: fuelFootprints(station).map((rectangle) => outlineOf(rectangle, toPlan, east, north)), nearOnly: true };
}

/** Every site, in a fixed order: the landmarks, the churches, the terminal, the fuel stations, then the ground sites. */
export function siteRecords(): SiteRecord[] {
  const flat = () => 0;
  const landmarks = LANDMARKS().map((landmark) => {
    if (!(landmark.id in LANDMARK_REPLACES)) throw new Error(`${landmark.id} doesn't say what it replaces`);
    return { id: landmark.id, east: landmark.east, north: landmark.north, baseM: landmark.baseM, replaces: LANDMARK_REPLACES[landmark.id], plan: planOf(landmark.far, landmark.east, landmark.north) };
  });
  const churches = CHURCHES.map((spec) => ({ id: spec.id, east: spec.east, north: spec.north, baseM: null, replaces: { solids: spec.solids }, plan: planOf(buildChurch(spec, () => "#ffffff", flat).far, spec.east, spec.north) }));
  const stations = [...FUEL_STATIONS].map(([id, station]) => fuelRecord(id, station));
  const grounds = GROUND_SITES.map((site): SiteRecord => {
    const record: SiteRecord = { id: site.id, east: site.east, north: site.north, baseM: null, replaces: site.replaces, plan: planOf(site.build(flat).far, site.east, site.north) };
    if (site.walls) record.walls = site.walls.map((outline) => outline.map(([east, north]): [number, number] => [round(site.east + east), round(site.north + north)]));
    return record;
  });
  return [...landmarks, ...churches, terminalRecord(), ...stations, ...grounds];
}
