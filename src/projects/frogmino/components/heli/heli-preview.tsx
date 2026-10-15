"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import type { Group, PerspectiveCamera as PerspectiveCameraImpl } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { COURSE_SEED } from "../../course";
import { FROG_VARIANTS } from "../../frog/look";
import {
  BOB,
  HELI_DECK_TOP,
  aboardFrogDepth,
  bob,
  cruiseDepth,
  frogLeap,
  heliPose,
  landed,
  rowAhead,
} from "../../heli/flight";
import type { Row } from "../../traffic";
import { TUNING } from "../../tuning";
import type { Frog } from "../../types";
import { VEHICLES } from "../../vehicles";
import { PREVIEW_PIECES, PREVIEW_ROWS, passingPoses, startPoses } from "../../world/preview-rows";
import { CAMERA_FAR, CAMERA_NEAR, cameraEye, cameraPitch, fittedFov } from "../camera-fit";
import { makeFrogAssets, type FrogAssets } from "../frog/frog-assets";
import { FrogBody, type FrogHandle } from "../frog/frog-body";
import { Vehicle } from "../vehicle";
import { makeVehicleAssets } from "../vehicle-assets";
import { FrogminoWorld } from "../world/world";
import { PreviewButton } from "../world/world-preview";
import { HeliBody } from "./heli-body";

// `?heli`: an art prototype of starting a course from a helicopter instead of
// the overpass, for the owner to judge. Nothing in the game uses it. The
// co-op pair ride the Lily Lifter down a 10-lane road with the traffic, seen
// from the gameplay camera, and jump out onto the road along the game's own
// drop, the camera following them as it does today; or the helicopter turns
// on a turntable.

const LANES = 10;
const MIDDLE = (LANES - 1) / 2;
const KINDS = PREVIEW_PIECES.coop;
// Far behind the course's start, so neither the overpass nor the finish
// gantry is anywhere near: the helicopter is instead of them.
const START_DEPTH = -1000;

const SPEEDS = {
  play: { label: "▶ Play", rate: 1 },
  slow: { label: "▶ ¼ speed", rate: 0.25 },
  pause: { label: "❚❚ Pause", rate: 0 },
} as const;
type Speed = keyof typeof SPEEDS;

type Mode = "flight" | "turntable";
type Phase = "aboard" | "leaping" | "landed";
const MODES: Record<Mode, string> = { flight: "Gameplay camera", turntable: "Turntable" };

interface Motion {
  time: number;
  jumpedAt: number | null;
  landed: boolean;
}

function rowLength(row: Row): number {
  return Math.max(...row.map((v) => VEHICLES[v.id].length));
}

function posesKey(frogs: readonly Frog[]): string {
  return frogs.map((f) => `${f.kind}${String(f.col)}${String(f.rotation)}${String(f.hop)}`).join("|");
}

// The pair, each in its own lanes, a cell up when its pose hops.
function Frogs({ poses, assets, refs }: { poses: readonly Frog[]; assets: FrogAssets; refs: React.RefObject<(FrogHandle | null)[]> }) {
  return poses.map((frog, i) => (
    <group key={i} position={[frog.col - 0.5, frog.hop, 0]}>
      <FrogBody
        ref={(handle) => {
          refs.current[i] = handle;
        }}
        kind={frog.kind}
        rotation={frog.rotation}
        variant={FROG_VARIANTS[i]}
        seed={i}
        assets={assets}
      />
    </group>
  ));
}

function useFrogAssets(): FrogAssets {
  const assets = useMemo(() => makeFrogAssets(), []);
  useEffect(
    () => () => {
      assets.dispose();
    },
    [assets],
  );
  return assets;
}

function GameplayCamera() {
  const aspect = useThree((s) => s.size.width / s.size.height);
  const eye = cameraEye(TUNING, aboardFrogDepth(START_DEPTH), HELI_DECK_TOP);
  return (
    <PerspectiveCamera
      makeDefault
      fov={fittedFov(aspect, LANES)}
      near={CAMERA_NEAR}
      far={CAMERA_FAR}
      position={[MIDDLE, eye.y, eye.z]}
      rotation={[cameraPitch(TUNING), 0, 0]}
    />
  );
}

