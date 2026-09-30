"use client";

import { useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import type { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { cellKey, frogCells, rectOpening } from "../logic";
import type { Cell, Frog, Opening } from "../types";

// World axes: x runs across the corridor (one unit per column), y up (one unit
// per row), and the walls come at the frog from -z.
const CORRIDOR_COLS = 7;
const WALL_ROWS = 4;
const CORRIDOR_LENGTH = 30;
const WALL_DEPTH = -12;
// A gap between cubes so a wall or a frog reads as a stack of blocks.
const CUBE_SIZE = 0.94;

const CENTER_X = (CORRIDOR_COLS - 1) / 2;
const CAMERA_POSITION: [number, number, number] = [CENTER_X, 4, 7];
const LOOK_AT_HEIGHT = 1;
const CAMERA_PITCH = -Math.atan2(
  CAMERA_POSITION[1] - LOOK_AT_HEIGHT,
  CAMERA_POSITION[2] - WALL_DEPTH,
);
// Vertical field of view on wide screens. Narrow portrait screens widen it so
// the corridor always fits across.
const BASE_FOV = 50;
const MIN_HORIZONTAL_FOV = 55;

// The floor starts just behind the camera and runs past the wall.
const FLOOR_CENTER_Z = CAMERA_POSITION[2] + 1 - CORRIDOR_LENGTH / 2;

const DEGREES = 180 / Math.PI;

const FROG: Frog = { kind: "T", col: 2, rotation: 0, hop: 0 };

const OPENING = rectOpening([1, 5], [0, 2]);

function wallCells(opening: Opening): Cell[] {
  const open = new Set(opening.map(cellKey));
  const cells: Cell[] = [];
  for (let col = 0; col < CORRIDOR_COLS; col++) {
    for (let row = 0; row < WALL_ROWS; row++) {
      if (!open.has(cellKey({ col, row }))) cells.push({ col, row });
    }
  }
  return cells;
}

interface Palette {
  background: Color;
  floor: Color;
  wall: Color;
  frog: Color;
}

function readPalette(): Palette {
  return {
    background: themeColor("--color-surface-primary"),
    floor: themeColor("--color-border-hover"),
    wall: themeColor("--color-brand-orange"),
    frog: themeColor("--color-brand-green"),
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
      position={CAMERA_POSITION}
      rotation={[CAMERA_PITCH, 0, 0]}
    />
  );
}

function Cubes({ cells, depth, color }: { cells: readonly Cell[]; depth: number; color: Color }) {
  return cells.map((cell) => (
    <mesh key={cellKey(cell)} position={[cell.col, cell.row + 0.5, depth]}>
      <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
      <meshStandardMaterial color={color} />
    </mesh>
  ));
}

export function FrogminoScene() {
  const palette = useMemo(() => readPalette(), []);
  const wall = useMemo(() => wallCells(OPENING), []);
  const frog = useMemo(() => frogCells(FROG), []);

  return (
    <Canvas>
      <color attach="background" args={[palette.background]} />
      <Camera />
      <ambientLight intensity={0.6} />
      <directionalLight position={[CENTER_X + 4, 10, 8]} intensity={1.8} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[CENTER_X, 0, FLOOR_CENTER_Z]}
      >
        <planeGeometry args={[CORRIDOR_COLS, CORRIDOR_LENGTH]} />
        <meshStandardMaterial color={palette.floor} />
      </mesh>
      <Cubes cells={wall} depth={WALL_DEPTH} color={palette.wall} />
      <Cubes cells={frog} depth={0} color={palette.frog} />
    </Canvas>
  );
}
