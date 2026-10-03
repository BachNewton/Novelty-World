"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import type { Group, Mesh } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { COURSE_SEED } from "../../course";
import { FROG_VARIANTS } from "../../frog/look";
import { dropPose, type LeapStart } from "../../frog/leaps";
import { cellKey, frogCells } from "../../logic";
import type { Row } from "../../traffic";
import { TUNING } from "../../tuning";
import type { Frog } from "../../types";
import { VEHICLES } from "../../vehicles";
import {
  PREVIEW_LANES,
  PREVIEW_PIECES,
  PREVIEW_ROWS,
  passingPoses,
  startPoses,
  type PreviewLanes,
  type PreviewTeam,
} from "../../world/preview-rows";
import { DECK_TOP, OVERPASS_FAR, OVERPASS_NEAR } from "../../world/structures";
import { CAMERA_FAR, CAMERA_NEAR, cameraEye, cameraPitch, fittedFov, type CameraKnobs } from "../camera-fit";
import { makeFrogAssets } from "../frog/frog-assets";
import { FrogBody } from "../frog/frog-body";
import { Vehicle } from "../vehicle";
import { makeVehicleAssets } from "../vehicle-assets";
import { CAMERA_KNOB_KEYS, CAMERA_KNOB_RANGES, TUNED_CAMERA, formatKnob, tuningSnippet } from "./camera-knobs";
import { FrogminoStructures, FrogminoWorld } from "./world";

// `?world`: the world around the road, seen from the gameplay camera as it
// drives down the road, with rows of traffic coming at the player's frog, or
// at the co-op pair side by side, always in the poses that fit the next row.
// It is for judging whether the world frames the gameplay without distracting
// from it, so it can be switched off to compare against the bare road, and
// how wide a road reads right for co-op. Its camera controls drive the
// gameplay camera's own maths with live knobs, for tuning by eye.

const { courseLength, wallSpeed } = TUNING;

// The camera rides over the middle of the road.
function roadMiddle(lanes: number): number {
  return (lanes - 1) / 2;
}

const DRIVES = {
  reverse: { label: "◀◀ Back", speed: -6 },
  pause: { label: "❚❚ Pause", speed: 0 },
  forward: { label: "▶ Drive", speed: 3 },
  fast: { label: "▶▶ Fast", speed: 12 },
} as const;
type Drive = keyof typeof DRIVES;

const TEAMS: Record<PreviewTeam, string> = { solo: "Solo", coop: "Co-op pair" };

// The frogs wait on the overpass's deck a moment, then jump down to the road.
const FROG_DECK_DEPTH = (OVERPASS_NEAR + OVERPASS_FAR) / 2 + 0.5;
const DECK_WAIT = 2.5;
const DROP_START: LeapStart = { fromDepth: FROG_DECK_DEPTH, fromLevel: DECK_TOP };
const DROP_LANDING = FROG_DECK_DEPTH + TUNING.dropDistance;

// A few rows loop around the frogs: they vanish well behind the camera and
// come back far up the road.
const ROW_SPACING = 17;
const ROWS_BEHIND = 30;
const ROWS_FIRST = 40;

interface Motion {
  time: number;
  depth: number;
  y: number;
  // The level the camera rides above.
  level: number;
  // Seconds left on the deck; null once the frogs have jumped down.
  deckWait: number | null;
  // How far through the jump down, from 0 to 1; null when not jumping.
  drop: number | null;
}

function startMotion(): Motion {
  return { time: 0, depth: FROG_DECK_DEPTH, y: DECK_TOP, level: DECK_TOP, deckWait: DECK_WAIT, drop: null };
}

function rowLength(row: Row): number {
  return Math.max(...row.map((v) => VEHICLES[v.id].length));
}

function rowOffset(index: number, rowCount: number, time: number, frogDepth: number): number {
  const span = rowCount * ROW_SPACING;
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
    m.drop = Math.min(1, m.drop + delta / TUNING.dropDuration);
    const pose = dropPose(DROP_START, DROP_LANDING, m.drop);
    m.depth = pose.depth;
    m.y = pose.height;
    m.level = pose.level;
    if (m.drop === 1) m.drop = null;
    return;
  }
  m.depth += speed * delta;
}

const DEGREES = 180 / Math.PI;

function PreviewCamera({ knobs, lanes, onFov }: { knobs: CameraKnobs; lanes: number; onFov: (fov: number) => void }) {
  const aspect = useThree((s) => s.size.width / s.size.height);
  const fov = fittedFov(aspect, lanes);
  useEffect(() => onFov(fov), [fov, onFov]);
  const eye = cameraEye(knobs, FROG_DECK_DEPTH, DECK_TOP);
  return (
    <PerspectiveCamera
      makeDefault
      fov={fov}
      near={CAMERA_NEAR}
      far={CAMERA_FAR}
      position={[roadMiddle(lanes), eye.y, eye.z]}
      rotation={[cameraPitch(knobs), 0, 0]}
    />
  );
}

