"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Mesh } from "three";
import { GROUND_DROP } from "../../world/geometry";
import { roadTile, roadTiles, structuresNear, type WorldPlan } from "../../world/road";
import { sceneryTile, sceneryTiles } from "../../world/scenery";
import { gantryBoxes, overpassBoxes } from "../../world/structures";
import { BoxInstances } from "./box-instances";
import { Clouds, Sky } from "./sky";
import { makeWorldMaterials, readWorldPalette, type WorldMaterials, type WorldPalette } from "./world-assets";

// The fog starts beyond the rows the player reads and ends where the road is
// built to, so the road and the land fade into the horizon haze rather than
// ending. Nothing beyond its far end can be seen, which is where recycled
// traffic reappears.
const FOG_NEAR = 90;
export const FOG_FAR = 520;
const GROUND_SIZE = 1400;

function sameTiles(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a[0] === b[0];
}

// The tiles around the camera, updated only when it moves onto another tile.
function useTilesAroundCamera(tilesAt: (cameraDepth: number) => number[]): number[] {
  const camera = useThree((s) => s.camera);
  const [tiles, setTiles] = useState(() => tilesAt(-camera.position.z));
  useFrame(() => {
    const next = tilesAt(-camera.position.z);
    if (!sameTiles(next, tiles)) setTiles(next);
  });
  return tiles;
}

function useWorldAssets(): { palette: WorldPalette; materials: WorldMaterials } {
  const palette = useMemo(() => readWorldPalette(), []);
  const materials = useMemo(() => makeWorldMaterials(), []);
  useEffect(
    () => () => {
      materials.dispose();
    },
    [materials],
  );
  return { palette, materials };
}

// The land under everything, following the camera so it never runs out.
function Ground({ palette }: { palette: WorldPalette }) {
  const groundRef = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (groundRef.current !== null) groundRef.current.position.z = camera.position.z;
  });
  return (
    <mesh ref={groundRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -GROUND_DROP, 0]}>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshLambertMaterial color={palette.meadow} />
    </mesh>
  );
}

// The world around the road: the road itself with its markings, the
// roadside and its lay-bys, the land in layers out to the mountains, the sky, and the two
// structures, the overpass at the start and the finish gantry. It is drawn in
// the game scene's axes and needs the scene's lights. The road and land are
// rebuilt around the camera as it moves, so they go on forever both ways.
export function FrogminoWorld({ courseLength, seed, lanes }: { courseLength: number; seed: number; lanes: number }) {
  const { palette, materials } = useWorldAssets();
  const plan: WorldPlan = useMemo(() => ({ seed, courseLength, lanes }), [seed, courseLength, lanes]);
  const roadKeys = useTilesAroundCamera(roadTiles);
  const sceneryKeys = useTilesAroundCamera(sceneryTiles);

  const road = useMemo(() => {
    const tiles = roadKeys.map((k) => roadTile(plan, k));
    return {
      surfaces: tiles.flatMap((t) => t.surfaces),
      markings: tiles.flatMap((t) => t.markings),
      props: [...tiles.flatMap((t) => t.props), ...structuresNear(plan, roadKeys)],
    };
  }, [plan, roadKeys]);
  const land = useMemo(() => sceneryKeys.flatMap((k) => sceneryTile(plan, k)), [plan, sceneryKeys]);

  return (
    <>
      <fog attach="fog" args={[palette["sky-horizon"], FOG_NEAR, FOG_FAR]} />
      <Sky palette={palette} />
      <Ground palette={palette} />
      <Clouds seed={seed} palette={palette} material={materials.scenery} />
      <BoxInstances boxes={road.surfaces} palette={palette} material={materials.surface} />
      <BoxInstances boxes={road.markings} palette={palette} material={materials.marking} />
      <BoxInstances boxes={road.props} palette={palette} material={materials.scenery} />
      <BoxInstances boxes={land} palette={palette} material={materials.scenery} />
    </>
  );
}

// Just the overpass and the finish gantry, for a scene without the world.
export function FrogminoStructures({ courseLength, lanes }: { courseLength: number; lanes: number }) {
  const { palette, materials } = useWorldAssets();
  const boxes = useMemo(() => [...overpassBoxes(lanes), ...gantryBoxes(lanes, courseLength)], [courseLength, lanes]);
  return <BoxInstances boxes={boxes} palette={palette} material={materials.scenery} />;
}
