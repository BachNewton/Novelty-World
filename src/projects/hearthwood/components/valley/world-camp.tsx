"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { World } from "../../engine/world";
import { pitchTrouble, siteAhead, type CampSite, type PitchGround } from "../../gameplay/camp";
import { RUN_SPEED } from "../../input/walk-controls";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import { anchorOf, CAMP_PARTS, CampGhost, Campfire, type CampLifts, type FireState, type GhostDrive } from "../../art/campfire";
import type { Palette } from "../../art/palette";
import { carryingCamp, lookForPitch, settledFor, settlePitch, stepCamping, subscribeCamping, type Camping } from "./camping";
import { AFTER_RENDER_PRIORITY } from "./feature-renderer";
import type { Foraging } from "./foraging";
import { peopleAround, type People } from "./people";
import type { Walker } from "./walker";

/*
 * Camp in the world: the camp drawn where it is pitched (its pieces settling
 * and its fire catching as it goes up, packing away as it comes down), each
 * of its things set down on its own ground; and while it is carried, the
 * ghost of where it would go, a few steps in front of Elliott while they
 * stand or walk on the ground, warm where the ground is good to pitch on
 * and faint where it isn't. Good ground offers pitching, unless anything
 * else is offered.
 */

/** Before the walker, so the ghost is worked out from where Elliott stood as the frame began. */
export const CAMP_PRIORITY = -4.5;
/** The ghost is worked out again once it has moved this far, or turned this much. */
const GHOST_RECHECK = { metres: 0.25, turn: 0.05 } as const;
/** Faster than this and Elliott is going somewhere, not looking for a spot: the ghost hides. */
const LOOKING_PACE = RUN_SPEED * 0.75;

/** How far above the fire's ground each of a camp's things stands, where it is set down. */
function liftsAt(world: World, site: Pick<CampSite, "x" | "z" | "turn">, y: number): CampLifts {
  const c = Math.cos(site.turn);
  const s = Math.sin(site.turn);
  const lifts: CampLifts = {};
  for (const part of CAMP_PARTS) {
    const { x, z } = anchorOf(part);
    // Sunk a hand's breadth into ground that falls away under it, so nothing floats.
    lifts[part] = world.heightAt(site.x + x * c - z * s, site.z + x * s + z * c) - y - 0.03;
  }
  lifts.ring = 0;
  lifts.tripod = 0;
  return lifts;
}

/** The ground camp is pitched on, as the walk knows it: the world, what there is to pick, and where people are. */
export function pitchGround(world: World, foraging: Foraging, people: People): PitchGround {
  return {
    sampleAt: world.sampleAt,
    plantsIn: world.plantsIn,
    placesNear: world.placesNear,
    forageNear: (x, z, radius) => foraging.forage.spotsNear(x, z, radius).length > 0,
    // A home stands a way from its person, so people are looked for further out than the room kept from them.
    folkNear: (x, z, radius) => peopleAround(people, x, z, radius + 40).some((p) => Math.hypot(p.x - x, p.z - z) < radius || p.homes.some((h) => Math.hypot(h.x - x, h.z - z) < radius)),
  };
}

interface CampFrame {
  camping: Camping;
  world: World;
  walker: Walker;
  ground: PitchGround;
  ghost: { current: GhostDrive | null };
  /** Where Elliott stood last frame, for how fast they go. */
  was: { x: number; z: number };
}

/** One frame of camp: its clock, and while it is carried, where the ghost goes and whether the ground there is good. */
function frameCamp({ camping, world, walker, ground, ghost, was }: CampFrame, delta: number): void {
  const seconds = Math.min(delta, 0.1);
  stepCamping(camping, seconds);
  const pace = seconds > 0 ? Math.hypot(walker.x - was.x, walker.z - was.z) / seconds : 0;
  was.x = walker.x;
  was.z = walker.z;
  const looking = carryingCamp(camping) && camping.shown.leaving === null && walker.view === "walk" && (walker.air?.mode ?? "ground") === "ground" && pace < LOOKING_PACE;
  if (!looking) {
    lookForPitch(camping, null);
    ghost.current = null;
    return;
  }
  const ahead = siteAhead(walker);
  const last = camping.ghost?.site;
  if (last && Math.hypot(ahead.x - last.x, ahead.z - last.z) <= GHOST_RECHECK.metres && Math.abs(Math.atan2(Math.sin(ahead.turn - last.turn), Math.cos(ahead.turn - last.turn))) <= GHOST_RECHECK.turn) return;
  const y = world.heightAt(ahead.x, ahead.z);
  const site = { ...ahead, y };
  const good = pitchTrouble(ground, ahead.x, ahead.z) === null;
  lookForPitch(camping, { site, good });
  ghost.current = { ...site, lifts: liftsAt(world, site, y), good };
}

export function WorldCamp({
  camping,
  world,
  foraging,
  people,
  walker,
  palette,
  atmosphere,
  fire,
  outbid,
}: {
  camping: Camping;
  world: World;
  foraging: Foraging;
  people: People;
  walker: Walker;
  palette: Palette;
  atmosphere: AtmosphereUniforms;
  fire: FireState;
  /** Whether anything else is offered this frame, which pitching gives way to. */
  outbid: () => boolean;
}) {
  const subscribe = useCallback((listener: () => void) => subscribeCamping(camping, listener), [camping]);
  const shown = useSyncExternalStore(subscribe, () => camping.shown);
  const standing = shown.camp.carried ? shown.leaving : shown.camp.site;
  const lifts = useMemo(() => (standing ? liftsAt(world, standing, standing.y) : {}), [world, standing]);
  const ground = useMemo(() => pitchGround(world, foraging, people), [world, foraging, people]);
  const ghost = useRef<GhostDrive | null>(null);
  const was = useRef({ x: walker.x, z: walker.z });
  const appear = useCallback(() => settledFor(camping), [camping]);

  useFrame((_, delta) => {
    frameCamp({ camping, world, walker, ground, ghost, was: was.current }, delta);
  }, CAMP_PRIORITY);

  // After the frame: anything else offered beats pitching, as everything had to beat it.
  useFrame(() => {
    settlePitch(camping, outbid());
  }, AFTER_RENDER_PRIORITY);

  return (
    <>
      {standing && <Campfire key={`${standing.x},${standing.z}`} at={standing} turn={standing.turn} lifts={lifts} appear={appear} seed={world.seed} palette={palette} atmosphere={atmosphere} fire={fire} />}
      <CampGhost palette={palette} drive={() => ghost.current} />
    </>
  );
}
