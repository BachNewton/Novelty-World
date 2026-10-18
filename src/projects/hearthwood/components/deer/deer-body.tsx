"use client";

import { useCallback, useMemo } from "react";
import { motionSeed } from "../../animals/motion";
import { deerCoatLook } from "../../deer/coat-look";
import type { Deer } from "../../deer/deer";
import { DEER_GAITS, deerPose, type DeerActivity } from "../../deer/motion";
import { rigOf } from "../../deer/rig";
import { AnimalBody, type AnimalProps, type MotionClock } from "../animals/animal-body";
import { useAnimalGeometry } from "../animals/animal-geometry";
import { coatSeasonFor } from "../animals/coat-season";
import { deerCoatMaterial } from "./deer-coat";

/*
 * One roe deer, drawn and moving, on the shared animal body: a buck's
 * sculpture with his antlers or a doe's, in the season's coat unless it is
 * held in one of its own.
 */

export interface DeerBodyProps extends AnimalProps<DeerActivity> {
  deer: Deer;
  coatSeason?: { winter: number; white: number };
}

const moves = (activity: DeerActivity) => DEER_GAITS.includes(activity);

export function DeerBody({ deer, atmosphere, coatSeason, activity = "stand", ...props }: DeerBodyProps) {
  const geometry = useAnimalGeometry({ species: "deer", antlers: deer.build.antlers > 0 });
  const rig = useMemo(() => rigOf(deer.build), [deer.build]);
  const seed = useMemo(() => motionSeed(deer.seed), [deer.seed]);
  const winter = coatSeason?.winter;
  const coat = useCallback(() => deerCoatMaterial(deerCoatLook(deer.coat), coatSeasonFor(winter === undefined ? undefined : { winter, white: 0 }), atmosphere), [deer.coat, winter, atmosphere]);
  const pose = useCallback((clock: MotionClock<DeerActivity>) => deerPose({ ...clock, personality: deer.personality, rig, seed }), [deer.personality, rig, seed]);
  if (!geometry) return null;
  return (
    <AnimalBody
      {...props}
      atmosphere={atmosphere}
      activity={activity}
      geometry={geometry}
      coat={coat}
      rig={rig}
      size={deer.build.size}
      width={1}
      seed={seed}
      moving={moves}
      pose={pose}
      shadowSize={[0.16, 0.42]}
      shadowAt={0.12}
      greetingTime={0.8}
    />
  );
}
