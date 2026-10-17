"use client";

import { useCallback, useMemo } from "react";
import type { Cat } from "../../cats/cat";
import { coatLook } from "../../cats/coat-look";
import { CAT_GAITS, catPose, type Activity } from "../../cats/motion";
import { rigOf } from "../../cats/rig";
import { motionSeed } from "../../animals/motion";
import { AnimalBody, type AnimalProps, type MotionClock } from "../animals/animal-body";
import { useAnimalGeometry } from "../animals/animal-geometry";
import { catCoatMaterial } from "./cat-coat";

/*
 * One cat, drawn and moving, on the shared animal body: its hair length's
 * sculpture, its coat and its motion. Whoever places it moves and turns the
 * group; the cat walks on the spot at `speed` and does what `activity` says,
 * or what the scene drives it to frame by frame.
 */

export interface CatBodyProps extends AnimalProps<Activity> {
  cat: Cat;
}

const walks = (activity: Activity) => CAT_GAITS.includes(activity);

export function CatBody({ cat, activity = "stand", ...props }: CatBodyProps) {
  const geometry = useAnimalGeometry({ species: "cat", longHair: cat.coat.longHair });
  const rig = useMemo(() => rigOf(cat.build), [cat.build]);
  const seed = useMemo(() => motionSeed(cat.seed), [cat.seed]);
  const coat = useCallback(() => catCoatMaterial(coatLook(cat.coat)), [cat.coat]);
  const pose = useCallback((clock: MotionClock<Activity>) => catPose({ ...clock, personality: cat.personality, rig, seed }), [cat.personality, rig, seed]);
  if (!geometry) return null;
  return (
    <AnimalBody
      {...props}
      activity={activity}
      geometry={geometry}
      coat={coat}
      rig={rig}
      size={cat.build.size}
      width={cat.build.stockiness}
      seed={seed}
      moving={walks}
      pose={pose}
      shadowSize={[0.22, 0.42]}
      shadowAt={0.12}
      greetingTime={0.7}
    />
  );
}
