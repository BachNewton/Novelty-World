"use client";

import { useCallback, useMemo } from "react";
import { motionSeed } from "../../animals/motion";
import { hareCoatLook } from "../../hares/coat-look";
import type { Hare } from "../../hares/hare";
import { HARE_GAITS, harePose, type HareActivity } from "../../hares/motion";
import { rigOf } from "../../hares/rig";
import { AnimalBody, type AnimalProps, type MotionClock } from "../animals/animal-body";
import { useAnimalGeometry } from "../animals/animal-geometry";
import { coatSeasonFor } from "../animals/coat-season";
import { hareCoatMaterial } from "./hare-coat";

/*
 * One mountain hare, drawn and moving, on the shared animal body, white as
 * the season has turned it unless it is held in a coat of its own.
 */

export interface HareBodyProps extends AnimalProps<HareActivity> {
  hare: Hare;
  coatSeason?: { winter: number; white: number };
}

const moves = (activity: HareActivity) => HARE_GAITS.includes(activity);

export function HareBody({ hare, atmosphere, coatSeason, activity = "stand", ...props }: HareBodyProps) {
  const geometry = useAnimalGeometry({ species: "hare" });
  const rig = useMemo(() => rigOf(hare.build), [hare.build]);
  const seed = useMemo(() => motionSeed(hare.seed), [hare.seed]);
  const white = coatSeason?.white;
  const coat = useCallback(() => hareCoatMaterial(hareCoatLook(hare.coat), coatSeasonFor(white === undefined ? undefined : { winter: 0, white }), atmosphere), [hare.coat, white, atmosphere]);
  const pose = useCallback((clock: MotionClock<HareActivity>) => harePose({ ...clock, personality: hare.personality, rig, seed }), [hare.personality, rig, seed]);
  if (!geometry) return null;
  return (
    <AnimalBody
      {...props}
      atmosphere={atmosphere}
      activity={activity}
      geometry={geometry}
      coat={coat}
      rig={rig}
      size={hare.build.size}
      width={1}
      seed={seed}
      moving={moves}
      pose={pose}
      shadowSize={[0.16, 0.34]}
      shadowAt={0.07}
      greetingTime={0.5}
    />
  );
}
