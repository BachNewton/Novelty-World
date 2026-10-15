"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { GROUND_DROP } from "../../world/geometry";
import { roadTile, roadTiles, type WorldPlan } from "../../world/road";
import { sceneryTile, sceneryTiles } from "../../world/scenery";
import { finishMarkings, gantryBoxes } from "../../world/structures";
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

// The road going by beneath the cruising helicopter (see `heli/flight.ts`):
// how far it has gone up the course, read each frame, and whether it has
// stopped, as it does when the team jumps out.
export interface RoadCruise {
  shift: () => number;
  stopped: boolean;
}

const STILL: RoadCruise = { shift: () => 0, stopped: true };

function sameTiles(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a[0] === b[0];
}

interface TilesView {
  keys: number[];
  // How far the road had gone by when they were laid out.
  shift: number;
}

// The tiles around the camera, where it is over the road, updated only when
// it moves onto another tile, or when the road stops beneath it.
function useTilesAroundCamera(tilesAt: (cameraDepth: number) => number[], cruise: RoadCruise): TilesView {
  const camera = useThree((s) => s.camera);
  const [view, setView] = useState<TilesView>(() => {
    const shift = cruise.shift();
    return { keys: tilesAt(-camera.position.z - shift), shift };
  });
  useFrame(() => {
    const shift = cruise.shift();
    const keys = tilesAt(-camera.position.z - shift);
    if (!sameTiles(keys, view.keys) || (cruise.stopped && shift !== view.shift)) setView({ keys, shift });
  });
  return view;
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
// roadside and its lay-bys, the land in layers out to the mountains, the sky,
// and the finish gantry with the finish painted under it. It is drawn in the
// game scene's axes and needs the scene's lights. The road and land are
// rebuilt around the camera as it moves, so they go on forever both ways.
//
// The road and land are drawn shifted up the course by however far the road
// has gone by beneath the helicopter; the gantry and the finish stay in the
// course's frame, with the rows. The roadside keeps clear of the gantry where
// it stood as the tiles were last laid out, which is exact once the road has
// stopped.
export function FrogminoWorld({ courseLength, seed, lanes, cruise = STILL }: { courseLength: number; seed: number; lanes: number; cruise?: RoadCruise }) {
  const { palette, materials } = useWorldAssets();
  const road = useTilesAroundCamera(roadTiles, cruise);
  const scenery = useTilesAroundCamera(sceneryTiles, cruise);
  const roadPlan: WorldPlan = useMemo(() => ({ seed, courseLength, lanes, finishAt: courseLength - road.shift }), [seed, courseLength, lanes, road.shift]);
  const landPlan: WorldPlan = useMemo(() => ({ seed, courseLength, lanes, finishAt: courseLength }), [seed, courseLength, lanes]);
  const shifted = useRef<Group>(null);

  const tiles = useMemo(() => {
    const built = road.keys.map((k) => roadTile(roadPlan, k));
    return {
      surfaces: built.flatMap((t) => t.surfaces),
      markings: built.flatMap((t) => t.markings),
      props: built.flatMap((t) => t.props),
    };
  }, [roadPlan, road.keys]);
  const land = useMemo(() => scenery.keys.flatMap((k) => sceneryTile(landPlan, k)), [landPlan, scenery.keys]);
  const finish = useMemo(() => ({ gantry: gantryBoxes(lanes, courseLength), markings: finishMarkings(lanes, courseLength) }), [lanes, courseLength]);

  useFrame(() => {
    if (shifted.current !== null) shifted.current.position.z = -cruise.shift();
  });

  return (
    <>
      <fog attach="fog" args={[palette["sky-horizon"], FOG_NEAR, FOG_FAR]} />
      <Sky palette={palette} />
      <Ground palette={palette} />
      <Clouds seed={seed} palette={palette} material={materials.scenery} />
      <group ref={shifted}>
        <BoxInstances boxes={tiles.surfaces} palette={palette} material={materials.surface} />
        <BoxInstances boxes={tiles.markings} palette={palette} material={materials.marking} />
        <BoxInstances boxes={tiles.props} palette={palette} material={materials.scenery} />
        <BoxInstances boxes={land} palette={palette} material={materials.scenery} />
      </group>
      <BoxInstances boxes={finish.markings} palette={palette} material={materials.marking} />
      <BoxInstances boxes={finish.gantry} palette={palette} material={materials.scenery} />
    </>
  );
}

// Just the finish gantry and the finish, for a scene without the world.
export function FrogminoStructures({ courseLength, lanes }: { courseLength: number; lanes: number }) {
  const { palette, materials } = useWorldAssets();
  const finish = useMemo(() => ({ gantry: gantryBoxes(lanes, courseLength), markings: finishMarkings(lanes, courseLength) }), [lanes, courseLength]);
  return (
    <>
      <BoxInstances boxes={finish.markings} palette={palette} material={materials.marking} />
      <BoxInstances boxes={finish.gantry} palette={palette} material={materials.scenery} />
    </>
  );
}
