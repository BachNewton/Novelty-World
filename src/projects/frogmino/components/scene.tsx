"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { BoxGeometry, MathUtils, MeshStandardMaterial, type Color, type Group } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { WALL_COUNT } from "../course";
import { cellKey, pieceCells, pieceSize } from "../logic";
import type { Run } from "../run";
import { useFrogminoStore } from "../store";
import { TUNING } from "../tuning";
import type { Cell, Opening } from "../types";

// World axes: x runs across the corridor (one unit per column), y up (one unit
// per row), and the walls come at the frog from -z. A rule depth d sits at
// z = -d.
const { corridorCols, corridorSteps, depthStep, wallRows, wallSpacing, startStep } = TUNING;
// A gap between cubes so a wall or a frog reads as a stack of blocks.
const CUBE_SIZE = 0.94;
const CENTER_X = (corridorCols - 1) / 2;

const CAMERA_HEIGHT = 4;
const CAMERA_BEHIND = 7;
const LOOK_AHEAD = 19;
const LOOK_AT_HEIGHT = 1;
const CAMERA_PITCH = -Math.atan2(CAMERA_HEIGHT - LOOK_AT_HEIGHT, LOOK_AHEAD);
const INITIAL_CAMERA: [number, number, number] = [CENTER_X, CAMERA_HEIGHT, -startStep * depthStep + CAMERA_BEHIND];
// Vertical field of view on wide screens. Narrow portrait screens widen it so
// the corridor always fits across.
const BASE_FOV = 50;
const MIN_HORIZONTAL_FOV = 55;
const DEGREES = 180 / Math.PI;

// The floor runs from behind the camera at the corridor start to past where
// the last wall starts.
const FLOOR_NEAR = CAMERA_BEHIND + 1;
const FLOOR_FAR = corridorSteps * depthStep + WALL_COUNT * wallSpacing;
const FLOOR_LINE_COUNT = Math.floor(FLOOR_FAR / depthStep) + 1;
const FLOOR_LINE_THICKNESS = 0.06;

const RESOLVED_WALL_OPACITY = 0.3;
// The hop arc overshoots a sine and is capped at one cell, so the drawn frog
// spends most of its airtime a full cell up, as the rules count it.
const HOP_ARC_OVERSHOOT = 1.3;

interface Palette {
  background: Color;
  floor: Color;
  floorLine: Color;
  corridorLine: Color;
  wall: Color;
  frog: Color;
  pass: Color;
  bonk: Color;
}

function readPalette(): Palette {
  return {
    background: themeColor("--color-surface-primary"),
    floor: themeColor("--color-surface-tertiary"),
    floorLine: themeColor("--color-border-hover"),
    corridorLine: themeColor("--color-text-muted"),
    wall: themeColor("--color-brand-orange"),
    frog: themeColor("--color-brand-green"),
    pass: themeColor("--color-brand-blue"),
    bonk: themeColor("--color-brand-pink"),
  };
}

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

function wallCells(opening: Opening): Cell[] {
  const open = new Set(opening.map(cellKey));
  const cells: Cell[] = [];
  for (let col = 0; col < corridorCols; col++) {
    for (let row = 0; row < wallRows; row++) {
      if (!open.has(cellKey({ col, row }))) cells.push({ col, row });
    }
  }
  return cells;
}

function Floor({ palette }: { palette: Palette }) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CENTER_X, 0, (FLOOR_NEAR - FLOOR_FAR) / 2]}>
        <planeGeometry args={[corridorCols, FLOOR_NEAR + FLOOR_FAR]} />
        <meshStandardMaterial color={palette.floor} />
      </mesh>
      {Array.from({ length: FLOOR_LINE_COUNT }, (_, step) => (
        <mesh key={step} position={[CENTER_X, FLOOR_LINE_THICKNESS / 2, -step * depthStep]}>
          <boxGeometry args={[corridorCols, FLOOR_LINE_THICKNESS, FLOOR_LINE_THICKNESS]} />
          <meshBasicMaterial color={step < corridorSteps ? palette.corridorLine : palette.floorLine} />
        </mesh>
      ))}
    </>
  );
}

