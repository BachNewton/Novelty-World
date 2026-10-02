"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { GROUND_CLEARANCE } from "../clearance";
import type { VehicleId } from "../fleet";
import { vehicleModel } from "../vehicles";
import { applyRumble, rumbleFor, rumblePose } from "../vehicles/rumble";
import { mergedParts, type VehicleAssets } from "./vehicle-assets";

// One of the 19 vehicles, in the scene's axes: its leftmost lane centred on
// x = lane, as a wall's column is, standing on its wheels on the road at
// y = 0 with its cells the ground clearance above it, with its front face at
// rule depth `depth` (z = -depth) and its length stretching away from the
// frog beyond it. Given a rumble seed, it rumbles as it drives, its own way
// for that seed, with the frame clock; without one it stands still.
export function Vehicle({
  id,
  lane,
  depth,
  assets,
  rumbleSeed,
}: {
  id: VehicleId;
  lane: number;
  depth: number;
  assets: VehicleAssets;
  rumbleSeed?: string;
}) {
  const model = useMemo(() => vehicleModel(id), [id]);
  const parts = useMemo(() => mergedParts(model.parts), [model]);
  useEffect(
    () => () => {
      parts.forEach(({ geometry }) => {
        geometry.dispose();
      });
    },
    [parts],
  );

  const rumble = useMemo(() => (rumbleSeed === undefined ? null : rumbleFor(rumbleSeed)), [rumbleSeed]);
  const body = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (rumble !== null && body.current !== null) applyRumble(body.current, rumblePose(rumble, clock.elapsedTime, model.length));
  });

  return (
    <group position={[lane - 0.5, GROUND_CLEARANCE, -depth]}>
      <group ref={body}>
        {model.body.map(({ cell, paint }) => (
          <mesh
            key={`${String(cell.col)},${String(cell.row)}`}
            geometry={assets.cube}
            material={assets.body[paint]}
            position={[cell.col + 0.5, cell.row + 0.5, -model.length / 2]}
            scale={[1, 1, model.length]}
          />
        ))}
        {parts.map(({ paint, geometry }) => (
          <mesh key={paint} geometry={geometry} material={assets.parts[paint]} />
        ))}
      </group>
    </group>
  );
}
