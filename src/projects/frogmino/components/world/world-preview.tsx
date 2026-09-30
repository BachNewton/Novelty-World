"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import { MathUtils, MeshLambertMaterial, type Group, type Mesh } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { COURSE_SEED } from "../../course";
import { frogCells } from "../../logic";
import type { Row } from "../../traffic";
import { TUNING } from "../../tuning";
import type { Frog } from "../../types";
import { VEHICLES } from "../../vehicles";
import type { PullOffStretch } from "../../pull-off";
import { GROUND_DROP, pullOffArea } from "../../world/geometry";
import { PREVIEW_ROWS, passingPose } from "../../world/preview-rows";
import { DECK_TOP, OVERPASS_FAR, OVERPASS_NEAR } from "../../world/structures";
import { CAMERA_FAR, CAMERA_NEAR, CAMERA_PITCH, fittedFov } from "../camera-fit";
import { Vehicle } from "../vehicle";
import { borderMask, makeVehicleAssets } from "../vehicle-assets";
import { FrogminoStructures, FrogminoWorld } from "./world";
import { readWorldPalette } from "./world-assets";

// `?world`: the world around the road, seen from the gameplay camera as it
// drives down the road, with rows of traffic coming at a stand-in frog that
// always takes the pose that fits the next row. It is for judging whether
// the world frames the gameplay without distracting from it, so it can be
// switched off to compare against the bare road.

const { corridorCols, courseLength, cameraHeight, cameraFollow, wallSpeed } = TUNING;
const CENTER_X = (corridorCols - 1) / 2;

// Sample pull-offs, until the course's own are passed in.
const SAMPLE_PULL_OFFS: readonly PullOffStretch[] = [
  { side: "left", near: 40, far: 46, width: 3 },
  { side: "right", near: 95, far: 101, width: 3 },
  { side: "left", near: 150, far: 156, width: 3 },
];

const DRIVES = {
  reverse: { label: "◀◀ Back", speed: -6 },
  pause: { label: "❚❚ Pause", speed: 0 },
  forward: { label: "▶ Drive", speed: 3 },
  fast: { label: "▶▶ Fast", speed: 12 },
} as const;
type Drive = keyof typeof DRIVES;

// The frog waits on the overpass's deck a moment, then jumps down to the road.
const FROG_DECK_DEPTH = (OVERPASS_NEAR + OVERPASS_FAR) / 2 + 0.5;
const DECK_WAIT = 2.5;
const DROP_DURATION = 0.5;
const DROP_LANDING = 1.5;
const DROP_ARC = 0.8;
const START_POSE: Frog = { kind: "L", col: 2, rotation: 0, hop: 0 };

// A few rows loop around the frog: they vanish well behind the camera and
// come back far up the road.
const ROW_SPACING = 17;
const ROWS_BEHIND = 30;
const ROWS_FIRST = 40;

interface Motion {
  time: number;
  depth: number;
  y: number;
  // Seconds left on the deck; null once the frog has jumped down.
  deckWait: number | null;
  // How far through the jump down, from 0 to 1; null when not jumping.
  drop: number | null;
}

function startMotion(): Motion {
  return { time: 0, depth: FROG_DECK_DEPTH, y: DECK_TOP, deckWait: DECK_WAIT, drop: null };
}

function rowLength(row: Row): number {
  return Math.max(...row.map((v) => VEHICLES[v.id].length));
}

function rowOffset(index: number, time: number, frogDepth: number): number {
  const span = PREVIEW_ROWS.length * ROW_SPACING;
  const depth = ROWS_FIRST + index * ROW_SPACING - wallSpeed * time;
  return ((((depth - frogDepth + ROWS_BEHIND) % span) + span) % span) - ROWS_BEHIND;
}

