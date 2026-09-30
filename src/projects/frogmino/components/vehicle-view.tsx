"use client";

import { BoxGeometry, MeshLambertMaterial, type Texture } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { WALL_THICKNESS } from "../run";
import { VEHICLE_IDS, vehicleCells, type VehicleId } from "../fleet";

// Placeholder vehicle art: each vehicle is its four cubes, as deep as the
// rules count a row, in one flat colour of its own. The scene draws traffic
// only through `VehicleView` and `makeVehicleViewAssets`. The fleet's art
// `Vehicle` takes the same props, so swapping it in means drawing `Vehicle`
// with `makeVehicleAssets` in the scene instead.

export interface VehicleViewAssets {
  cube: BoxGeometry;
  paints: Record<VehicleId, MeshLambertMaterial>;
  dispose: () => void;
}

export function makeVehicleViewAssets(cellMap: Texture): VehicleViewAssets {
  const cube = new BoxGeometry(1, 1, 1);
  const paints = Object.fromEntries(
    VEHICLE_IDS.map((id) => [
      id,
      new MeshLambertMaterial({ color: themeColor(`--color-frogmino-placeholder-${id.toLowerCase()}`), map: cellMap }),
    ]),
  ) as Record<VehicleId, MeshLambertMaterial>;
  return {
    cube,
    paints,
    dispose: () => {
      cube.dispose();
      Object.values(paints).forEach((paint) => {
        paint.dispose();
      });
    },
  };
}

// One vehicle in the scene's axes: its leftmost lane's cells centred on
// x = lane, as the rules' columns are, resting on the road, with its front
// face at rule depth `depth` (z = -depth) and its body reaching away from the
// frog beyond it.
export function VehicleView({
  id,
  lane,
  depth,
  assets,
}: {
  id: VehicleId;
  lane: number;
  depth: number;
  assets: VehicleViewAssets;
}) {
  return (
    <group position={[lane, 0, -depth]}>
      {vehicleCells(id).map((cell) => (
        <mesh
          key={`${String(cell.col)},${String(cell.row)}`}
          geometry={assets.cube}
          material={assets.paints[id]}
          position={[cell.col, cell.row + 0.5, -WALL_THICKNESS / 2]}
          scale={[1, 1, WALL_THICKNESS]}
        />
      ))}
    </group>
  );
}
