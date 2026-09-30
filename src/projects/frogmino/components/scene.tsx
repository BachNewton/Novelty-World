"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import {
  BackSide,
  BoxGeometry,
  DataTexture,
  LinearMipmapLinearFilter,
  MathUtils,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  RedFormat,
  RGBAFormat,
  type Color,
  type Group,
  type InstancedMesh,
} from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { cellKey, frogCells, pieceCells, pieceSize } from "../logic";
import { hopHeight, nextWall, type Run } from "../run";
import { useFrogminoStore } from "../store";
import { TUNING } from "../tuning";
import type { Cell, Opening } from "../types";

// World axes: x runs across the corridor (one unit per column), y up (one unit
// per row), and the walls come at the frog from -z. A rule depth d sits at
// z = -d: a wall's cubes lie just beyond its depth and the frog's just short
// of its own, so the two touch when their depths meet.
const { corridorCols, depthStep, wallRows, courseLength, cameraHeight, cameraFollow, cameraLookAhead } = TUNING;
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

// Each cube face gets a darker inset border, so touching cells still read as
// a grid. The texture is a brightness mask the material colour multiplies.
const CELL_TEXTURE_SIZE = 16;
const CELL_BORDER_TEXELS = 1;
const CELL_BORDER_SHADE = 0.4;
// Toon shading's brightness bands, darkest (facing away from the light) first.
const TOON_BANDS = [0.35, 0.65, 1];
// How far the dark outline stands proud of a shape, in units.
const OUTLINE_WIDTH = 0.05;

// The fit outline is drawn just in front of the next wall's face.
const FIT_LINE_WIDTH = 0.1;
const FIT_OUTLINE_LIFT = 0.03;
// The longest perimeter of any tetromino, in cell edges.
const MAX_PERIMETER = 10;

// The hop arc overshoots a sine and is capped at one cell, so the drawn frog
// spends most of its airtime a full cell up, as the rules count it.
const HOP_ARC_OVERSHOOT = 1.3;

interface Palette {
  background: Color;
  road: Color;
  roadLine: Color;
  startZone: Color;
  endZone: Color;
  wall: Color;
  frog: Color;
  pass: Color;
  bonk: Color;
  outline: Color;
  fitOutline: Color;
}

function readPalette(): Palette {
  return {
    background: themeColor("--color-surface-primary"),
    road: themeColor("--color-surface-tertiary"),
    roadLine: themeColor("--color-border-hover"),
    startZone: themeColor("--color-surface-elevated"),
    endZone: themeColor("--color-brand-blue"),
    wall: themeColor("--color-brand-orange"),
    frog: themeColor("--color-brand-green"),
    pass: themeColor("--color-brand-blue"),
    bonk: themeColor("--color-brand-pink"),
    outline: themeColor("--color-surface-primary"),
    fitOutline: themeColor("--color-text-primary"),
  };
}

