"use client";

import { useCallback, useMemo } from "react";
import { motionSeed } from "../../animals/motion";
import { foxCoatLook } from "../../foxes/coat-look";
import type { Fox } from "../../foxes/fox";
import { FOX_GAITS, foxPose, type FoxActivity } from "../../foxes/motion";
import { rigOf } from "../../foxes/rig";
import { AnimalBody, type AnimalProps, type MotionClock } from "../animals/animal-body";
import { useAnimalGeometry } from "../animals/animal-geometry";
import { foxCoatMaterial } from "./fox-coat";

/*
 * One fox, drawn and moving, on the shared animal body: the fox's sculpture,
 * its coat and its motion. Whoever places it moves and turns the group.
 */

export interface FoxBodyProps extends AnimalProps<FoxActivity> {
  fox: Fox;
}

const moves = (activity: FoxActivity) => FOX_GAITS.includes(activity);

export function FoxBody({ fox, activity = "stand", ...props }: FoxBodyProps) {
  const geometry = useAnimalGeometry({ species: "fox" });
  const rig = useMemo(() => rigOf(fox.build), [fox.build]);
  const seed = useMemo(() => motionSeed(fox.seed), [fox.seed]);
  const coat = useCallback(() => foxCoatMaterial(foxCoatLook(fox.coat)), [fox.coat]);
  const pose = useCallback((clock: MotionClock<FoxActivity>) => foxPose({ ...clock, personality: fox.personality, rig, seed }), [fox.personality, rig, seed]);
  if (!geometry) return null;
  return (
    <AnimalBody
      {...props}
      activity={activity}
      geometry={geometry}
      coat={coat}
      rig={rig}
      size={fox.build.size}
      width={1}
      seed={seed}
      moving={moves}
      pose={pose}
      shadowSize={[0.2, 0.5 * fox.build.body]}
      shadowAt={0.1}
      greetingTime={0.7}
    />
  );
}
