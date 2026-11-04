import type { SolidsCell } from "../../render/solids";
import IDS from "./facade-ids.json";

/*
 * Where the models that stand off a wall go, read from a tile's building cells alone, with no renderer in it, so the
 * tile's worker can stand their walls for the car and the page draw them from the same places. A villa's door facade
 * gets a veranda or a porch, sometimes a bay and a fronton; a big shop's gets the supermarket's entrance.
 */

export type AddOnKind = "veranda" | "porch" | "bay" | "fronton";

const STYLE_VILLA = IDS.styles.villa;
const NARROWEST_FACADE_M = 6;
export const VERANDA_WIDE_M = 6.4;

export interface AddOn {
  kind: AddOnKind;
  /** The foot of the wall, scene space. */
  x: number;
  y: number;
  z: number;
  /** The way out of the wall. */
  outX: number;
  outZ: number;
  /** Across the wall. */
  scale: number;
}

export interface DoorFacade {
  style: number;
  front: number;
  word: number;
  seed: number;
  /** The wall's foot, in the middle of the facade, scene space. */
  x: number;
  y: number;
  z: number;
  outX: number;
  outZ: number;
  alongX: number;
  alongZ: number;
  width: number;
  eaves: number;
}

/** Each building's facade with the door, read from the vertices. */
export function doorFacades(cells: SolidsCell[]): DoorFacade[] {
  const found: DoorFacade[] = [];
  for (const { positions, facades, tints } of cells) {
    const vertices = positions.length / 3;
    let first = 0;
    for (let at = 1; at <= vertices; at++) {
      const buildingEnds = at === vertices || (tints[at * 4 + 3] !== 0 && tints[(at - 1) * 4 + 3] === 0);
      if (!buildingEnds) continue;
      let [sumX, sumZ, count] = [0, 0, 0];
      let door = -1;
      let other = -1;
      for (let vertex = first; vertex < at; vertex++) {
        sumX += positions[vertex * 3];
        sumZ += positions[vertex * 3 + 2];
        count++;
        if (tints[vertex * 4 + 3] >= STYLE_VILLA && tints[vertex * 4 + 1] >= 128) {
          if (door < 0) door = vertex;
          else if (other < 0 && Math.abs(facades[vertex * 4] - facades[door * 4]) > 1) other = vertex;
        }
      }
      if (door >= 0 && other >= 0) {
        const span = facades[other * 4] - facades[door * 4];
        const [alongX, alongZ] = [(positions[other * 3] - positions[door * 3]) / span, (positions[other * 3 + 2] - positions[door * 3 + 2]) / span];
        const width = facades[door * 4 + 2];
        const toMiddle = width / 2 - facades[door * 4];
        const [x, z] = [positions[door * 3] + alongX * toMiddle, positions[door * 3 + 2] + alongZ * toMiddle];
        const [middleX, middleZ] = [sumX / count, sumZ / count];
        const facing = -alongZ * (x - middleX) + alongX * (z - middleZ) > 0 ? 1 : -1;
        found.push({
          style: tints[door * 4 + 3],
          front: tints[door * 4] >> 5,
          word: tints[door * 4 + 1] & 127,
          seed: tints[door * 4 + 2],
          x,
          y: positions[door * 3 + 1] - facades[door * 4 + 1],
          z,
          outX: -alongZ * facing,
          outZ: alongX * facing,
          alongX,
          alongZ,
          width,
          eaves: facades[door * 4 + 3],
        });
      }
      first = at;
    }
  }
  return found;
}