// The frogs' poses as one comparable string.
function posesKey(frogs: readonly Frog[]): string {
  return frogs.map((frog) => frogCells(frog).map(cellKey).join(";")).join("|");
}

// The traffic and the frogs, from the start: it is mounted afresh for each
// road width, team and restart.
function PreviewTraffic({
  drive,
  knobs,
  lanes,
  team,
  onDepth,
}: {
  drive: Drive;
  knobs: CameraKnobs;
  lanes: PreviewLanes;
  team: PreviewTeam;
  onDepth: (depth: number) => void;
}) {
  const kinds = PREVIEW_PIECES[team];
  const rows = useMemo(
    () =>
      PREVIEW_ROWS[team][lanes].map((vehicles) => {
        const poses = passingPoses(vehicles, lanes, kinds);
        if (poses === null) throw new Error("A preview row doesn't let its frogs through");
        return { vehicles, poses, length: rowLength(vehicles) };
      }),
    [team, lanes, kinds],
  );
  const start = useMemo(() => startPoses(lanes, kinds), [lanes, kinds]);
  const vehicleAssets = useMemo(() => makeVehicleAssets(), []);
  const frogAssets = useMemo(() => makeFrogAssets(), []);
  useEffect(
    () => () => {
      vehicleAssets.dispose();
      frogAssets.dispose();
    },
    [vehicleAssets, frogAssets],
  );

  // A new pose rebuilds the frogs' models, so it goes through React, and only
  // when it changes.
  const [poses, setPoses] = useState(start);
  const shownPoses = useRef(posesKey(start));
  const motion = useRef(startMotion());
  const rowRefs = useRef<(Group | null)[]>([]);
  const frogsRef = useRef<Group>(null);

  useFrame(({ camera }, delta) => {
    const m = motion.current;
    advanceMotion(m, DRIVES[drive].speed, Math.min(delta, TUNING.maxFrameDelta));
    const offsets = rows.map((_, i) => rowOffset(i, rows.length, m.time, m.depth));
    rows.forEach((_, i) => {
      const group = rowRefs.current[i];
      if (group) group.position.z = -(m.depth + offsets[i]);
    });

    // On the road, the frogs take the poses that fit the next row to reach them.
    let next = start;
    if (m.deckWait === null && m.drop === null) {
      const coming = rows
        .map((row, i) => ({ row, offset: offsets[i] }))
        .filter(({ row, offset }) => offset + row.length > -1)
        .sort((a, b) => a.offset - b.offset);
      if (coming.length > 0) next = coming[0].row.poses;
    }
    const key = posesKey(next);
    if (key !== shownPoses.current) {
      shownPoses.current = key;
      setPoses(next);
    }
    frogsRef.current?.position.set(0, m.y, -m.depth);

    const eye = cameraEye(knobs, m.depth, m.level);
    camera.position.set(roadMiddle(lanes), eye.y, eye.z);
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
            <Vehicle key={lane} id={id} lane={lane} depth={0} assets={vehicleAssets} rumbleSeed={`${String(i)}:${String(lane)}`} />
          ))}
        </group>
      ))}
      {/* The frogs move as one; each stands in its own lanes, a cell up when its pose hops. */}
      <group ref={frogsRef}>
        {poses.map((frog, i) => (
          <group key={i} position={[frog.col - 0.5, frog.hop, 0]}>
            <FrogBody kind={frog.kind} rotation={frog.rotation} variant={FROG_VARIANTS[i]} seed={i} assets={frogAssets} />
          </group>
        ))}
      </group>
    </>
  );
}

