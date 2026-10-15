"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { HeliPose } from "../../heli/flight";
import { FOG_FAR } from "../world/world";
import { HeliBody } from "./heli-body";

// The Lily Lifter in the scene, placed each frame from its pose (see
// `heli/flight.ts`): tilted, turned, then moved to its place, without React
// re-rendering. Once it has flown off beyond the fog it is no longer drawn.
export function Helicopter({ lanes, pose }: { lanes: number; pose: () => HeliPose }) {
  const place = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  useFrame(({ camera }) => {
    const group = place.current;
    if (group === null || tilt.current === null) return;
    const at = pose();
    group.position.set(at.x, at.y, -at.depth);
    group.rotation.set(0, at.yaw, 0);
    tilt.current.rotation.set(at.pitch, 0, at.roll);
    group.visible = camera.position.z - group.position.z < FOG_FAR;
  });
  return (
    <group ref={place}>
      <group ref={tilt}>
        <group position={[-(lanes - 1) / 2, 0, 0]}>
          <HeliBody lanes={lanes} />
        </group>
      </group>
    </group>
  );
}
