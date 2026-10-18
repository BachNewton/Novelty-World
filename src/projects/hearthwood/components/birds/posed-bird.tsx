"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { Songbird } from "../../birds/bird";
import { birdPose } from "../../birds/motion";
import type { BirdMode } from "../../gameplay/birds";
import { BirdBody, type BirdHandle } from "./bird-body";

/*
 * One songbird on its own, doing one thing on the spot by a clock: sitting,
 * hopping and pecking, or flapping in the air. For the preview and the art
 * gallery, which show a bird without any rules.
 */

export const BIRD_ACTIVITIES = ["perch", "hop", "fly"] as const;
export type BirdActivity = (typeof BIRD_ACTIVITIES)[number];

const MODE: Record<BirdActivity, BirdMode> = { perch: "perched", hop: "ground", fly: "flying" };

export function PosedBird({ species, activity, clock, atmosphere, seed = 7, scale = 1.7 }: { species: Songbird; activity: BirdActivity; clock: () => number; atmosphere: AtmosphereUniforms; seed?: number; scale?: number }) {
  const bird = useRef<BirdHandle>(null);
  useFrame(() => {
    const time = clock();
    const hop = activity === "hop" ? (time * 1.3) % 1 : null;
    bird.current?.pose(birdPose({ mode: MODE[activity], time, seed, flight: 0.4, hop, about: 1 }));
  });
  return (
    <group scale={scale} position={[0, activity === "fly" ? 0.12 : 0, 0]} userData={{ previewBody: true }}>
      <BirdBody ref={bird} species={species} atmosphere={atmosphere} />
    </group>
  );
}
