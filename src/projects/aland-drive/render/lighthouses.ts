import { LIGHTHOUSE_LAMP_M, LIGHTHOUSE_LANTERN_M, LIGHTHOUSE_TOP_M } from "../art/identity/index";
import { LIGHTHOUSES, type LighthouseId } from "../art/lighthouses/index";
import { PLACES } from "../map/places";
import { LIGHTS_ON_MARKS, REGISTER_MARKS, type Mark } from "./lights-on-marks";

/*
 * Åland's lighthouses. The landmarks are each a model of their own (`art/lighthouses`), standing on the register's mark
 * at their place, which they take over, or at a place of their own where the register has none, at their own size and
 * turned to the shore they're seen from. Every other lighthouse is the one generic tower (`art/identity`), scaled to
 * the real one: as tall as the register says it stands, or, where it says nothing, with its lamp at its light's
 * height; one with neither keeps the model's own height. Each one's light shines from its own lamp.
 */

/** The level a mark stands at on the water, a floating mark or a landmark on a rock of its own. */
export const ON_WATER_Y = -0.05;

const place = (x: number, z: number) => `${x},${z}`;
const lightHeights = new Map(LIGHTS_ON_MARKS.flatMap(({ x, z, heightM }) => (heightM === null ? [] : [[place(x, z), heightM] as const])));

/** How much the generic tower is scaled for a lighthouse at this place, with the register's height (0 where it gives none). */
export function lighthouseScale(registerHeightM: number, x: number, z: number): number {
  if (registerHeightM > 0) return registerHeightM / LIGHTHOUSE_TOP_M;
  const lightM = lightHeights.get(place(x, z));
  return lightM === undefined ? 1 : lightM / LIGHTHOUSE_LAMP_M;
}

/** How near a landmark's place the register's mark it takes over must be. */
const SAME_MARK_M = 120;

interface LandmarkSpot {
  id: LighthouseId;
  /** Whether it takes over the register's mark at its place, rather than standing at a place of its own. */
  onMark: boolean;
  /** On a skerry no tile draws, so it stands at sea level on the rock it brings. */
  ownRock: boolean;
  /** Turned as it really stands, where its model lays out more than one building, rather than to face its shore. */
  yaw?: number;
}

/** Where each stands is its place to find's (`map/places.ts`), which also names the shore it's seen from. */
const SPOTS: readonly LandmarkSpot[] = [
  { id: "market", onMark: true, ownRock: true },
  { id: "salskar", onMark: true, ownRock: false },
  { id: "lagskar", onMark: true, ownRock: true },
  { id: "flotjan", onMark: true, ownRock: true },
  { id: "nyhamn", onMark: false, ownRock: false },
  { id: "marhallan", onMark: true, ownRock: false },
  // Its pyramid falls on OpenStreetMap's Kobbabåken, 45 m from the house, within 0.2 m.
  { id: "kobba-klintar", onMark: false, ownRock: false, yaw: 1.729 },
  { id: "ledskar", onMark: true, ownRock: false },
  { id: "hogsten", onMark: true, ownRock: false },
  { id: "sjokvarteret", onMark: true, ownRock: false },
];

function placeOf(id: LighthouseId) {
  const found = PLACES.find((candidate) => candidate.id === `lighthouse-${id}`);
  if (!found) throw new Error(`the lighthouse ${id} has no place to find`);
  return found;
}

export interface LandmarkLighthouse {
  id: LighthouseId;
  x: number;
  z: number;
  /** Turns its +z, its front, towards (sin yaw, cos yaw): the shore it's seen from. */
  yaw: number;
  ownRock: boolean;
  /** The register mark it takes the place of, if any. */
  mark: Mark | null;
}

const LIGHTHOUSE_KINDS = new Set(["lighthouse", "skerry-light"]);

function nearestMark(x: number, z: number, id: string): Mark {
  let nearest: Mark | null = null;
  let nearestM = SAME_MARK_M;
  for (const mark of REGISTER_MARKS) {
    const apart = Math.hypot(mark[1] - x, mark[2] - z);
    if (LIGHTHOUSE_KINDS.has(mark[0]) && apart < nearestM) [nearest, nearestM] = [mark, apart];
  }
  if (nearest === null) throw new Error(`no register mark within ${SAME_MARK_M} m of ${id}'s place for it to take over`);
  return nearest;
}

export const LANDMARK_LIGHTHOUSES: readonly LandmarkLighthouse[] = SPOTS.map(({ id, onMark, ownRock, yaw }) => {
  const { x, z, foundFrom } = placeOf(id);
  const seenFrom = foundFrom ?? { x, z };
  const mark = onMark ? nearestMark(x, z, id) : null;
  const [atX, atZ] = mark ? [mark[1], mark[2]] : [x, z];
  // Found from its own place, it faces south, out to sea.
  const [dx, dz] = Math.hypot(seenFrom.x - atX, seenFrom.z - atZ) < SAME_MARK_M ? [0, 1] : [seenFrom.x - atX, seenFrom.z - atZ];
  return { id, x: atX, z: atZ, yaw: yaw ?? Math.atan2(dx, dz), ownRock, mark };
});

const landmarkAt = new Map(LANDMARK_LIGHTHOUSES.map((landmark) => [place(landmark.x, landmark.z), landmark]));

/** A margin past the lantern's roof, so its light is never inside it from any side. */
const LANTERN_CLEAR_M = 0.3;

export interface Lamp {
  /** Its height above its foot, and how far its glow is pulled out to clear its lantern. */
  upM: number;
  outM: number;
  /** Stands at sea level, on a rock its model brings, rather than on the ground the world has there. */
  onWater: boolean;
}

/** Each lighthouse's lamp, by its place: a landmark's from its own model, the generic tower's from its scale. */
export const LIGHTHOUSE_LAMPS = new Map<string, Lamp>([
  ...REGISTER_MARKS.filter(([model, x, z]) => model === "lighthouse" && !landmarkAt.has(place(x, z))).map(([, x, z, , , heightM = 0]): [string, Lamp] => {
    const scale = lighthouseScale(heightM, x, z);
    return [place(x, z), { upM: LIGHTHOUSE_LAMP_M * scale, outM: LIGHTHOUSE_LANTERN_M * scale + LANTERN_CLEAR_M, onWater: false }];
  }),
  ...LANDMARK_LIGHTHOUSES.flatMap(({ id, x, z, ownRock }): [string, Lamp][] => {
    const { lampM, lanternM } = LIGHTHOUSES[id];
    return lampM === null ? [] : [[place(x, z), { upM: lampM, outM: lanternM + LANTERN_CLEAR_M, onWater: ownRock }]];
  }),
]);

export const lampAt = (x: number, z: number) => LIGHTHOUSE_LAMPS.get(place(x, z));
