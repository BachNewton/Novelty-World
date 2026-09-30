"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import {
  BoxGeometry,
  MathUtils,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  type Color,
  type Group,
  type InstancedMesh,
} from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { cellKey, frogCells, pieceCells, pieceSize } from "../logic";
import {
  FROG_THICKNESS,
  WALL_THICKNESS,
  frogShape,
  hopHeight,
  nextWall,
  type Bonk,
  type Run,
} from "../run";
import { nearPullOff } from "../pull-off";
import { useFrogminoStore } from "../store";
import { TUNING } from "../tuning";
import type { Cell, TetrominoKind } from "../types";
import { PullOffs } from "./pull-offs";
import { borderMask } from "./vehicle-assets";
import { makeVehicleViewAssets, VehicleView } from "./vehicle-view";

// World axes: x runs across the corridor (one unit per column), y up (one unit
// per row), and the walls come at the frog from -z. A rule depth d sits at
// z = -d: a wall's cubes lie just beyond its depth and the frog's just short
// of its own, each as deep as the rules count it, so the two touch when their
// depths meet and overlap exactly when the rules say they do.
const { corridorCols, depthStep, courseLength, cameraHeight, cameraFollow, cameraLookAhead } = TUNING;
const CENTER_X = (corridorCols - 1) / 2;

// The camera looks down at the floor a look-ahead in front of the frog.
const CAMERA_PITCH = -Math.atan2(cameraHeight, cameraFollow + cameraLookAhead);
const INITIAL_CAMERA: [number, number, number] = [CENTER_X, cameraHeight, cameraFollow];
// Vertical field of view on wide screens. Narrow portrait screens widen it so
// the corridor always fits across.
const BASE_FOV = 50;
const MIN_HORIZONTAL_FOV = 55;
const DEGREES = 180 / Math.PI;

// The start zone reaches back under the camera; the end zone is a short pad.
const START_ZONE_LENGTH = cameraFollow + 3;
const END_ZONE_LENGTH = 6;
const ROAD_LINE_COUNT = Math.floor(courseLength / depthStep) + 1;
const ROAD_LINE_THICKNESS = 0.06;

// The fit outline is drawn just in front of the next wall's face.
const FIT_LINE_WIDTH = 0.1;
const FIT_OUTLINE_LIFT = 0.03;
// The longest perimeter of any tetromino, in cell edges.
const MAX_PERIMETER = 10;

// A bonk knocks the drawn frog back along a low arc, squashed flat against
// the wall at first and springing back into shape as it lands.
const BONK_DURATION = 0.3;
const BONK_ARC_HEIGHT = 0.8;
const BONK_SQUASH = 0.45;

// The hop arc overshoots a sine and is capped at one cell, so the drawn frog
// rises quickly to a full cell, as the rules count it, and falls the same way
// once the rules land it.
const HOP_ARC_OVERSHOOT = 1.3;

interface Palette {
  background: Color;
  road: Color;
  roadLine: Color;
  startZone: Color;
  endZone: Color;
  frog: Color;
  bonk: Color;
  fitOutline: Color;
}

function readPalette(): Palette {
  return {
    background: themeColor("--color-surface-primary"),
    road: themeColor("--color-surface-tertiary"),
    roadLine: themeColor("--color-border-hover"),
    startZone: themeColor("--color-surface-elevated"),
    endZone: themeColor("--color-brand-blue"),
    frog: themeColor("--color-brand-green"),
    bonk: themeColor("--color-brand-pink"),
    fitOutline: themeColor("--color-text-primary"),
  };
}

function makeAssets(palette: Palette) {
  // Every cube face gets the darker inset border, so touching cells still read
  // as a grid.
  const cellMap = borderMask("all");
  return {
    cellMap,
    cube: new BoxGeometry(1, 1, 1),
    fitEdge: new BoxGeometry(1 + FIT_LINE_WIDTH, FIT_LINE_WIDTH, FIT_LINE_WIDTH),
    frogMaterial: new MeshLambertMaterial({ color: palette.frog, map: cellMap }),
    fitMaterial: new MeshBasicMaterial({ color: palette.fitOutline }),
  };
}

type Assets = ReturnType<typeof makeAssets>;

function fittedFov(aspect: number): number {
  const halfHorizontal = MIN_HORIZONTAL_FOV / 2 / DEGREES;
  const narrowFov = 2 * Math.atan(Math.tan(halfHorizontal) / aspect) * DEGREES;
  return Math.max(BASE_FOV, narrowFov);
}

