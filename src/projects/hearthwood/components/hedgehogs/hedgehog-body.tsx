"use client";

import { useCallback, useMemo } from "react";
import { motionSeed } from "../../animals/motion";
import { hedgehogCoatLook } from "../../hedgehogs/coat-look";
import type { Hedgehog } from "../../hedgehogs/hedgehog";
import { HEDGEHOG_GAITS, hedgehogPose, type HedgehogActivity } from "../../hedgehogs/motion";
import { rigOf } from "../../hedgehogs/rig";
import { AnimalBody, type AnimalProps, type MotionClock } from "../animals/animal-body";
import { useAnimalGeometry } from "../animals/animal-geometry";
import { hedgehogCoatMaterial } from "./hedgehog-coat";

/*
 * One hedgehog, drawn and moving, on the shared animal body. Whoever places
 * it moves and turns the group (in the world, or in Elliott's basket).
 */

export interface HedgehogBodyProps extends AnimalProps<HedgehogActivity> {
  hedgehog: Hedgehog;
}

const moves = (activity: HedgehogActivity) => HEDGEHOG_GAITS.includes(activity);

export function HedgehogBody({ hedgehog, activity = "stand", ...props }: HedgehogBodyProps) {
  const geometry = useAnimalGeometry({ species: "hedgehog" });
  const rig = useMemo(() => rigOf(hedgehog.build), [hedgehog.build]);
  const seed = useMemo(() => motionSeed(hedgehog.seed), [hedgehog.seed]);
  const coat = useCallback(() => hedgehogCoatMaterial(hedgehogCoatLook(hedgehog.coat)), [hedgehog.coat]);
  const pose = useCallback((clock: MotionClock<HedgehogActivity>) => hedgehogPose({ ...clock, personality: hedgehog.personality, rig, seed }), [hedgehog.personality, rig, seed]);
  if (!geometry) return null;
  return (
    <AnimalBody
      {...props}
      activity={activity}
      geometry={geometry}
      coat={coat}
      rig={rig}
      size={hedgehog.build.size}
      width={1}
      seed={seed}
      moving={moves}
      pose={pose}
      shadowSize={[0.15, 0.24]}
      shadowAt={0.05}
      greetingTime={0.5}
    />
  );
}
