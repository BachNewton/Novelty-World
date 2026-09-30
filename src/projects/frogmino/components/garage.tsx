"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, View } from "@react-three/drei";
import type { Color, Group, PerspectiveCamera as PerspectiveCameraImpl } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { GROUND_CLEARANCE } from "../clearance";
import { pieceSize } from "../logic";
import { VEHICLE_IDS, vehiclePiece, type VehicleId } from "../fleet";
import { VEHICLES } from "../vehicles";
import { Vehicle } from "./vehicle";
import { makeVehicleAssets, type VehicleAssets } from "./vehicle-assets";

// The garage shows the whole fleet, each vehicle twice: head-on through an
// orthographic camera, which is exactly its silhouette on the lane × row
// grid, and turning slowly on a turntable in three-quarter view. One canvas
// sits behind the page and draws every view into its own card, so the page
// needs one WebGL context however many vehicles there are.

// The head-on grid is as wide and tall as the widest and tallest piece.
const GRID = 4;
const HEAD_ON_MARGIN = 0.35;
const GRID_LINE = 0.025;
const TURNTABLE_SPEED = 0.45;
const TURNTABLE_FOV = 35;
const TURNTABLE_VIEW = [0.95, 0.6, 1.25] as const;
const PLATE_MARGIN = 0.25;
const PLATE_THICKNESS = 0.06;

interface Palette {
  background: Color;
  grid: Color;
  road: Color;
  plate: Color;
}

function readPalette(): Palette {
  return {
    background: themeColor("--color-surface-tertiary"),
    grid: themeColor("--color-border-hover"),
    road: themeColor("--color-text-muted"),
    plate: themeColor("--color-surface-elevated"),
  };
}

// The game scene's lights, so the fleet looks here as it will on the road.
function Lights() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 10, 6]} intensity={1.8} />
    </>
  );
}

// How much room a vehicle takes, standing on its wheels: its height counts
// the ground clearance under its cells.
function footprint(id: VehicleId): { width: number; height: number; length: number } {
  const { kind, rotation } = vehiclePiece(id);
  const { width, height } = pieceSize(kind, rotation);
  return { width, height: height + GROUND_CLEARANCE, length: VEHICLES[id].length };
}

// The lane × row grid behind a head-on vehicle, in the scene's axes: lanes
// centred on whole x, rows from the ground clearance up, and the stronger
// road line at y = 0 beneath them, where the wheels stand.
function CellGrid({ z, palette }: { z: number; palette: Palette }) {
  const lines = Array.from({ length: GRID + 1 }, (_, k) => k);
  return (
    <group position={[0, GROUND_CLEARANCE, z]}>
      {lines.map((k) => (
        <mesh key={`lane${String(k)}`} position={[k - 0.5, GRID / 2, 0]}>
          <boxGeometry args={[GRID_LINE, GRID, GRID_LINE]} />
          <meshBasicMaterial color={palette.grid} />
        </mesh>
      ))}
      {lines.map((k) => (
        <mesh key={`row${String(k)}`} position={[(GRID - 1) / 2, k, 0]}>
          <boxGeometry args={[GRID, GRID_LINE, GRID_LINE]} />
          <meshBasicMaterial color={palette.grid} />
        </mesh>
      ))}
      <mesh position={[(GRID - 1) / 2, -GROUND_CLEARANCE, 0]}>
        <boxGeometry args={[GRID, GRID_LINE * 3, GRID_LINE]} />
        <meshBasicMaterial color={palette.road} />
      </mesh>
    </group>
  );
}

function HeadOn({ id, assets, palette }: { id: VehicleId; assets: VehicleAssets; palette: Palette }) {
  const size = useThree((s) => s.size);
  const { width, length } = footprint(id);
  const lane = Math.floor((GRID - width) / 2);
  const tall = GRID + GROUND_CLEARANCE;
  const zoom = Math.min(size.width, size.height) / (tall + 2 * HEAD_ON_MARGIN);
  return (
    <>
      <color attach="background" args={[palette.background]} />
      <OrthographicCamera makeDefault position={[(GRID - 1) / 2, tall / 2, 10]} zoom={zoom} near={0.1} far={40} />
      <Lights />
      <CellGrid z={-length - 0.1} palette={palette} />
      <Vehicle id={id} lane={lane} depth={0} assets={assets} />
    </>
  );
}