/** What stands on each villa, chosen by its seed: one thing at the door, and on a broad front sometimes more. */
export function villaAddOns(doors: DoorFacade[]): AddOn[] {
  const addOns: AddOn[] = [];
  for (const door of doors) {
    if (door.style !== STYLE_VILLA || door.width < NARROWEST_FACADE_M) continue;
    const { seed, width, eaves, x, y, z, outX, outZ, alongX, alongZ } = door;
    const place = (kind: AddOnKind, offset: number, up: number, scale: number) => addOns.push({ kind, x: x + alongX * offset, y: y + up, z: z + alongZ * offset, outX, outZ, scale });
    const roll = (seed * 37) % 100;
    if (roll < 48 && width > 9) place("veranda", 0, 0, Math.min(1, (width * 0.56) / VERANDA_WIDE_M));
    else place("porch", 0, 0, 1);
    if (eaves > 4.6 && width > 11 && roll % 3 !== 2) {
      const side = roll % 2 === 0 ? 1 : -1;
      place("bay", side * width * 0.32, 0, 1);
    }
    if (eaves > 4 && width > 8 && (roll + 11) % 5 < 3) place("fronton", 0, eaves, Math.min(1.15, width / 13));
  }
  return addOns;
}

/** A big shop's door facade, where its entrance stands: the middle of the wall's foot, turned so +z leaves the wall. */
export interface Entrance {
  x: number;
  y: number;
  z: number;
  yaw: number;
  word: number;
  seed: number;
  /** Whether its name stands on a pylon out by the car park too: not where that would be on a road. */
  pylon: boolean;
}

export function supermarketEntrances(doors: DoorFacade[]): Entrance[] {
  return doors.filter(({ front }) => front === IDS.fronts.supermarket).map(({ x, y, z, outX, outZ, word, seed }) => ({ x, y, z, yaw: Math.atan2(outX, outZ), word, seed, pylon: true }));
}

export type Rectangle = readonly [number, number, number, number];

/**
 * What of each add-on the car can't pass, in its own frame (x along the wall, z out of it): the deck of a veranda or a
 * porch with its steps, and a bay's foot. A fronton is on the roof. These are the models' own measures in `add-ons.ts`.
 */
export const ADD_ON_FOOTPRINTS: Record<AddOnKind, Rectangle | null> = {
  veranda: [-3.45, 0, 3.45, 3.53],
  porch: [-1.4, 0, 1.4, 2.4],
  bay: [-1.3, 0, 1.3, 0.8],
  fronton: null,
};

/** The entrance's canopy, overhead, which must stay off the roads, and what of it the car can't pass: its posts, and its pylon's foot. */
export const ENTRANCE_CANOPY: Rectangle = [-5, 0, 5, 3.2];
export const ENTRANCE_POSTS: readonly Rectangle[] = [
  [-4.83, 2.82, -4.57, 3.08],
  [-0.13, 2.82, 0.13, 3.08],
  [4.57, 2.82, 4.83, 3.08],
];
export const ENTRANCE_PYLON: Rectangle = [11.65, 4.7, 12.35, 7.3];

/** A model's footprint rectangle, turned so its +z is (sin yaw, cos yaw), and its +x along (cos yaw, -sin yaw), as the instances' and the cells' turns both put it; `stretch` widens it along. */
export function cornersOf([west, south, east, north]: Rectangle, x: number, z: number, yaw: number, stretch = 1): [number, number][] {
  const [sin, cos] = [Math.sin(yaw), Math.cos(yaw)];
  const corner = (along: number, out: number): [number, number] => [x + cos * along * stretch + sin * out, z - sin * along * stretch + cos * out];
  return [corner(west, south), corner(east, south), corner(east, north), corner(west, north)];
}

/** The villa add-ons' and entrances' walls, laid out as a building's outline is: x and z at both ends. */
export function addOnWalls(villas: AddOn[], entrances: Entrance[]): Float32Array {
  const walls: number[] = [];
  const ring = (corners: [number, number][]) => corners.forEach((from, at) => walls.push(...from, ...corners[(at + 1) % 4]));
  for (const { kind, x, z, outX, outZ, scale } of villas) {
    const footprint = ADD_ON_FOOTPRINTS[kind];
    if (footprint !== null) ring(cornersOf(footprint, x, z, Math.atan2(outX, outZ), scale));
  }
  for (const { x, z, yaw, pylon } of entrances) {
    for (const footprint of pylon ? [...ENTRANCE_POSTS, ENTRANCE_PYLON] : ENTRANCE_POSTS) ring(cornersOf(footprint, x, z, yaw));
  }
  return Float32Array.from(walls);
}
