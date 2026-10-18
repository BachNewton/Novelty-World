"use client";

import { useCallback, useMemo } from "react";
import { motionSeed } from "../../animals/motion";
import { dogCoatLook } from "../../dogs/coat-look";
import type { Dog } from "../../dogs/dog";
import { dogPose, GAITS, type DogActivity, type DogPlay } from "../../dogs/motion";
import { rigOf } from "../../dogs/rig";
import { AnimalBody, type AnimalProps, type MotionClock } from "../animals/animal-body";
import { useAnimalGeometry } from "../animals/animal-geometry";
import { dogCoatMaterial } from "./dog-coat";

/*
 * One dog, drawn and moving, on the shared animal body: the sculpture for its
 * ears and coat, its coat's shader and its motion. Whoever places it moves and
 * turns the group; the dog moves on the spot at `speed` and does what
 * `activity` says, and at play holds itself as `play` says.
 */

export interface DogBodyProps extends AnimalProps<DogActivity> {
  dog: Dog;
  /** How it holds itself at play, read each frame. */
  play?: () => DogPlay;
}

const moves = (activity: DogActivity) => GAITS.includes(activity);

export function DogBody({ dog, activity = "stand", atmosphere, play, ...props }: DogBodyProps) {
  const geometry = useAnimalGeometry({ species: "dog", ears: dog.ears, coat: dog.coat.length });
  const rig = useMemo(() => rigOf(dog.build), [dog.build]);
  const seed = useMemo(() => motionSeed(dog.seed), [dog.seed]);
  const coat = useCallback(() => dogCoatMaterial(dogCoatLook(dog.coat, dog.ears), atmosphere), [dog.coat, dog.ears, atmosphere]);
  const pose = useCallback(
    (clock: MotionClock<DogActivity>) => dogPose({ ...clock, personality: dog.personality, rig, tail: dog.tail, ears: dog.ears, seed, play: play?.() }),
    [dog.personality, dog.tail, dog.ears, rig, seed, play],
  );
  if (!geometry) return null;
  return (
    <AnimalBody
      {...props}
      atmosphere={atmosphere}
      activity={activity}
      geometry={geometry}
      coat={coat}
      rig={rig}
      size={dog.build.size}
      width={dog.build.stockiness}
      seed={seed}
      moving={moves}
      pose={pose}
      shadowSize={[0.24, 0.5 * dog.build.body]}
      shadowAt={0.12}
      greetingTime={0.5}
    />
  );
}
