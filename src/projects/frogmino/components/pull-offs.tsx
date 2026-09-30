"use client";

import { useEffect, useMemo } from "react";
import { BoxGeometry, MeshBasicMaterial, MeshLambertMaterial, type Color, type Texture } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { firstFit, pieceCells, pieceSize } from "../logic";
import { BARRIER_DEPTH, pullOffLanes, type PullOff } from "../pull-off";
import { FROG_THICKNESS } from "../run";
import { TUNING } from "../tuning";
import type { Lanes, TetrominoKind } from "../types";

// The pull-offs in the scene's axes: each one's ground beside the road, a
// barrier block in each of its lanes at both ends, a tall marker on its outer
// corner at the near end, to be seen from far down the road, and the piece
// waiting in it. The waiting piece is the frog's colour, see-through, so it
// reads as a piece to take rather than a second frog.

const WAITING_OPACITY = 0.4;
const MARKER_HEIGHT = 3;
const MARKER_POST_WIDTH = 0.15;
const MARKER_SIGN_SIZE = 0.8;

interface PullOffAssets {
  cube: BoxGeometry;
  ground: MeshBasicMaterial;
  barrier: MeshLambertMaterial;
  marker: MeshLambertMaterial;
  waiting: MeshLambertMaterial;
}

function makeAssets(cellMap: Texture, frog: Color): PullOffAssets {
  return {
    cube: new BoxGeometry(1, 1, 1),
    ground: new MeshBasicMaterial({ color: themeColor("--color-frogmino-pull-off-ground") }),
    barrier: new MeshLambertMaterial({ color: themeColor("--color-frogmino-pull-off-barrier"), map: cellMap }),
    marker: new MeshLambertMaterial({ color: themeColor("--color-frogmino-pull-off-marker") }),
    // Drawn without writing depth, so its own cells don't hide each other's
    // faces through the see-through material.
    waiting: new MeshLambertMaterial({
      color: frog,
      map: cellMap,
      transparent: true,
      opacity: WAITING_OPACITY,
      depthWrite: false,
    }),
  };
}

// Where the waiting piece rests: the first rotation that fits the pull-off,
// centred across it.
function waitingCells(kind: TetrominoKind, lanes: Lanes): { x: number; y: number }[] {
  const fit = firstFit(kind, lanes);
  if (fit === null) throw new Error(`A ${kind} doesn't fit its pull-off`);
  const { width } = pieceSize(kind, fit.rotation);
  const col = lanes.first + Math.floor((lanes.last - lanes.first + 1 - width) / 2);
  return pieceCells(kind, fit.rotation).map((c) => ({ x: col + c.col, y: c.row + 0.5 }));
}

function PullOffView({ pullOff, assets }: { pullOff: PullOff; assets: PullOffAssets }) {
  const lanes = pullOffLanes(pullOff, TUNING.corridorCols);
  const laneList = Array.from({ length: pullOff.width }, (_, i) => lanes.first + i);
  const from = pullOff.near - BARRIER_DEPTH;
  const to = pullOff.far + BARRIER_DEPTH;
  const outerX = pullOff.side === "left" ? lanes.first - 0.5 : lanes.last + 0.5;
  const barrierDepths = [pullOff.near - BARRIER_DEPTH / 2, pullOff.far + BARRIER_DEPTH / 2];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(lanes.first + lanes.last) / 2, 0, -(from + to) / 2]} material={assets.ground}>
        <planeGeometry args={[pullOff.width, to - from]} />
      </mesh>
      {barrierDepths.flatMap((depth) =>
        laneList.map((lane) => (
          <mesh
            key={`${String(depth)},${String(lane)}`}
            geometry={assets.cube}
            material={assets.barrier}
            position={[lane, 0.5, -depth]}
            scale={[1, 1, BARRIER_DEPTH]}
          />
        )),
      )}
      <mesh
        geometry={assets.cube}
        material={assets.marker}
        position={[outerX, MARKER_HEIGHT / 2, -from]}
        scale={[MARKER_POST_WIDTH, MARKER_HEIGHT, MARKER_POST_WIDTH]}
      />
      <mesh
        geometry={assets.cube}
        material={assets.marker}
        position={[outerX, MARKER_HEIGHT, -from]}
        rotation={[0, 0, Math.PI / 4]}
        scale={[MARKER_SIGN_SIZE, MARKER_SIGN_SIZE, MARKER_POST_WIDTH]}
      />
      {/* Resting against the far barrier, as deep as the frog. */}
      {waitingCells(pullOff.waiting, lanes).map((cell) => (
        <mesh
          key={`${String(cell.x)},${String(cell.y)}`}
          geometry={assets.cube}
          material={assets.waiting}
          position={[cell.x, cell.y, -(pullOff.far - FROG_THICKNESS / 2)]}
          scale={[1, 1, FROG_THICKNESS]}
        />
      ))}
    </group>
  );
}

export function PullOffs({
  pullOffs,
  cellMap,
  frog,
}: {
  pullOffs: readonly PullOff[];
  cellMap: Texture;
  frog: Color;
}) {
  const assets = useMemo(() => makeAssets(cellMap, frog), [cellMap, frog]);
  useEffect(
    () => () => {
      Object.values(assets).forEach((asset) => {
        asset.dispose();
      });
    },
    [assets],
  );
  return (
    <>
      {pullOffs.map((pullOff) => (
        <PullOffView key={pullOff.near} pullOff={pullOff} assets={assets} />
      ))}
    </>
  );
}