function cellBorderTexture(): DataTexture {
  const size = CELL_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y) < CELL_BORDER_TEXELS;
      const value = Math.round((edge ? CELL_BORDER_SHADE : 1) * 255);
      data.set([value, value, value, 255], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function toonGradient(): DataTexture {
  const data = new Uint8Array(TOON_BANDS.map((band) => Math.round(band * 255)));
  const texture = new DataTexture(data, TOON_BANDS.length, 1, RedFormat);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function makeAssets(palette: Palette) {
  const cellMap = cellBorderTexture();
  const gradientMap = toonGradient();
  return {
    cellMap,
    gradientMap,
    cube: new BoxGeometry(1, 1, 1),
    // An inverted hull: a slightly larger cube drawn inside out, which shows
    // only as a dark rim around a shape's silhouette.
    hull: new BoxGeometry(1 + 2 * OUTLINE_WIDTH, 1 + 2 * OUTLINE_WIDTH, 1 + 2 * OUTLINE_WIDTH),
    fitEdge: new BoxGeometry(1 + FIT_LINE_WIDTH, FIT_LINE_WIDTH, FIT_LINE_WIDTH),
    wallMaterial: new MeshToonMaterial({ color: palette.wall, map: cellMap, gradientMap }),
    frogMaterial: new MeshToonMaterial({ color: palette.frog, map: cellMap, gradientMap }),
    hullMaterial: new MeshBasicMaterial({ color: palette.outline, side: BackSide }),
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

interface CubeSpot {
  x: number;
  y: number;
  z: number;
}

// Touching cubes drawn as one instanced mesh, with their outline hull as
// another.
function CellBlock({ spots, material, assets }: { spots: readonly CubeSpot[]; material: MeshToonMaterial; assets: Assets }) {
  const cubesRef = useRef<InstancedMesh>(null);
  const hullsRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const placer = new Object3D();
    for (const mesh of [cubesRef.current, hullsRef.current]) {
      if (mesh === null) continue;
      spots.forEach((spot, i) => {
        placer.position.set(spot.x, spot.y, spot.z);
        placer.updateMatrix();
        mesh.setMatrixAt(i, placer.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [spots]);
  return (
    <>
      <instancedMesh ref={cubesRef} args={[assets.cube, material, spots.length]} />
      <instancedMesh ref={hullsRef} args={[assets.hull, assets.hullMaterial, spots.length]} />
    </>
  );
}

function wallSpots(opening: Opening): CubeSpot[] {
  const open = new Set(opening.map(cellKey));
  const spots: CubeSpot[] = [];
  for (let col = 0; col < corridorCols; col++) {
    for (let row = 0; row < wallRows; row++) {
      if (!open.has(cellKey({ col, row }))) spots.push({ x: col, y: row + 0.5, z: -0.5 });
    }
  }
  return spots;
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

function hopLift(run: Run): number {
  const start = run.frog.hopStartedAt;
  if (start === null) return 0;
  const progress = (run.time - start) / run.tuning.hopAirtime;
  if (progress < 0 || progress >= 1) return 0;
  return Math.min(1, HOP_ARC_OVERSHOOT * Math.sin(Math.PI * progress));
}

interface DrawnFrog {
  x: number;
  y: number;
  depth: number;
  angle: number;
  // Quarter turns drawn so far, unwrapped so a turn always eases the short way.
  turns: number;
  rotation: number;
}

function snapped(run: Run): DrawnFrog {
  const target = frogTarget(run);
  const turns = run.frog.rotation;
  return { ...target, angle: -turns * (Math.PI / 2), turns, rotation: run.frog.rotation };
}

// Runs the game each frame: advances the rules, then eases the drawn frog
// toward its rule state and places the walls, all without React re-rendering.
function Game({ palette }: { palette: Palette }) {
  const course = useFrogminoStore((s) => s.course);
  const kind = useFrogminoStore((s) => s.run.frog.kind);

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
    return pieceCells(kind, 0).map((c) => ({ x: c.col - (width - 1) / 2, y: c.row - (height - 1) / 2, z: 0.5 }));
  }, [kind]);
  const wallSpotLists = useMemo(() => course.map((wall) => wallSpots(wall.opening)), [course]);

  const frogRef = useRef<Group>(null);
  const wallRefs = useRef<(Group | null)[]>([]);
  const fitRef = useRef<InstancedMesh>(null);
  const fitShape = useRef("");
  const drawn = useRef<DrawnFrog | null>(null);
  const drawnRunId = useRef(-1);

  useFrame((state, delta) => {
    useFrogminoStore.getState().tick(delta);
    const { run, runId } = useFrogminoStore.getState();

    if (drawn.current === null || drawnRunId.current !== runId) {
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
    d.depth = MathUtils.damp(d.depth, target.depth, lambda, delta);
    // A pushed frog rides the wall's face rather than trailing into it.
    if (run.frog.pinnedTo !== null) d.depth = Math.min(d.depth, target.depth);
    d.angle = MathUtils.damp(d.angle, -d.turns * (Math.PI / 2), lambda, delta);

    const frog = frogRef.current;
    if (frog !== null) {
      frog.position.set(d.x, d.y + hopLift(run), -d.depth);
      frog.rotation.z = d.angle;
    }
    state.camera.position.z = -d.depth + cameraFollow;

    const judgment = run.lastJudgment;
    const flashing = judgment !== null && run.time - judgment.time < run.tuning.flashDuration;
    assets.frogMaterial.color.copy(flashing ? (judgment.passed ? palette.pass : palette.bonk) : palette.frog);

    run.walls.forEach((wall, i) => {
      const group = wallRefs.current[i];
      if (!group) return;
      group.position.z = -wall.depth;
      group.visible = !wall.gone;
    });

    const fit = fitRef.current;
    if (fit === null) return;
    const next = nextWall(run);
    fit.visible = next !== null;
    if (next === null) return;
    fit.position.z = -run.walls[next].depth + FIT_OUTLINE_LIFT;
    const cells = frogCells({ ...run.frog, hop: hopHeight(run, run.time) });
    const shape = cells.map(cellKey).join(";");
    if (shape !== fitShape.current) {
      fitShape.current = shape;
      placeEdges(fit, perimeterEdges(cells));
    }
  });

  return (
    <>
      <group ref={frogRef}>
        <CellBlock spots={frogSpots} material={assets.frogMaterial} assets={assets} />
      </group>
      {wallSpotLists.map((spots, i) => (
        <group
          key={i}
          ref={(group) => {
            wallRefs.current[i] = group;
          }}
        >
          <CellBlock spots={spots} material={assets.wallMaterial} assets={assets} />
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
