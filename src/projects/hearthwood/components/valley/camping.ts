import type { World } from "../../engine/world";
import { homeCamp, packUp, pitch, type Camp, type CampSite } from "../../gameplay/camp";

/*
 * A walk's camp, between the scene, the overlay over it and the probe:
 * where it is pitched or that it is carried, the spot it would be pitched
 * at now (the ghost in front of Elliott, and whether the ground there is
 * good), whether pitching is offered, and when it last went up or came
 * down, so the scene can show its pieces settling and the fire lighting,
 * or the camp packing away. The scene works out the ghost each frame; the overlay reads what is shown as
 * an external store.
 */

/** How long the camp takes to go up, its pieces settling one by one and then the fire lighting, in seconds; packing away runs it back at twice the pace. */
export const SETTLE_SECONDS = 2.6;
const PACK_PACE = 2;

export interface CampShown {
  camp: Camp;
  /** Whether pitching is offered (carrying, on good ground, nothing else offered). */
  offered: boolean;
  /** The camp just packed up, while it is still being packed away. */
  leaving: CampSite | null;
}

export interface Camping {
  world: World;
  /** Camping's own clock, in seconds, stepped by the scene: what the settling and packing are timed by. */
  time: number;
  /** When camp last went up or came down, on camping's clock; null for a camp standing since the walk began. */
  changedAt: number | null;
  /** Held, the settling stays this many seconds in, for screenshots; null lets it run. */
  heldSettle: number | null;
  /** Where camp would go if pitched now and whether the ground there is good, while it is carried: the scene's to say each frame. */
  ghost: { site: CampSite; good: boolean } | null;
  /** Whether pitching would be offered this frame, before forage, the animals and the people have their say. */
  candidate: boolean;
  shown: CampShown;
  listeners: Set<() => void>;
}

export function createCamping(world: World): Camping {
  return { world, time: 0, changedAt: null, heldSettle: null, ghost: null, candidate: false, shown: { camp: homeCamp(world), offered: false, leaving: null }, listeners: new Set() };
}

function show(camping: Camping, change: Partial<CampShown>): void {
  camping.shown = { ...camping.shown, ...change };
  for (const listener of camping.listeners) listener();
}

export function subscribeCamping(camping: Camping, listener: () => void): () => void {
  camping.listeners.add(listener);
  return () => {
    camping.listeners.delete(listener);
  };
}

/** Where the fire is, while camp is pitched. */
export const pitchedSite = (camping: Camping): CampSite | null => (camping.shown.camp.carried ? null : camping.shown.camp.site);

/** Where companions resting at camp wait: by the fire, or, while it is carried, where it was packed up. */
export const restingSite = (camping: Camping): CampSite => camping.shown.camp.site;

export const carryingCamp = (camping: Camping): boolean => camping.shown.camp.carried;

/** Seconds into the camp's going up: how far its pieces have settled and the fire caught (`SETTLE_SECONDS` and on is a camp standing), or, while it packs away, the same run back. */
export function settledFor(camping: Camping): number {
  if (camping.heldSettle !== null) return camping.heldSettle;
  if (camping.changedAt === null) return Infinity;
  const since = camping.time - camping.changedAt;
  return camping.shown.leaving ? SETTLE_SECONDS - since * PACK_PACE : since;
}

/** The scene's clock moves camping's on; a camp packed away is gone once it has. */
export function stepCamping(camping: Camping, seconds: number): void {
  camping.time += seconds;
  if (camping.shown.leaving && settledFor(camping) <= 0) show(camping, { leaving: null });
}

/** Where the ghost stands and whether the ground there is good, or that Elliott isn't looking for a spot: the scene's to say each frame. */
export function lookForPitch(camping: Camping, ghost: Camping["ghost"]): void {
  camping.ghost = ghost;
  camping.candidate = ghost?.good ?? false;
}

/** After forage, the animals, the people and the clues have had their say: whether pitching is offered now. */
export function settlePitch(camping: Camping, othersOffered: boolean): void {
  const offered = camping.candidate && !othersOffered;
  if (offered !== camping.shown.offered) show(camping, { offered });
}

/** Packs camp up onto Elliott's pack: the fire goes out and its pieces are packed away. */
export function packUpCamp(camping: Camping): void {
  const camp = packUp(camping.shown.camp);
  camping.changedAt = camping.time;
  show(camping, { camp, leaving: camp.site, offered: false });
}

/** Pitches camp at a site: its pieces settle and the fire lights. */
export function pitchCampAt(camping: Camping, site: CampSite): void {
  const camp = pitch(camping.shown.camp, site);
  camping.changedAt = camping.time;
  camping.ghost = null;
  camping.candidate = false;
  show(camping, { camp, leaving: null, offered: false });
}

/** Pitches camp where the ghost stands, as using the offer does. */
export function pitchCamp(camping: Camping): void {
  const ghost = camping.ghost;
  if (!ghost?.good) throw new Error("There is no good ground in front of Elliott to pitch camp on");
  pitchCampAt(camping, ghost.site);
}

/** Holds the settling this many seconds in, or lets it run with null: for screenshots. */
export function holdSettle(camping: Camping, seconds: number | null): void {
  camping.heldSettle = seconds;
}

/** Camp back at home, pitched, and nothing kept: for screenshots and tests. */
export function forgetCamp(camping: Camping): void {
  camping.changedAt = null;
  camping.ghost = null;
  camping.candidate = false;
  show(camping, { camp: homeCamp(camping.world), leaving: null, offered: false });
}
