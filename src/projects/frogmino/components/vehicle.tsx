"use client";

import { useEffect, useMemo } from "react";
import type { VehicleId } from "../fleet";
import { vehicleModel } from "../vehicles";
import { mergedParts, type VehicleAssets } from "./vehicle-assets";

// One of the 19 vehicles, in the scene's axes: its leftmost lane centred on
// x = lane, as a wall's column is, resting on the road, with its front face
// at rule depth `depth` (z = -depth) and its length stretching away from the
// frog beyond it.
export function Vehicle({
  id,
  lane,
  depth,
  assets,
}: {
  id: VehicleId;
  lane: number;
  depth: number;
  assets: VehicleAssets;
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

  return (
    <group position={[lane - 0.5, 0, -depth]}>
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
  );
}