function Camera() {
  const aspect = useThree((s) => s.size.width / s.size.height);
  return (
    <PerspectiveCamera
      makeDefault
      fov={fittedFov(aspect)}
      position={INITIAL_CAMERA}
      rotation={[CAMERA_PITCH, 0, 0]}
    />
  );
}

function Strip({ from, to, color }: { from: number; to: number; color: Color }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTER_X, 0, -(from + to) / 2]}>
      <planeGeometry args={[corridorCols, to - from]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function Floor({ palette }: { palette: Palette }) {
  return (
    <>
      <Strip from={-START_ZONE_LENGTH} to={0} color={palette.startZone} />
      <Strip from={0} to={courseLength} color={palette.road} />
      <Strip from={courseLength} to={courseLength + END_ZONE_LENGTH} color={palette.endZone} />
      {Array.from({ length: ROAD_LINE_COUNT }, (_, step) => (
        <mesh key={step} position={[CENTER_X, ROAD_LINE_THICKNESS / 2, -step * depthStep]}>
          <boxGeometry args={[corridorCols, ROAD_LINE_THICKNESS, ROAD_LINE_THICKNESS]} />
          <meshBasicMaterial color={palette.roadLine} />
        </mesh>
      ))}
    </>
  );
}

// The middle of one cube's face on the wall face; its depth is its block's.
interface CubeSpot {
  x: number;
  y: number;
}

// The frog's touching cubes, as one instanced mesh filling `thickness` back
// from its front face toward the start.
function CellBlock({
  spots,
  thickness,
  material,
  assets,
}: {
  spots: readonly CubeSpot[];
  thickness: number;
  material: MeshLambertMaterial;
  assets: Assets;
}) {
  const cubesRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = cubesRef.current;
    if (mesh === null) return;
    const placer = new Object3D();
    placer.scale.set(1, 1, thickness);
    spots.forEach((spot, i) => {
      placer.position.set(spot.x, spot.y, thickness / 2);
      placer.updateMatrix();
      mesh.setMatrixAt(i, placer.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots, thickness]);
  return <instancedMesh ref={cubesRef} args={[assets.cube, material, spots.length]} />;
}

interface Edge {
  x: number;
  y: number;
  vertical: boolean;
}

// The cell edges on the outside of a shape, in wall-face coordinates.
function perimeterEdges(cells: readonly Cell[]): Edge[] {
  const filled = new Set(cells.map(cellKey));
  const empty = (col: number, row: number): boolean => !filled.has(cellKey({ col, row }));
  return cells.flatMap(({ col, row }) => [
    ...(empty(col, row - 1) ? [{ x: col, y: row, vertical: false }] : []),
    ...(empty(col, row + 1) ? [{ x: col, y: row + 1, vertical: false }] : []),
    ...(empty(col - 1, row) ? [{ x: col - 0.5, y: row + 0.5, vertical: true }] : []),
    ...(empty(col + 1, row) ? [{ x: col + 0.5, y: row + 0.5, vertical: true }] : []),
  ]);
}

function placeEdges(mesh: InstancedMesh, edges: readonly Edge[]): void {
  if (edges.length > MAX_PERIMETER) throw new Error(`A perimeter of ${String(edges.length)} edges is too long`);
  const placer = new Object3D();
  edges.forEach((edge, i) => {
    placer.position.set(edge.x, edge.y, 0);
    placer.rotation.z = edge.vertical ? Math.PI / 2 : 0;
    placer.updateMatrix();
    mesh.setMatrixAt(i, placer.matrix);
  });
  mesh.count = edges.length;
  mesh.instanceMatrix.needsUpdate = true;
}

// Where the drawn frog is heading: the middle of its rule placement's box.
function frogTarget(run: Run): { x: number; y: number; depth: number } {
  const { kind, col, rotation, depth } = run.frog;
  const { width, height } = pieceSize(kind, rotation);
  return { x: col + (width - 1) / 2, y: 0.5 + (height - 1) / 2, depth };
}

// The rising half of the hop arc, `seconds` into it.
function hopArc(seconds: number, airtime: number): number {
  const progress = MathUtils.clamp(seconds / airtime, 0, 0.5);
  return Math.min(1, HOP_ARC_OVERSHOOT * Math.sin(Math.PI * progress));
}

// How long the arc takes to reach a full cell.
function hopRiseTime(airtime: number): number {
  return (airtime * Math.asin(1 / HOP_ARC_OVERSHOOT)) / Math.PI;
}

// The drawn frog rises along the arc while the rules have it up, and falls
// back along it once they land it. Each only ever moves the drawn frog one
// way, so it carries on smoothly from wherever it was left.
function hopLift(run: Run, drawnLift: number): number {
  const hop = run.frog.latestHop;
  if (hop === null) return 0;
  const airtime = run.tuning.hopAirtime;
  if (hop.landedAt === null) return Math.max(drawnLift, hopArc(run.time - hop.startedAt, airtime));
  return Math.min(drawnLift, hopArc(hopRiseTime(airtime) - (run.time - hop.landedAt), airtime));
}

// Whether any wall's cubes overlap the drawn frog's.
function overlapsDrawnFrog(run: Run, frogDepth: number): boolean {
  return run.walls.some((wall) => wall.depth < frogDepth && wall.depth + WALL_THICKNESS > frogDepth - FROG_THICKNESS);
}

interface BonkMotion {
  from: number;
  to: number;
  startedAt: number;
}

interface BonkPose {
  depth: number;
  lift: number;
  squash: number;
}

// Where a bonk's knock-back has the drawn frog now; null once it is over, or
// once the frog has jumped away from where the bonk put it.
function bonkPose(motion: BonkMotion | null, run: Run): BonkPose | null {
  if (motion === null || run.frog.depth !== motion.to) return null;
  const progress = (run.time - motion.startedAt) / BONK_DURATION;
  if (progress >= 1) return null;
  return {
    depth: MathUtils.lerp(motion.from, motion.to, 1 - (1 - progress) ** 2),
    lift: BONK_ARC_HEIGHT * Math.sin(Math.PI * progress),
    squash: BONK_SQUASH * (1 - progress) ** 2,
  };
}

interface DrawnFrog {
  // The piece drawn; a swap snaps the drawing to the new piece.
  kind: TetrominoKind;
  x: number;
  y: number;
  depth: number;
  angle: number;
  // Quarter turns drawn so far, unwrapped so a turn always eases the short way.
  turns: number;
  rotation: number;
  lift: number;
  // The latest bonk seen, and the knock-back it is drawing.
  bonk: Bonk | null;
  bonkMotion: BonkMotion | null;
}

function snapped(run: Run): DrawnFrog {
  const target = frogTarget(run);
  const turns = run.frog.rotation;
  return {
    ...target,
    kind: run.frog.kind,
    angle: -turns * (Math.PI / 2),
    turns,
    rotation: run.frog.rotation,
    lift: hopHeight(run.frog),
    bonk: run.lastBonk,
    bonkMotion: null,
  };
}

// Runs the game each frame: advances the rules, then eases the drawn frog
// toward its rule state and places the walls, all without React re-rendering.
function Game({ palette }: { palette: Palette }) {
  const course = useFrogminoStore((s) => s.course);
  const kind = useFrogminoStore((s) => s.run.frog.kind);
  // Changes only when a swap changes a waiting piece.
  const pullOffs = useFrogminoStore((s) => s.run.pullOffs);

  const assets = useMemo(() => makeAssets(palette), [palette]);
  useEffect(
    () => () => {
      Object.values(assets).forEach((asset) => {
        asset.dispose();
      });
    },
    [assets],
  );

  // The piece's spawn cells about the middle of its box, so the drawn frog
  // turns in place.
  const frogSpots = useMemo(() => {
    const { width, height } = pieceSize(kind, 0);
    return pieceCells(kind, 0).map((c) => ({ x: c.col - (width - 1) / 2, y: c.row - (height - 1) / 2 }));
  }, [kind]);
  const vehicleAssets = useMemo(() => makeVehicleViewAssets(assets.cellMap), [assets]);
  useEffect(
    () => () => {
      vehicleAssets.dispose();
    },
    [vehicleAssets],
  );

  const frogRef = useRef<Group>(null);
  const wallRefs = useRef<(Group | null)[]>([]);
  const fitRef = useRef<InstancedMesh>(null);
  const fitShape = useRef("");
  const drawn = useRef<DrawnFrog | null>(null);
  const drawnRunId = useRef(-1);

  useFrame((state, delta) => {
    useFrogminoStore.getState().tick(delta);
    const { run, runId } = useFrogminoStore.getState();

    if (drawn.current === null || drawnRunId.current !== runId || drawn.current.kind !== run.frog.kind) {
      drawn.current = snapped(run);
      drawnRunId.current = runId;
    }
    const d = drawn.current;
    if (run.frog.rotation !== d.rotation) {
      const quarterTurns = (run.frog.rotation - d.rotation + 4) % 4;
      d.turns += quarterTurns === 3 ? -1 : quarterTurns;
      d.rotation = run.frog.rotation;
    }
    // Exponential easing that covers about 95% of the way in the ease duration.
    const lambda = 3 / run.tuning.easeDuration;
    const target = frogTarget(run);
    d.x = MathUtils.damp(d.x, target.x, lambda, delta);
    d.y = MathUtils.damp(d.y, target.y, lambda, delta);
    d.angle = MathUtils.damp(d.angle, -d.turns * (Math.PI / 2), lambda, delta);

    const bonk = run.lastBonk;
    if (bonk !== d.bonk) {
      d.bonk = bonk;
      if (bonk !== null) d.bonkMotion = { from: bonk.depth, to: run.frog.depth, startedAt: bonk.time };
    }
    const pose = bonkPose(d.bonkMotion, run);
    if (pose === null) d.bonkMotion = null;
    d.depth = pose === null ? MathUtils.damp(d.depth, target.depth, lambda, delta) : pose.depth;
    const bonkLift = pose === null ? 0 : pose.lift;
    const squash = pose === null ? 0 : pose.squash;

    // Eased moves could cut through a wall's cubes (a turn swings the piece
    // through cells outside both of its poses), and a move made just before a
    // wall arrives may not have finished easing. So while a wall overlaps the
    // drawn frog, it is drawn exactly as the rules have it, and the rules keep
    // that inside the wall's opening.
    if (overlapsDrawnFrog(run, d.depth)) {
      d.x = target.x;
      d.y = target.y;
      d.angle = -d.turns * (Math.PI / 2);
      d.lift = hopHeight(run.frog);
    } else {
      d.lift = hopLift(run, d.lift);
    }

    const frog = frogRef.current;
    if (frog !== null) {
      frog.position.set(d.x, d.y + d.lift + bonkLift, -d.depth);
      frog.rotation.z = d.angle;
      // Flattened along the course against the wall, bulging a little across.
      frog.scale.set(1 + squash / 2, 1 + squash / 2, 1 - squash);
    }
    state.camera.position.z = -d.depth + cameraFollow;
    // Near a pull-off, the camera pans across to take in the road and the
    // pull-off together, and pans back once the frog has gone by it.
    const pullOff = nearPullOff(run.pullOffs, d.depth - FROG_THICKNESS, d.depth, run.tuning.cameraPullOffReach);
    const pan = pullOff === null ? 0 : ((pullOff.side === "left" ? -1 : 1) * pullOff.width) / 2;
    state.camera.position.x = MathUtils.damp(state.camera.position.x, CENTER_X + pan, 3 / run.tuning.cameraPullOffEase, delta);

    const flashing = bonk !== null && run.time - bonk.time < run.tuning.flashDuration;
    assets.frogMaterial.color.copy(flashing ? palette.bonk : palette.frog);

    run.walls.forEach((wall, i) => {
      const group = wallRefs.current[i];
      if (!group) return;
      group.position.z = -wall.depth;
    });

    const fit = fitRef.current;
    if (fit === null) return;
    const next = nextWall(run);
    fit.visible = next !== null;
    if (next === null) return;
    fit.position.z = -run.walls[next].depth + FIT_OUTLINE_LIFT;
    const cells = frogCells(frogShape(run.frog));
    const shape = cells.map(cellKey).join(";");
    if (shape !== fitShape.current) {
      fitShape.current = shape;
      placeEdges(fit, perimeterEdges(cells));
    }
  });

  return (
    <>
      <group ref={frogRef}>
        <CellBlock
          spots={frogSpots}
          thickness={FROG_THICKNESS}
          material={assets.frogMaterial}
          assets={assets}
        />
      </group>
      <PullOffs pullOffs={pullOffs} cellMap={assets.cellMap} frog={palette.frog} />
      {course.rows.map((row, i) => (
        <group
          key={i}
          ref={(group) => {
            wallRefs.current[i] = group;
          }}
        >
          {row.vehicles.map(({ id, lane }) => (
            <VehicleView key={lane} id={id} lane={lane} depth={0} assets={vehicleAssets} />
          ))}
        </group>
      ))}
      <instancedMesh ref={fitRef} args={[assets.fitEdge, assets.fitMaterial, MAX_PERIMETER]} frustumCulled={false} />
    </>
  );
}

export function FrogminoScene() {
  const palette = useMemo(() => readPalette(), []);

  // Flat: no tone mapping, so the design tokens show as authored.
  return (
    <Canvas flat>
      <color attach="background" args={[palette.background]} />
      <Camera />
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 10, 6]} intensity={1.8} />
      <Floor palette={palette} />
      <Game palette={palette} />
    </Canvas>
  );
}