// The flight, from the start: mounted afresh for each restart.
function Flight({ jump, speed, onFrame }: { jump: boolean; speed: Speed; onFrame: (phase: Phase, sinceJump: number | null) => void }) {
  const rows = useMemo(() => {
    const designed = PREVIEW_ROWS.coop[LANES].map((vehicles) => {
      const poses = passingPoses(vehicles, LANES, KINDS);
      if (poses === null) throw new Error("A preview row doesn't let its frogs through");
      return { vehicles, poses, length: rowLength(vehicles) };
    });
    // Twice round, so the rows go round out of sight.
    return [...designed, ...designed];
  }, []);
  const start = useMemo(() => startPoses(LANES, KINDS), []);
  const vehicleAssets = useMemo(() => makeVehicleAssets(), []);
  const frogAssets = useFrogAssets();
  useEffect(
    () => () => {
      vehicleAssets.dispose();
    },
    [vehicleAssets],
  );

  const [poses, setPoses] = useState(start);
  const shownPoses = useRef(posesKey(start));
  const motion = useRef<Motion>({ time: 0, jumpedAt: null, landed: false });
  const rowRefs = useRef<(Group | null)[]>([]);
  const heliRef = useRef<Group>(null);
  const heliTilt = useRef<Group>(null);
  const frogsRef = useRef<Group>(null);
  const frogHandles = useRef<(FrogHandle | null)[]>([]);

  useFrame(({ camera }, delta) => {
    const m = motion.current;
    m.time += Math.min(delta, TUNING.maxFrameDelta) * SPEEDS[speed].rate;
    if (jump && m.jumpedAt === null) {
      m.jumpedAt = m.time;
      frogHandles.current.forEach((frog) => frog?.play("hop"));
    }

    const heli = heliPose(START_DEPTH, MIDDLE, m.time, m.jumpedAt);
    heliRef.current?.position.set(heli.x, heli.y, -heli.depth);
    heliRef.current?.rotation.set(0, heli.yaw, 0);
    heliTilt.current?.rotation.set(heli.pitch, 0, heli.roll);

    // The frogs ride the deck, then leap along the game's drop.
    let frogDepth: number;
    let frogY: number;
    let level: number;
    let phase: Phase;
    if (m.jumpedAt === null) {
      frogDepth = aboardFrogDepth(heli.depth);
      frogY = heli.y;
      level = HELI_DECK_TOP;
      phase = "aboard";
    } else {
      const since = m.time - m.jumpedAt;
      const fromLevel = HELI_DECK_TOP + bob(m.jumpedAt);
      const leap = frogLeap(aboardFrogDepth(cruiseDepth(START_DEPTH, m.jumpedAt)), fromLevel, since);
      frogDepth = leap.depth;
      frogY = leap.height;
      // The camera rides the drop's path from the deck's resting height, so the
      // bob the jump happened on doesn't jolt it.
      level = leap.level - bob(m.jumpedAt) * (1 - Math.min(1, since / TUNING.dropDuration));
      phase = landed(since) ? "landed" : "leaping";
      if (landed(since) && !m.landed) {
        m.landed = true;
        frogHandles.current.forEach((frog) => frog?.play("land"));
      }
    }
    frogsRef.current?.position.set(0, frogY, -frogDepth);

    const ahead = rows.map((_, i) => rowAhead(i, rows.length, m.time, START_DEPTH, frogDepth));
    rows.forEach((_, i) => {
      const group = rowRefs.current[i];
      if (group) group.position.z = -(frogDepth + ahead[i]);
    });
    // On the road, the frogs take the poses that fit the next row to reach them.
    let next = start;
    if (m.landed) {
      const coming = rows
        .map((row, i) => ({ row, ahead: ahead[i] }))
        .filter(({ row, ahead }) => ahead + row.length > -1)
        .sort((a, b) => a.ahead - b.ahead);
      if (coming.length > 0) next = coming[0].row.poses;
    }
    const key = posesKey(next);
    if (key !== shownPoses.current) {
      shownPoses.current = key;
      setPoses(next);
    }

    const eye = cameraEye(TUNING, frogDepth, level);
    camera.position.set(MIDDLE, eye.y, eye.z);
    onFrame(phase, m.jumpedAt === null ? null : m.time - m.jumpedAt);
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
            <Vehicle key={lane} id={id} lane={lane} depth={0} assets={vehicleAssets} rumbleSeed={`${String(i)}:${String(lane)}`} />
          ))}
        </group>
      ))}
      <group ref={heliRef}>
        <group ref={heliTilt}>
          <group position={[-MIDDLE, 0, 0]}>
            <HeliBody lanes={LANES} />
          </group>
        </group>
      </group>
      <group ref={frogsRef}>
        <Frogs poses={poses} assets={frogAssets} refs={frogHandles} />
      </group>
    </>
  );
}

// The turntable: the helicopter alone with its two passengers, turning slowly
// in three-quarter view, bobbing as it hovers.
const TURNTABLE_FOV = 35;
const TURNTABLE_SPEED = 0.35;
// The whole craft, rotors and tails included, fits in a sphere this big
// about the deck's middle.
const TURNTABLE_RADIUS = 10.5;
const TURNTABLE_VIEW = [0, 0.45, 1] as const;
const DEGREES = 180 / Math.PI;