function advanceMotion(m: Motion, speed: number, delta: number): void {
  if (speed === 0) return;
  m.time += delta;
  if (m.deckWait !== null) {
    m.deckWait = speed < 0 ? 0 : m.deckWait - delta;
    if (m.deckWait <= 0) {
      m.deckWait = null;
      m.drop = 0;
    }
    return;
  }
  if (m.drop !== null) {
    m.drop = Math.min(1, m.drop + delta / DROP_DURATION);
    const eased = 1 - (1 - m.drop) ** 2;
    m.depth = MathUtils.lerp(FROG_DECK_DEPTH, DROP_LANDING, eased);
    m.y = MathUtils.lerp(DECK_TOP, 0, eased) + DROP_ARC * Math.sin(Math.PI * m.drop);
    if (m.drop === 1) m.drop = null;
    return;
  }
  m.depth += speed * delta;
}

function PreviewCamera() {
  const aspect = useThree((s) => s.size.width / s.size.height);
  return (
    <PerspectiveCamera
      makeDefault
      fov={fittedFov(aspect)}
      near={CAMERA_NEAR}
      far={CAMERA_FAR}
      position={[CENTER_X, DECK_TOP + cameraHeight, -FROG_DECK_DEPTH + cameraFollow]}
      rotation={[CAMERA_PITCH, 0, 0]}
    />
  );
}

function PreviewTraffic({
  drive,
  restarts,
  onDepth,
}: {
  drive: Drive;
  restarts: number;
  onDepth: (depth: number) => void;
}) {
  const rows = useMemo(
    () =>
      PREVIEW_ROWS.map((vehicles) => {
        const pose = passingPose(vehicles);
        if (pose === null) throw new Error("A preview row lets no frog through");
        return { vehicles, pose, length: rowLength(vehicles) };
      }),
    [],
  );
  const assets = useMemo(() => makeVehicleAssets(), []);
  const frogMask = useMemo(() => borderMask("all"), []);
  const frogMaterial = useMemo(
    () => new MeshLambertMaterial({ color: themeColor("--color-brand-green"), map: frogMask }),
    [frogMask],
  );
  useEffect(
    () => () => {
      assets.dispose();
      frogMask.dispose();
      frogMaterial.dispose();
    },
    [assets, frogMask, frogMaterial],
  );

  const motion = useRef(startMotion());
  useEffect(() => {
    motion.current = startMotion();
  }, [restarts]);
  const rowRefs = useRef<(Group | null)[]>([]);
  const cubeRefs = useRef<(Mesh | null)[]>([]);

  useFrame(({ camera }, delta) => {
    const m = motion.current;
    advanceMotion(m, DRIVES[drive].speed, Math.min(delta, TUNING.maxFrameDelta));
    const offsets = rows.map((_, i) => rowOffset(i, m.time, m.depth));
    rows.forEach((_, i) => {
      const group = rowRefs.current[i];
      if (group) group.position.z = -(m.depth + offsets[i]);
    });

    // On the road, the frog takes the pose that fits the next row to reach it.
    let pose = START_POSE;
    if (m.deckWait === null && m.drop === null) {
      const coming = rows
        .map((row, i) => ({ row, offset: offsets[i] }))
        .filter(({ row, offset }) => offset + row.length > -1)
        .sort((a, b) => a.offset - b.offset);
      if (coming.length > 0) pose = coming[0].row.pose;
    }
    frogCells(pose).forEach((cell, i) => {
      cubeRefs.current[i]?.position.set(cell.col, m.y + cell.row + 0.5, -m.depth + 0.5);
    });

    const ground = m.drop === null ? m.y : MathUtils.lerp(DECK_TOP, 0, 1 - (1 - m.drop) ** 2);
    camera.position.set(CENTER_X, ground + cameraHeight, -m.depth + cameraFollow);
    onDepth(m.depth);
  });

  return (
    <>
      {rows.map((row, i) => (
        <group
          key={i}
          ref={(group) => {
            rowRefs.current[i] = group;
          }}
        >
          {row.vehicles.map(({ id, lane }) => (
            <Vehicle key={lane} id={id} lane={lane} depth={0} assets={assets} />
          ))}
        </group>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            cubeRefs.current[i] = mesh;
          }}
          material={frogMaterial}
        >
          <boxGeometry />
        </mesh>
      ))}
    </>
  );
}

