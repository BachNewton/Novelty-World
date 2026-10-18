import { createRng } from "@/shared/lib/seeded-random";
import { PLANT_CHUNK } from "./life";
import { TREE_KINDS, type PlantKind } from "./regions";
import type { World } from "./world";

/*
 * The fallen sticks a dog can be thrown, by area: under the trees of each
 * plant chunk, from the chunk's own seed and its plants alone, so a stick
 * is always where it was. A tree now and then has one lying on dry ground
 * a step or two out from its trunk; and camp always has one by the fire,
 * so the first game of fetch is never a walk away.
 */

export interface StickSpot {
  /** Its chunk and its place in the chunk's list, or `camp`. */
  id: string;
  x: number;
  /** The ground under it. */
  y: number;
  z: number;
  /** Its turn about the vertical, in radians. */
  turn: number;
}

/** What finding sticks asks of the world. */
export type StickGround = Pick<World, "seed" | "camp" | "plantsIn" | "heightAt" | "waterAt">;

/** The chance a tree has a stick fallen by it, and how many a chunk holds at most. */
const PER_TREE = 0.05;
const MOST = 6;
/** How far out from its trunk a stick lies, in metres. */
const OUT = { near: 1.3, far: 3.2 } as const;
/** Where camp's stick lies: round from the fire, clear of the seats, the bedroll and the keepsakes, and how far out. */
const CAMP_STICK = { angle: 6.0, out: 3.4 } as const;

const isTree = (kind: PlantKind) => (TREE_KINDS as readonly PlantKind[]).includes(kind);

/** The steepest ground a stick is left on, as rise over run, so a walker can always reach it. */
const STEEPEST = 0.8;

/** Whether a stick could lie at a point: dry ground, gentle enough to walk up to. */
function dry(ground: StickGround, x: number, z: number): boolean {
  if (ground.heightAt(x, z) <= ground.waterAt(x, z)) return false;
  const dx = ground.heightAt(x + 0.6, z) - ground.heightAt(x - 0.6, z);
  const dz = ground.heightAt(x, z + 0.6) - ground.heightAt(x, z - 0.6);
  return Math.hypot(dx, dz) / 1.2 <= STEEPEST;
}

/** The sticks fallen in one plant chunk. */
export function sticksInChunk(ground: StickGround, chunkX: number, chunkZ: number): StickSpot[] {
  const rng = createRng(`${ground.seed}:sticks:${chunkX},${chunkZ}`);
  const out: StickSpot[] = [];
  for (const plant of ground.plantsIn(chunkX, chunkZ).plants) {
    if (out.length >= MOST) break;
    if (!isTree(plant.kind)) continue;
    // Drawn for every tree, so one tree's luck never moves another's stick.
    const [chance, angle, reach, turn] = [rng.next(), rng.next(), rng.next(), rng.next()];
    if (chance > PER_TREE) continue;
    const r = OUT.near + (OUT.far - OUT.near) * reach;
    const x = plant.x + Math.cos(angle * Math.PI * 2) * r;
    const z = plant.z + Math.sin(angle * Math.PI * 2) * r;
    if (!dry(ground, x, z)) continue;
    out.push({ id: `${chunkX},${chunkZ}:${out.length}`, x, y: ground.heightAt(x, z), z, turn: turn * Math.PI * 2 });
  }
  return out;
}

/** Camp's own stick, by the fire. */
export function campStick(ground: StickGround): StickSpot {
  const { camp } = ground;
  const x = camp.x + Math.cos(CAMP_STICK.angle) * CAMP_STICK.out;
  const z = camp.z + Math.sin(CAMP_STICK.angle) * CAMP_STICK.out;
  return { id: "camp", x, y: ground.heightAt(x, z), z, turn: CAMP_STICK.angle + 1.2 };
}

/** Every stick within `radius` metres of a point, camp's among them. */
export function sticksNear(ground: StickGround, x: number, z: number, radius: number, inChunk: (chunkX: number, chunkZ: number) => StickSpot[] = (cx, cz) => sticksInChunk(ground, cx, cz)): StickSpot[] {
  const out: StickSpot[] = [];
  for (let cz = Math.floor((z - radius) / PLANT_CHUNK); cz <= Math.floor((z + radius) / PLANT_CHUNK); cz++) {
    for (let cx = Math.floor((x - radius) / PLANT_CHUNK); cx <= Math.floor((x + radius) / PLANT_CHUNK); cx++) {
      for (const stick of inChunk(cx, cz)) if (Math.hypot(stick.x - x, stick.z - z) <= radius) out.push(stick);
    }
  }
  const camp = campStick(ground);
  if (Math.hypot(camp.x - x, camp.z - z) <= radius) out.push(camp);
  return out;
}
