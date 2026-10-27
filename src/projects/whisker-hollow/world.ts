import { CAST } from "./cast";
import { LEVEL, homeAt, seeded } from "./level";
import type { Animal, Pair, Point, World } from "./types";

/**
 * The rules, pure. Both animals of every pair start hidden among the junk;
 * the players find each and carry it to the pair's home, the one with their
 * picture. Once both are home, whoever brought the second names the pair, and
 * the hunt is over when every pair is home and named. The host runs every
 * change through here; a change that isn't allowed returns the world as it
 * was, so a late or doubled intent from the wire is harmless.
 */

export const MAX_NAME_LENGTH = 20;
/** How near a player must be to pick an animal up. */
export const REACH = 1.6;
/** Partners start at least this far apart, so finding one never finds both. */
const PARTNERS_APART = 25;

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Every animal at a hiding spot of its own, partners far apart. */
export function newWorld(): World {
  const random = seeded(17);
  const free = [...LEVEL.spots];
  if (free.length < CAST.length * 2) throw new Error(`whisker hollow: ${free.length} hiding spots for ${CAST.length * 2} animals`);
  const take = (awayFrom: Point | null): Point => {
    const far = awayFrom === null ? free : free.filter((s) => distance(s, awayFrom) >= PARTNERS_APART);
    const choice = (far.length > 0 ? far : free)[Math.floor(random() * (far.length > 0 ? far.length : free.length))];
    free.splice(free.indexOf(choice), 1);
    return choice;
  };
  const animals = CAST.flatMap((pair): Animal[] => {
    const first = take(null);
    return [
      { id: `${pair.id}/a`, species: pair.id, where: { kind: "lost", at: first } },
      { id: `${pair.id}/b`, species: pair.id, where: { kind: "lost", at: take(first) } },
    ];
  });
  return { animals, pairs: [] };
}

export function carriedBy(world: World, playerId: string): Animal | undefined {
  return world.animals.find((a) => a.where.kind === "carried" && a.where.by === playerId);
}

function replace(world: World, changed: Animal): World {
  return { ...world, animals: world.animals.map((a) => (a.id === changed.id ? changed : a)) };
}

export function pickUp(world: World, playerId: string, animalId: string, from: Point): World {
  const animal = world.animals.find((a) => a.id === animalId);
  if (animal?.where.kind !== "lost" || carriedBy(world, playerId) !== undefined) return world;
  if (distance(animal.where.at, from) > REACH) return world;
  return replace(world, { ...animal, where: { kind: "carried", by: playerId } });
}

export type PutDownOutcome = "home" | "reunited" | "wrong-home" | "dropped" | "nothing";

/**
 * Put down what a player carries. At its own home it is home, and if its
 * partner is already there the pair is back together; at another pair's home
 * it stays in the player's arms; anywhere else it waits there.
 */
export function putDown(world: World, playerId: string, at: Point): { world: World; outcome: PutDownOutcome } {
  const carried = carriedBy(world, playerId);
  if (carried === undefined) return { world, outcome: "nothing" };
  const home = homeAt(at);
  if (home === undefined) return { world: replace(world, { ...carried, where: { kind: "lost", at } }), outcome: "dropped" };
  if (home.species !== carried.species) return { world, outcome: "wrong-home" };
  const next = replace(world, { ...carried, where: { kind: "home" } });
  const together = next.animals.filter((a) => a.species === carried.species).every((a) => a.where.kind === "home");
  if (!together) return { world: next, outcome: "home" };
  const pair: Pair = { species: carried.species, broughtBy: playerId, naming: null };
  return { world: { ...next, pairs: [...next.pairs, pair] }, outcome: "reunited" };
}

/** A player left: what they carried waits where they last stood. */
export function release(world: World, playerId: string, at: Point): World {
  const carried = carriedBy(world, playerId);
  return carried === undefined ? world : replace(world, { ...carried, where: { kind: "lost", at } });
}

/**
 * Put down whatever is carried by someone no longer here: a loaded save, or a
 * world inherited from a host who left. Each waits where its carrier was last
 * seen, if known, or at `fallback`.
 */
export function releaseAbsent(
  world: World,
  present: ReadonlySet<string>,
  lastSeen: (playerId: string) => Point | undefined,
  fallback: Point,
): World {
  let next = world;
  for (const animal of world.animals) {
    if (animal.where.kind === "carried" && !present.has(animal.where.by)) {
      next = release(next, animal.where.by, lastSeen(animal.where.by) ?? fallback);
    }
  }
  return next;
}

export function cleanName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim();
  return clean.length === 0 || clean.length > MAX_NAME_LENGTH ? null : clean;
}

/** Name a pair that is home and nameless. */
export function namePair(world: World, species: string, name: string, by: string): World {
  const clean = cleanName(name);
  const pair = world.pairs.find((p) => p.species === species);
  if (pair === undefined || pair.naming !== null || clean === null) return world;
  return { ...world, pairs: world.pairs.map((p) => (p === pair ? { ...p, naming: { name: clean, by } } : p)) };
}

/** The pair this player brought home and hasn't named yet. */
export function awaitingName(world: World, playerId: string): Pair | undefined {
  return world.pairs.find((p) => p.naming === null && p.broughtBy === playerId);
}

/** Every pair home and named: the hunt is over. */
export function finished(world: World): boolean {
  return world.pairs.length === CAST.length && world.pairs.every((p) => p.naming !== null);
}