// Stand-ins for the pull-offs' own surfaces, which the gameplay draws.
function PullOffStandIns() {
  const color = useMemo(() => readWorldPalette().shoulder, []);
  return (
    <>
      {SAMPLE_PULL_OFFS.map((p) => {
        const area = pullOffArea(p);
        return (
          <mesh
            key={`${p.side}${String(p.near)}`}
            position={[(area.minX + area.maxX) / 2, -GROUND_DROP / 2, -(area.minDepth + area.maxDepth) / 2]}
          >
            <boxGeometry args={[area.maxX - area.minX, GROUND_DROP, area.maxDepth - area.minDepth]} />
            <meshLambertMaterial color={color} />
          </mesh>
        );
      })}
    </>
  );
}

// Without the world: the bare road the game draws today, following the camera.
function BareRoad() {
  const colors = useMemo(
    () => ({ background: themeColor("--color-surface-primary"), road: themeColor("--color-surface-tertiary") }),
    [],
  );
  const roadRef = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    if (roadRef.current !== null) roadRef.current.position.z = camera.position.z - 200;
  });
  return (
    <>
      <color attach="background" args={[colors.background]} />
      <mesh ref={roadRef} rotation={[-Math.PI / 2, 0, 0]} position={[CENTER_X, 0, 0]}>
        <planeGeometry args={[corridorCols, 500]} />
        <meshBasicMaterial color={colors.road} />
      </mesh>
      <FrogminoStructures courseLength={courseLength} />
    </>
  );
}

function PreviewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-bold transition-colors ${
        active
          ? "border-brand-green bg-brand-green text-surface-primary"
          : "border-border-hover bg-surface-secondary/85 text-text-primary hover:border-brand-green"
      }`}
    >
      {children}
    </button>
  );
}

export function WorldPreview() {
  const [world, setWorld] = useState(true);
  const [drive, setDrive] = useState<Drive>("forward");
  const [restarts, setRestarts] = useState(0);
  const readout = useRef<HTMLSpanElement>(null);
  // Written straight to the page each frame, without re-rendering.
  const showDepth = useCallback((depth: number) => {
    const element = readout.current;
    if (element !== null) element.textContent = `depth ${depth.toFixed(0)}`;
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-surface-primary">
      <div className="absolute inset-0">
        <Canvas flat>
          <PreviewCamera />
          <ambientLight intensity={1.5} />
          <directionalLight position={[4, 10, 6]} intensity={1.8} />
          {world ? (
            <>
              <FrogminoWorld courseLength={courseLength} pullOffs={SAMPLE_PULL_OFFS} seed={COURSE_SEED} />
              <PullOffStandIns />
            </>
          ) : (
            <BareRoad />
          )}
          <PreviewTraffic drive={drive} restarts={restarts} onDepth={showDepth} />
        </Canvas>
      </div>
      <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-surface-secondary/80 px-3 py-1.5">
        <h1 className="text-xl font-bold text-brand-green">
          Frogmino <span className="text-sm font-normal text-text-secondary">world preview</span>
        </h1>
        <span ref={readout} data-testid="world-depth" className="font-mono text-xs text-text-secondary" />
      </div>
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-2">
        {(Object.keys(DRIVES) as Drive[]).map((key) => (
          <PreviewButton key={key} active={drive === key} onClick={() => setDrive(key)}>
            {DRIVES[key].label}
          </PreviewButton>
        ))}
        <PreviewButton
          active={false}
          onClick={() => {
            setRestarts((n) => n + 1);
            setDrive("forward");
          }}
        >
          ↺ Restart
        </PreviewButton>
        <PreviewButton active={world} onClick={() => setWorld((on) => !on)}>
          {world ? "World: on" : "World: off"}
        </PreviewButton>
      </div>
    </div>
  );
}