function Turntable() {
  const background = useMemo(() => themeColor("--color-surface-tertiary"), []);
  const frogAssets = useFrogAssets();
  const frogHandles = useRef<(FrogHandle | null)[]>([]);
  const poses = useMemo(() => startPoses(LANES, KINDS), []);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const camera = useRef<PerspectiveCameraImpl>(null);
  const spin = useRef<Group>(null);
  const hover = useRef<Group>(null);

  const horizontalFov = 2 * Math.atan(Math.tan(TURNTABLE_FOV / 2 / DEGREES) * aspect) * DEGREES;
  const distance = TURNTABLE_RADIUS / Math.sin(Math.min(TURNTABLE_FOV, horizontalFov) / 2 / DEGREES);
  const along = Math.hypot(...TURNTABLE_VIEW);
  const position = TURNTABLE_VIEW.map((axis) => (axis / along) * distance) as [number, number, number];

  useEffect(() => {
    camera.current?.lookAt(0, 0, 0);
  });
  useFrame(({ clock }, delta) => {
    if (spin.current) spin.current.rotation.y += TURNTABLE_SPEED * delta;
    if (hover.current) hover.current.position.y = bob(clock.elapsedTime) - BOB;
  });

  return (
    <>
      <color attach="background" args={[background]} />
      <PerspectiveCamera ref={camera} makeDefault position={position} fov={TURNTABLE_FOV} near={CAMERA_NEAR} far={CAMERA_FAR} />
      <group ref={spin}>
        <group ref={hover} position={[-MIDDLE, 0, 1.5]}>
          <HeliBody lanes={LANES} />
          <group position={[0, 0, -aboardFrogDepth(0)]}>
            <Frogs poses={poses} assets={frogAssets} refs={frogHandles} />
          </group>
        </group>
      </group>
    </>
  );
}

export function HeliPreview() {
  const [mode, setMode] = useState<Mode>("flight");
  const [speed, setSpeed] = useState<Speed>("play");
  const [jump, setJump] = useState(false);
  const [restarts, setRestarts] = useState(0);
  const readout = useRef<HTMLSpanElement>(null);
  // Written straight to the page each frame, without re-rendering.
  const showFrame = useCallback((phase: Phase, sinceJump: number | null) => {
    const element = readout.current;
    if (element === null) return;
    element.textContent = sinceJump === null ? phase : `${phase} ${sinceJump.toFixed(2)}s`;
    element.dataset.phase = phase;
    element.dataset.since = sinceJump === null ? "" : String(sinceJump);
  }, []);
  const restart = () => {
    setRestarts((n) => n + 1);
    setJump(false);
    setSpeed("play");
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-surface-primary">
      <div className="absolute inset-0">
        <Canvas flat>
          <ambientLight intensity={1.5} />
          <directionalLight position={[4, 10, 6]} intensity={1.8} />
          {mode === "flight" ? (
            <>
              <GameplayCamera />
              <FrogminoWorld courseLength={TUNING.courseLength} seed={COURSE_SEED} lanes={LANES} />
              <Flight key={restarts} jump={jump} speed={speed} onFrame={showFrame} />
            </>
          ) : (
            <Turntable />
          )}
        </Canvas>
      </div>
      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-col items-start gap-2">
        <div className="rounded-lg bg-surface-secondary/80 px-3 py-1.5">
          <h1 className="text-xl font-bold text-brand-green">
            Frogmino <span className="text-sm font-normal text-text-secondary">helicopter preview</span>
          </h1>
          {mode === "flight" && (
            <span ref={readout} data-testid="heli-phase" className="block font-mono text-xs text-text-secondary" />
          )}
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MODES) as Mode[]).map((key) => (
            <PreviewButton
              key={key}
              active={mode === key}
              onClick={() => {
                setMode(key);
                restart();
              }}
            >
              {MODES[key]}
            </PreviewButton>
          ))}
        </div>
        {mode === "flight" && (
          <div className="flex flex-wrap gap-2">
            <PreviewButton active={jump} onClick={() => setJump(true)}>
              Jump out!
            </PreviewButton>
            <PreviewButton active={false} onClick={restart}>
              ↺ Restart
            </PreviewButton>
            {(Object.keys(SPEEDS) as Speed[]).map((key) => (
              <PreviewButton key={key} active={speed === key} onClick={() => setSpeed(key)}>
                {SPEEDS[key].label}
              </PreviewButton>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