// Without the world: the bare road the game drew before it, following the
// camera.
function BareRoad({ lanes }: { lanes: number }) {
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
      <mesh ref={roadRef} rotation={[-Math.PI / 2, 0, 0]} position={[roadMiddle(lanes), 0, 0]}>
        <planeGeometry args={[lanes, 500]} />
        <meshBasicMaterial color={colors.road} />
      </mesh>
      <FrogminoStructures courseLength={courseLength} lanes={lanes} />
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

function CameraPanel({
  knobs,
  onChange,
  fov,
}: {
  knobs: CameraKnobs;
  onChange: (knobs: CameraKnobs) => void;
  // The fitted field of view, once the canvas has measured itself.
  fov: number | null;
}) {
  const [copied, setCopied] = useState(false);
  const change = (next: CameraKnobs) => {
    setCopied(false);
    onChange(next);
  };

  return (
    <details className="pointer-events-auto w-full max-w-xs rounded-lg bg-surface-secondary/85 text-text-primary">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-bold">Camera</summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {CAMERA_KNOB_KEYS.map((key) => {
          const { label, min, max, step } = CAMERA_KNOB_RANGES[key];
          return (
            <label key={key} className="flex flex-col gap-0.5 text-xs">
              <span className="flex justify-between">
                <span>{label}</span>
                <span className="font-mono">{formatKnob(knobs[key])}</span>
              </span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={knobs[key]}
                onChange={(event) => change({ ...knobs, [key]: Number(event.target.value) })}
                className="w-full accent-brand-green"
              />
            </label>
          );
        })}
        <div className="flex justify-between font-mono text-xs text-text-secondary">
          <span>pitch {(-cameraPitch(knobs) * DEGREES).toFixed(1)}° down</span>
          {fov !== null && <span>fov {fov.toFixed(1)}°</span>}
        </div>
        <div className="flex gap-2">
          <PreviewButton active={false} onClick={() => change(TUNED_CAMERA)}>
            ↺ Reset to tuning
          </PreviewButton>
          <PreviewButton
            active={copied}
            onClick={() => {
              void navigator.clipboard.writeText(tuningSnippet(knobs)).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied ✓" : "Copy values"}
          </PreviewButton>
        </div>
      </div>
    </details>
  );
}

export function WorldPreview() {
  const [world, setWorld] = useState(true);
  const [drive, setDrive] = useState<Drive>("forward");
  const [restarts, setRestarts] = useState(0);
  const [lanes, setLanes] = useState<PreviewLanes>(PREVIEW_LANES[0]);
  const [team, setTeam] = useState<PreviewTeam>("solo");
  const [knobs, setKnobs] = useState<CameraKnobs>(TUNED_CAMERA);
  const [fov, setFov] = useState<number | null>(null);
  const readout = useRef<HTMLSpanElement>(null);
  // Written straight to the page each frame, without re-rendering.
  const showDepth = useCallback((depth: number) => {
    const element = readout.current;
    if (element !== null) element.textContent = `depth ${depth.toFixed(0)}`;
  }, []);
  // Each change of road or team starts the drive over, from the overpass.
  const restart = () => {
    setRestarts((n) => n + 1);
    setDrive("forward");
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-surface-primary">
      <div className="absolute inset-0">
        <Canvas flat>
          <PreviewCamera knobs={knobs} lanes={lanes} onFov={setFov} />
          <ambientLight intensity={1.5} />
          <directionalLight position={[4, 10, 6]} intensity={1.8} />
          {world ? (
            <FrogminoWorld courseLength={courseLength} seed={COURSE_SEED} lanes={lanes} />
          ) : (
            <BareRoad lanes={lanes} />
          )}
          <PreviewTraffic key={restarts} drive={drive} knobs={knobs} lanes={lanes} team={team} onDepth={showDepth} />
        </Canvas>
      </div>
      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-col items-start gap-2">
        <div className="rounded-lg bg-surface-secondary/80 px-3 py-1.5">
          <h1 className="text-xl font-bold text-brand-green">
            Frogmino <span className="text-sm font-normal text-text-secondary">world preview</span>
          </h1>
          <span ref={readout} data-testid="world-depth" className="font-mono text-xs text-text-secondary" />
        </div>
        <CameraPanel knobs={knobs} onChange={setKnobs} fov={fov} />
      </div>
      <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-surface-secondary/85 px-2 py-1.5 text-xs font-bold text-text-secondary">Lanes</span>
          {PREVIEW_LANES.map((width) => (
            <PreviewButton
              key={width}
              active={lanes === width}
              onClick={() => {
                setLanes(width);
                restart();
              }}
            >
              {String(width)}
            </PreviewButton>
          ))}
          {(Object.keys(TEAMS) as PreviewTeam[]).map((key) => (
            <PreviewButton
              key={key}
              active={team === key}
              onClick={() => {
                setTeam(key);
                restart();
              }}
            >
              {TEAMS[key]}
            </PreviewButton>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DRIVES) as Drive[]).map((key) => (
            <PreviewButton key={key} active={drive === key} onClick={() => setDrive(key)}>
              {DRIVES[key].label}
            </PreviewButton>
          ))}
          <PreviewButton active={false} onClick={restart}>
            ↺ Restart
          </PreviewButton>
          <PreviewButton active={world} onClick={() => setWorld((on) => !on)}>
            {world ? "World: on" : "World: off"}
          </PreviewButton>
        </div>
      </div>
    </div>
  );
}
