"use client";

import { useCallback, useMemo } from "react";
import { motionSeed } from "../../animals/motion";
import { squirrelCoatLook } from "../../squirrels/coat-look";
import type { Squirrel } from "../../squirrels/squirrel";
import { SQUIRREL_GAITS, squirrelPose, type SquirrelActivity } from "../../squirrels/motion";
import { rigOf } from "../../squirrels/rig";
import { AnimalBody, type AnimalProps, type MotionClock } from "../animals/animal-body";
import { useAnimalGeometry } from "../animals/animal-geometry";
import { coatSeasonFor } from "../animals/coat-season";
import { squirrelCoatMaterial } from "./squirrel-coat";

/*
 * One red squirrel, drawn and moving, on the shared animal body, in the
 * season's coat unless it is held in one of its own. Whoever places it moves
 * and turns the group (up a trunk, the scene stands it on the bark).
 */

export interface SquirrelBodyProps extends AnimalProps<SquirrelActivity> {
  squirrel: Squirrel;
  /** A coat of its own, held at a season, rather than the season's. */
  coatSeason?: { winter: number; white: number };
}

const moves = (activity: SquirrelActivity) => SQUIRREL_GAITS.includes(activity);

export function SquirrelBody({ squirrel, atmosphere, coatSeason, activity = "stand", ...props }: SquirrelBodyProps) {
  const geometry = useAnimalGeometry({ species: "squirrel" });
  const rig = useMemo(() => rigOf(squirrel.build), [squirrel.build]);
  const seed = useMemo(() => motionSeed(squirrel.seed), [squirrel.seed]);
  const winter = coatSeason?.winter;
  const coat = useCallback(() => squirrelCoatMaterial(squirrelCoatLook(squirrel.coat), coatSeasonFor(winter === undefined ? undefined : { winter, white: 0 }), atmosphere), [squirrel.coat, winter, atmosphere]);
  const pose = useCallback((clock: MotionClock<SquirrelActivity>) => squirrelPose({ ...clock, personality: squirrel.personality, rig, seed }), [squirrel.personality, rig, seed]);
  if (!geometry) return null;
  return (
    <AnimalBody
      {...props}
      atmosphere={atmosphere}
      activity={activity}
      geometry={geometry}
      coat={coat}
      rig={rig}
      size={squirrel.build.size}
      width={1}
      seed={seed}
      moving={moves}
      pose={pose}
      shadowSize={[0.09, 0.16]}
      shadowAt={0.03}
      greetingTime={0.4}
    />
  );
}