// Where the drawn frog is heading: the middle of its rule placement's box.
function frogTarget(run: Run): { x: number; y: number; z: number } {
  const { kind, col, rotation, step } = run.frog;
  const { width, height } = pieceSize(kind, rotation);
  return { x: col + (width - 1) / 2, y: 0.5 + (height - 1) / 2, z: -step * depthStep };
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
  z: number;
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

  const geometry = useMemo(() => new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE), []);
  const frogMaterial = useMemo(() => new MeshStandardMaterial({ color: palette.frog }), [palette]);
  const wallMaterials = useMemo(
    () => course.map(() => new MeshStandardMaterial({ color: palette.wall, transparent: true })),
    [course, palette],
  );
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => () => { frogMaterial.dispose(); }, [frogMaterial]);
  useEffect(() => () => { wallMaterials.forEach((m) => { m.dispose(); }); }, [wallMaterials]);

  // The piece's spawn cells about the middle of its box, so the drawn frog
  // turns in place.
  const frogCubes = useMemo(() => {
    const { width, height } = pieceSize(kind, 0);
    return pieceCells(kind, 0).map((c) => ({ x: c.col - (width - 1) / 2, y: c.row - (height - 1) / 2 }));
  }, [kind]);
  const wallCubes = useMemo(() => course.map(wallCells), [course]);

  const frogRef = useRef<Group>(null);
  const wallRefs = useRef<(Group | null)[]>([]);
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
    d.z = MathUtils.damp(d.z, target.z, lambda, delta);
    d.angle = MathUtils.damp(d.angle, -d.turns * (Math.PI / 2), lambda, delta);

    const frog = frogRef.current;
    if (frog !== null) {
      frog.position.set(d.x, d.y + hopLift(run), d.z);
      frog.rotation.z = d.angle;
    }
    state.camera.position.z = d.z + CAMERA_BEHIND;

    const judgment = run.lastJudgment;
    const flashing = judgment !== null && run.time - judgment.time < run.tuning.flashDuration;
    frogMaterial.color.copy(flashing ? (judgment.passed ? palette.pass : palette.bonk) : palette.frog);

    run.walls.forEach((wall, i) => {
      const group = wallRefs.current[i];
      if (group) group.position.z = -wall.depth;
      const material = wallMaterials[i];
      const pending = wall.result === "pending";
      material.color.copy(pending ? palette.wall : wall.result === "passed" ? palette.pass : palette.bonk);
      material.opacity = pending ? 1 : RESOLVED_WALL_OPACITY;
      material.depthWrite = pending;
    });
  });

  return (
    <>
      <group ref={frogRef}>
        {frogCubes.map((c) => (
          <mesh key={`${String(c.x)},${String(c.y)}`} position={[c.x, c.y, 0]} geometry={geometry} material={frogMaterial} />
        ))}
      </group>
      {wallCubes.map((cells, i) => (
        <group
          key={i}
          ref={(group) => {
            wallRefs.current[i] = group;
          }}
        >
          {cells.map((cell) => (
            <mesh
              key={cellKey(cell)}
              position={[cell.col, cell.row + 0.5, 0]}
              geometry={geometry}
              material={wallMaterials[i]}
            />
          ))}
        </group>
      ))}
    </>
  );
}

export function FrogminoScene() {
  const palette = useMemo(() => readPalette(), []);

  return (
    <Canvas>
      <color attach="background" args={[palette.background]} />
      <Camera />
      <ambientLight intensity={0.6} />
      <directionalLight position={[CENTER_X + 4, 10, 8]} intensity={1.8} />
      <Floor palette={palette} />
      <Game palette={palette} />
    </Canvas>
  );
}
