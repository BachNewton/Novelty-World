import { WALL_FLOATS, type World } from "../sim/world";

/*
 * What stands where a car might drive: the walls the simulation stops a car with (a building's outline, a stone wall,
 * a pole, a bridge's side), as segments on the ground, in a grid of cells, so a route of thousands of reads costs
 * nothing a tile's worth of walls. The racing line reads it, since the laid road's edges alone don't say that a
 * building's corner stands in the carriageway, or that a gap in the laid road is bridged across a barn. Walls joined
 * end to end are one outline: a closed one (a building, a pole, a boulder) is solid all through, an open one (a stone
 * wall, a bridge's side, a building opened where a road goes through it) only where its walls stand.
 */

export interface Wall {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  /** The height it stands from: its own where it has one (a bridge's side), the ground's under its middle where it stands on the ground. */
  baseY: number;
  /** The outline it is part of: the walls joined end to end with it. */
  outline: number;
  /** Whether that outline closes on itself, as a building's or a pole's does: what it rings is as solid as its walls. */
  closed: boolean;
}

const CELL_M = 16;
/** A wall is in the way of a car on a road at a height where it stands from no higher than this above the road, and is tall enough to reach it. */
const STEP_UP_M = 1.5;
const TALL_M = 6;

/** Whether a wall is in the way of a car at a height. */
export const standsAt = ({ baseY }: Wall, y: number) => baseY <= y + STEP_UP_M && baseY + TALL_M >= y;

const cellOf = (metres: number) => Math.floor(metres / CELL_M);

export class StandingWalls {
  private readonly cells = new Map<string, Wall[]>();

  constructor(world: World) {
    const all: Wall[] = [];
    for (const { detail } of world.all()) {
      if (!detail) continue;
      const { walls } = detail;
      for (let at = 0; at < walls.length; at += WALL_FLOATS) {
        if (Number.isNaN(walls[at])) continue;
        const [fromX, fromZ, toX, toZ, fromY, toY] = walls.subarray(at, at + WALL_FLOATS);
        const baseY = Number.isNaN(fromY) || Number.isNaN(toY) ? world.height((fromX + toX) / 2, (fromZ + toZ) / 2) : Math.min(fromY, toY);
        all.push({ fromX, fromZ, toX, toZ, baseY, outline: all.length, closed: false });
      }
    }
    // Walls that share an end, to the centimetre, are one outline; it is closed if every one of its ends is shared.
    const ends = new Map<string, number[]>();
    const endOf = (x: number, z: number) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
    all.forEach(({ fromX, fromZ, toX, toZ }, wall) => {
      for (const key of [endOf(fromX, fromZ), endOf(toX, toZ)]) {
        const sharing = ends.get(key);
        if (sharing) sharing.push(wall);
        else ends.set(key, [wall]);
      }
    });
    const outlineOf = (wall: number): number => {
      let root = wall;
      while (all[root].outline !== root) root = all[root].outline;
      // Each wall on the way is pointed straight at the outline's first, so the next read is short.
      for (let at = wall; all[at].outline !== root; ) [all[at].outline, at] = [root, all[at].outline];
      return root;
    };
    for (const sharing of ends.values()) for (const wall of sharing) all[outlineOf(wall)].outline = outlineOf(sharing[0]);
    const open = new Set<number>();
    for (const sharing of ends.values()) if (sharing.length < 2) open.add(outlineOf(sharing[0]));
    for (let wall = 0; wall < all.length; wall++) {
      all[wall].outline = outlineOf(wall);
      all[wall].closed = !open.has(all[wall].outline);
    }
    for (const wall of all) {
      const { fromX, fromZ, toX, toZ } = wall;
      // A wall is listed in every cell it crosses.
      const steps = Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / (CELL_M / 2)) + 1;
      const listed = new Set<string>();
      for (let step = 0; step <= steps; step++) {
        const key = `${cellOf(fromX + ((toX - fromX) * step) / steps)},${cellOf(fromZ + ((toZ - fromZ) * step) / steps)}`;
        if (listed.has(key)) continue;
        listed.add(key);
        const list = this.cells.get(key);
        if (list) list.push(wall);
        else this.cells.set(key, [wall]);
      }
    }
  }

  /** Every wall listed within a reach of a place: each once, some a little further off than the reach. */
  near(x: number, z: number, reachM: number): Wall[] {
    const found = new Set<Wall>();
    for (let column = cellOf(x - reachM); column <= cellOf(x + reachM); column++) {
      for (let row = cellOf(z - reachM); row <= cellOf(z + reachM); row++) {
        for (const wall of this.cells.get(`${column},${row}`) ?? []) found.add(wall);
      }
    }
    return [...found];
  }

  /** How near the nearest wall in a car's way comes to a place on a road, within a reach; Infinity where none does. */
  nearestM(x: number, y: number, z: number, reachM: number): number {
    let nearest = Infinity;
    for (const wall of this.near(x, z, reachM)) {
      if (!standsAt(wall, y)) continue;
      const { fromX, fromZ, toX, toZ } = wall;
      const run = (toX - fromX) * (toX - fromX) + (toZ - fromZ) * (toZ - fromZ);
      const share = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - fromX) * (toX - fromX) + (z - fromZ) * (toZ - fromZ)) / run));
      nearest = Math.min(nearest, Math.hypot(fromX + share * (toX - fromX) - x, fromZ + share * (toZ - fromZ) - z));
    }
    return nearest;
  }
}