// The lane-grid plate a vehicle stands on in the turntable view.
function Plate({ width, length, palette }: { width: number; length: number; palette: Palette }) {
  const lanes = Array.from({ length: width + 1 }, (_, k) => k);
  return (
    <group position={[(width - 1) / 2, 0, -length / 2]}>
      <mesh position={[0, -PLATE_THICKNESS / 2, 0]}>
        <boxGeometry args={[width + 2 * PLATE_MARGIN, PLATE_THICKNESS, length + 2 * PLATE_MARGIN]} />
        <meshLambertMaterial color={palette.plate} />
      </mesh>
      {lanes.map((k) => (
        <mesh key={k} position={[k - width / 2, 0.002, 0]}>
          <boxGeometry args={[GRID_LINE, 0.004, length + 2 * PLATE_MARGIN]} />
          <meshBasicMaterial color={palette.grid} />
        </mesh>
      ))}
    </group>
  );
}

function Turntable({ id, assets, palette }: { id: VehicleId; assets: VehicleAssets; palette: Palette }) {
  const { width, height, length } = footprint(id);
  const spin = useRef<Group>(null);
  const camera = useRef<PerspectiveCameraImpl>(null);

  // Far enough back that the vehicle's bounding sphere always fits, however
  // it has turned.
  const radius = Math.hypot(width + 2 * PLATE_MARGIN, height, length + 2 * PLATE_MARGIN) / 2;
  const distance = radius / Math.sin((TURNTABLE_FOV / 2) * (Math.PI / 180));
  const along = Math.hypot(...TURNTABLE_VIEW);
  const position = TURNTABLE_VIEW.map((axis, i) => (i === 1 ? height / 2 : 0) + (axis / along) * distance) as [
    number,
    number,
    number,
  ];

  useLayoutEffect(() => {
    camera.current?.lookAt(0, height / 2, 0);
  }, [height, distance]);
  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += TURNTABLE_SPEED * delta;
  });

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <PerspectiveCamera ref={camera} makeDefault position={position} fov={TURNTABLE_FOV} near={0.1} far={60} />
      <Lights />
      <group ref={spin}>
        <group position={[-(width - 1) / 2, 0, length / 2]}>
          <Plate width={width} length={length} palette={palette} />
          <Vehicle id={id} lane={0} depth={0} assets={assets} />
        </group>
      </group>
    </>
  );
}

function VehicleCard({ id, assets, palette }: { id: VehicleId; assets: VehicleAssets; palette: Palette }) {
  const { name, archetype, blurb } = VEHICLES[id];
  return (
    <li className="rounded-xl border border-border-default bg-surface-secondary p-3">
      <div className="grid grid-cols-2 gap-2">
        <figure>
          <View className="aspect-square w-full">
            <HeadOn id={id} assets={assets} palette={palette} />
          </View>
          <figcaption className="mt-1 text-center text-xs text-text-muted">head-on</figcaption>
        </figure>
        <figure>
          <View className="aspect-square w-full">
            <Turntable id={id} assets={assets} palette={palette} />
          </View>
          <figcaption className="mt-1 text-center text-xs text-text-muted">turntable</figcaption>
        </figure>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-text-primary">{name}</h2>
        <span className="font-mono text-sm text-brand-orange">{id}</span>
      </div>
      <p className="text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">{archetype}.</span> {blurb}
      </p>
    </li>
  );
}

export function Garage() {
  const palette = useMemo(() => readPalette(), []);
  const assets = useMemo(() => makeVehicleAssets(), []);
  useEffect(
    () => () => {
      assets.dispose();
    },
    [assets],
  );

  return (
    <div className="min-h-dvh bg-surface-primary px-4 py-6">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-green">Frogmino garage</h1>
        <p className="mt-1 text-sm text-text-secondary">
          The fleet: one vehicle for each of the 19 fixed tetrominoes. Head-on is what the frog sees, on the lane ×
          row grid; the turntable shows the rest of it.
        </p>
        <a href="?" className="mt-2 inline-block text-sm font-semibold text-brand-blue underline">
          Back to the road
        </a>
      </header>
      <ul className="mx-auto mt-4 grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {VEHICLE_IDS.map((id) => (
          <VehicleCard key={id} id={id} assets={assets} palette={palette} />
        ))}
      </ul>
      {/* Flat: no tone mapping, so the design tokens show as authored. */}
      <Canvas flat style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <View.Port />
      </Canvas>
    </div>
  );
}
