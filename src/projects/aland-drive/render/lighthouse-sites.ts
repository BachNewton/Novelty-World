import { LIGHTHOUSES } from "../art/lighthouses/index";
import { LANDMARK_LIGHTHOUSES } from "./lighthouses";

/* The landmark lighthouses on a tile as the pipeline reads them (`art/lighthouses/sites.json`, written by `lighthouse-sites.test.ts`), the format `art/landmarks/sites.json` has. */

const WORLD_ORIGIN = { east: 110000, north: 6690000 } as const;
const round = (metres: number) => Math.round(metres * 100) / 100;

export interface LighthouseSiteRecord {
  id: string;
  east: number;
  north: number;
  baseM: null;
  /** Every building the map data has under its plan. */
  replaces: "inside";
  plan: { corners: [number, number][]; triangles: [number, number, number][] };
}

export function lighthouseSiteRecords(): LighthouseSiteRecord[] {
  return LANDMARK_LIGHTHOUSES.filter(({ ownRock }) => !ownRock).map(({ id, x, z, yaw }) => {
    const model = LIGHTHOUSES[id].build();
    const geometry = model.far ?? model.near;
    const positions = geometry.getAttribute("position");
    const index = geometry.getIndex();
    if (!index) throw new Error(`${id}'s far version has no index`);
    const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
    const corners: [number, number][] = [];
    const known = new Map<string, number>();
    const corner = (vertex: number) => {
      const [px, pz] = [positions.getX(vertex), positions.getZ(vertex)];
      const point: [number, number] = [round(WORLD_ORIGIN.east + x + px * cos + pz * sin), round(WORLD_ORIGIN.north - (z - px * sin + pz * cos))];
      const key = point.join();
      let at = known.get(key);
      if (at === undefined) {
        at = corners.push(point) - 1;
        known.set(key, at);
      }
      return at;
    };
    const triangles: [number, number, number][] = [];
    for (let at = 0; at < index.count; at += 3) triangles.push([corner(index.getX(at)), corner(index.getX(at + 1)), corner(index.getX(at + 2))]);
    return { id: `lighthouse ${id}`, east: round(WORLD_ORIGIN.east + x), north: round(WORLD_ORIGIN.north - z), baseM: null, replaces: "inside", plan: { corners, triangles } };
  });
}
