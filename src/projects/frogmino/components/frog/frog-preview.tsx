"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, View } from "@react-three/drei";
import type { Color, Group, PerspectiveCamera as PerspectiveCameraImpl } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { GROUND_CLEARANCE } from "../../clearance";
import { CAMERA_FAR, CAMERA_NEAR } from "../camera-fit";
import { pieceSize } from "../../logic";
import { FROG_THICKNESS } from "../../run";
import { TUNING } from "../../tuning";
import type { Rotation, TetrominoKind } from "../../types";
import { dropPose, finishLeapPose, leapProgress, type LeapPose, type LeapStart } from "../../frog/leaps";
import { glide, moveDuration, moveHopLift, moveProgress } from "../../frog/moves";
import { FROG_LOOKS, FROG_VARIANTS, type FrogVariant } from "../../frog/look";
import { frogModel, frogPivot } from "../../frog/model";
import { DECK_TOP } from "../../world/structures";
import { FrogBody, type FrogHandle } from "./frog-body";
import { makeFrogAssets, type FrogAssets } from "./frog-assets";

// The frog preview: every piece in every rotation from the gameplay camera's
// angle over the cell grid, a turntable of the selected frog, the two
// players side by side, and the co-op partners together. One canvas sits
// behind the page and draws every view into its card, as the garage does.

const KINDS: readonly TetrominoKind[] = ["I", "O", "T", "S", "Z", "J", "L"];
const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
const GRID_ROWS = 4;
const GRID_LINE = 0.025;
const FLAT_MARGIN = 0.4;
const GAMEPLAY_FOV = 30;
// The gameplay camera, as it sees a frog in the middle of the road: from
// behind and above, at the camera knobs' height and follow distance.
const GAMEPLAY_VIEW: readonly [number, number, number] = [
  0,
  TUNING.cameraHeight - 1,
  TUNING.cameraFollow - FROG_THICKNESS / 2,
];
const TURNTABLE_SPEED = 0.45;
const TURNTABLE_FOV = 35;
const TURNTABLE_VIEW: readonly [number, number, number] = [0.95, 0.6, 1.25];
// The preview's hop: up a full cell and down again, as the game's arc does.
const HOP_TIME = 0.6;
const DEGREES = Math.PI / 180;

// The game's set pieces, played with the frog's resting place as the road
// under it: the drop starts on a deck the drop distance back and lands where the frog
// rests, and the finish leap starts where it rests, on the finish line, and
// lands on a deck over it. There is no deck drawn, so after the leap lands
// the frog stands in the air a moment, then goes back to rest.
const DROP_START: LeapStart = { fromDepth: -TUNING.dropDistance, fromLevel: DECK_TOP };
const LEAP_START: LeapStart = { fromDepth: 0, fromLevel: 0 };
const LEAP_HOLD = 0.6;

type SetPiece = "drop" | "leap";
const SET_PIECES: Record<SetPiece, { duration: number; hold: number; pose: (progress: number) => LeapPose }> = {
  drop: { duration: TUNING.dropDuration, hold: 0, pose: (progress) => dropPose(DROP_START, 0, progress) },
  leap: { duration: TUNING.finishLeapDuration, hold: LEAP_HOLD, pose: (progress) => finishLeapPose(LEAP_START, 0, progress) },
};

// The game's everyday moves, each played as if its key were held: the move
// this many times at the held-key cadence, from as far away as that takes it,
// ending at rest.
type Step = "forward" | "back" | "left" | "right";
const HELD_MOVES = 3;
const STRIDE = moveDuration(TUNING);
// Which way each move goes: across the lanes and along the road.
const STEPS: Record<Step, { across: number; depth: number }> = {
  forward: { across: 0, depth: TUNING.depthStep },
  back: { across: 0, depth: -TUNING.depthStep },
  left: { across: -1, depth: 0 },
  right: { across: 1, depth: 0 },
};

// How far the frog's feet travel from its resting place: up, back toward the
// camera, ahead, and to either side. The views pull back to fit it while a
// set piece or a held move is cued.
interface Reach {
  up: number;
  back: number;
  ahead: number;
  left: number;
  right: number;
}
const AT_REST: Reach = { up: 0, back: 0, ahead: 0, left: 0, right: 0 };
// Where a frog is from its resting place.
type Offset = Pick<LeapPose, "height" | "depth" | "spin"> & { across: number };
const AT_REST_POSE: Offset = { height: 0, depth: 0, spin: 0, across: 0 };
const REACH_SAMPLES = 100;

function reachOf(piece: SetPiece): Reach {
  const poses = Array.from({ length: REACH_SAMPLES + 1 }, (_, k) => SET_PIECES[piece].pose(k / REACH_SAMPLES));
  return {
    up: Math.max(...poses.map((pose) => pose.height)),
    back: Math.max(0, ...poses.map((pose) => -pose.depth)),
    ahead: Math.max(0, ...poses.map((pose) => pose.depth)),
    left: 0,
    right: 0,
  };
}

// A held move starts this far from rest and moves toward it.
function stepReach(step: Step): Reach {
  const { across, depth } = STEPS[step];
  return {
    up: 0,
    back: HELD_MOVES * Math.max(0, depth),
    ahead: HELD_MOVES * Math.max(0, -depth),
    left: HELD_MOVES * Math.max(0, across),
    right: HELD_MOVES * Math.max(0, -across),
  };
}

// Where a held move has the frog, `elapsed` seconds into it, and which of its
// moves it is on; null once the last has landed.
function stepPose(step: Step, elapsed: number): { at: Offset; move: number } | null {
  const move = Math.floor(elapsed / STRIDE);
  if (move >= HELD_MOVES) return null;
  const progress = moveProgress(elapsed - move * STRIDE, STRIDE);
  const togo = HELD_MOVES - move - glide(progress);
  const { across, depth } = STEPS[step];
  return {
    at: { height: moveHopLift(progress), depth: -togo * depth, spin: 0, across: -togo * across },
    move,
  };
}

type Angle = "gameplay" | "flat";
type PreviewAction = "idle" | "hop" | "bonk" | SetPiece | Step;
const ACTIONS: readonly (readonly [PreviewAction, string])[] = [
  ["idle", "Idle"],
  ["hop", "Hop"],
  ["forward", "Forward"],
  ["back", "Back"],
  ["left", "Left"],
  ["right", "Right"],
  ["bonk", "Bonk"],
  ["drop", "Drop"],
  ["leap", "Finish leap"],
];
interface Cue {
  action: PreviewAction;
  count: number;
}

function isSetPiece(action: PreviewAction): action is SetPiece {
  return action === "drop" || action === "leap";
}

function isStep(action: PreviewAction): action is Step {
  return action in STEPS;
}

function cueReach(cue: Cue): Reach {
  if (isSetPiece(cue.action)) return reachOf(cue.action);
  return isStep(cue.action) ? stepReach(cue.action) : AT_REST;
}
interface Pose {
  kind: TetrominoKind;
  rotation: Rotation;
}
interface Placed extends Pose {
  variant: FrogVariant;
  lane: number;
  seed: number;
}

interface Palette {
  background: Color;
  grid: Color;
  road: Color;
  roadLine: Color;
}

function readPalette(): Palette {
  return {
    background: themeColor("--color-surface-tertiary"),
    grid: themeColor("--color-border-hover"),
    road: themeColor("--color-frogmino-world-asphalt"),
    roadLine: themeColor("--color-frogmino-world-lane-dash"),
  };
}

// The game scene's lights, so the frog looks here as it will on the road.
function Lights() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 10, 6]} intensity={1.8} />
    </>
  );
}

interface Moving {
  move: "hop" | SetPiece | Step;
  elapsed: number;
  landed: boolean;
  // How many of a held move's moves have started.
  started: number;
}

// A frog in the scene's axes, its leftmost lane centred on x = lane, that
// plays what the page's buttons say. Like the game's frog, it turns about
// the middle of its cells, plays a hop as a set piece starts and a landing
// as it comes down, and a move's hop as each move starts.
function PreviewFrog({ frog, cue, assets }: { frog: Placed; cue: Cue; assets: FrogAssets }) {
  const handle = useRef<FrogHandle>(null);
  const mover = useRef<Group>(null);
  const moving = useRef<Moving | null>(null);
  const pivot = useMemo(() => {
    const look = FROG_LOOKS[frog.variant];
    return frogPivot(
      frogModel(frog.kind, frog.rotation, { markings: look.markings, pupil: look.pupil, clearance: GROUND_CLEARANCE }),
    );
  }, [frog.kind, frog.rotation, frog.variant]);
  const rest: [number, number, number] = [frog.lane - 0.5 + pivot[0], pivot[1], pivot[2]];

  useEffect(() => {
    if (cue.count === 0) return;
    const { action } = cue;
    if (isStep(action)) {
      handle.current?.play("idle");
      moving.current = { move: action, elapsed: 0, landed: false, started: 0 };
      return;
    }
    handle.current?.play(isSetPiece(action) ? "hop" : action);
    moving.current =
      action === "hop" || isSetPiece(action) ? { move: action, elapsed: 0, landed: false, started: 0 } : null;
  }, [cue]);

  // Where the frog is, from its resting place, `delta` seconds on; once a
  // move is over, it rests.
  const advance = (current: Moving, delta: number): Offset => {
    current.elapsed += delta;
    if (isStep(current.move)) {
      const step = stepPose(current.move, current.elapsed);
      if (step === null) {
        moving.current = null;
        return AT_REST_POSE;
      }
      if (step.move === current.started) {
        current.started += 1;
        handle.current?.move(STRIDE);
      }
      return step.at;
    }
    if (current.move === "hop") {
      const progress = current.elapsed / HOP_TIME;
      if (progress < 1) return { height: Math.sin(Math.PI * progress), depth: 0, spin: 0, across: 0 };
      moving.current = null;
      handle.current?.play("land");
      return AT_REST_POSE;
    }
    const piece = SET_PIECES[current.move];
    if (current.landed) {
      if (current.elapsed < piece.duration + piece.hold) return { ...piece.pose(1), across: 0 };
      moving.current = null;
      return AT_REST_POSE;
    }
    const progress = leapProgress(current.elapsed, piece.duration);
    if (progress === 1) {
      current.landed = true;
      handle.current?.play("land");
    }
    return { ...piece.pose(progress), across: 0 };
  };

  useFrame((_, delta) => {
    const pose = moving.current === null ? AT_REST_POSE : advance(moving.current, delta);
    mover.current?.position.set(rest[0] + pose.across, rest[1] + pose.height, rest[2] - pose.depth);
    mover.current?.rotation.set(0, pose.spin, 0);
  });

  return (
    <group ref={mover} position={rest}>
      <group position={[-pivot[0], -pivot[1], -pivot[2]]}>
        <FrogBody
          ref={handle}
          kind={frog.kind}
          rotation={frog.rotation}
          variant={frog.variant}
          seed={frog.seed}
          assets={assets}
        />
      </group>
    </group>
  );
}

// The lane × row grid on the frog's front face, where the rules test it
// against the traffic, with its rows lifted by the clearance, and the road
// below it.
function Stage({ lanes, palette, children }: { lanes: number; palette: Palette; children: ReactNode }) {
  const c = GROUND_CLEARANCE;
  const across = Array.from({ length: lanes + 1 }, (_, k) => k);
  const up = Array.from({ length: GRID_ROWS + 1 }, (_, k) => k);
  const middle = (lanes - 1) / 2;
  return (
    <>
      <mesh position={[middle, -0.03, 0]}>
        <boxGeometry args={[lanes + 1, 0.06, 4]} />
        <meshLambertMaterial color={palette.road} />
      </mesh>
      {across.map((k) => (
        <mesh key={`lane${String(k)}`} position={[k - 0.5, 0.002, 0]}>
          <boxGeometry args={[GRID_LINE, 0.004, 4]} />
          <meshBasicMaterial color={palette.roadLine} />
        </mesh>
      ))}
      <group position={[0, 0, -0.02]}>
        {across.map((k) => (
          <mesh key={`col${String(k)}`} position={[k - 0.5, c + GRID_ROWS / 2, 0]}>
            <boxGeometry args={[GRID_LINE, GRID_ROWS, GRID_LINE]} />
            <meshBasicMaterial color={palette.grid} />
          </mesh>
        ))}
        {up.map((k) => (
          <mesh key={`row${String(k)}`} position={[middle, c + k, 0]}>
            <boxGeometry args={[lanes, GRID_LINE, GRID_LINE]} />
            <meshBasicMaterial color={palette.grid} />
          </mesh>
        ))}
      </group>
      {children}
    </>
  );
}

// Looks at the middle of a stage `lanes` wide, and of where a cued set piece
// takes its frogs, from the gameplay camera's direction or flat from straight
// behind, where the frog's outline is its silhouette on the grid.
function StageCamera({ lanes, angle, reach }: { lanes: number; angle: Angle; reach: Reach }) {
  const size = useThree((s) => s.size);
  const camera = useRef<PerspectiveCameraImpl>(null);
  const tall = GRID_ROWS + reach.up;
  const target: [number, number, number] = [
    (lanes - 1 + reach.right - reach.left) / 2,
    GROUND_CLEARANCE + tall / 2,
    FROG_THICKNESS / 2 + (reach.back - reach.ahead) / 2,
  ];
  const radius = Math.max(lanes + reach.left + reach.right, tall, FROG_THICKNESS + reach.back + reach.ahead) / 2 + 0.4;
  const distance = radius / Math.sin((GAMEPLAY_FOV / 2) * DEGREES);
  const along = Math.hypot(...GAMEPLAY_VIEW);
  const position = target.map((axis, i) => axis + (GAMEPLAY_VIEW[i] / along) * distance) as [number, number, number];

  useLayoutEffect(() => {
    camera.current?.lookAt(...target);
  });

  if (angle === "flat") {
    const wide = lanes + reach.left + reach.right;
    const zoom = Math.min(size.width / (wide + 2 * FLAT_MARGIN), size.height / (tall + 1 + 2 * FLAT_MARGIN));
    return (
      <OrthographicCamera
        makeDefault
        position={[target[0], (GROUND_CLEARANCE + tall) / 2, 10]}
        zoom={zoom}
        near={CAMERA_NEAR}
        far={CAMERA_FAR}
      />
    );
  }
  const aspect = size.width / size.height;
  // Narrow cards widen the view so the stage fits across.
  const fov = aspect >= 1 ? GAMEPLAY_FOV : 2 * Math.atan(Math.tan((GAMEPLAY_FOV / 2) * DEGREES) / aspect) / DEGREES;
  return <PerspectiveCamera ref={camera} makeDefault position={position} fov={fov} near={CAMERA_NEAR} far={CAMERA_FAR} />;
}

function StageView({
  frogs,
  lanes,
  angle,
  cue,
  assets,
  palette,
}: {
  frogs: readonly Placed[];
  lanes: number;
  angle: Angle;
  cue: Cue;
  assets: FrogAssets;
  palette: Palette;
}) {
  return (
    <>
      <color attach="background" args={[palette.background]} />
      <StageCamera lanes={lanes} angle={angle} reach={cueReach(cue)} />
      <Lights />
      <Stage lanes={lanes} palette={palette}>
        {frogs.map((frog) => (
          <PreviewFrog key={`${frog.variant}${String(frog.lane)}`} frog={frog} cue={cue} assets={assets} />
        ))}
      </Stage>
    </>
  );
}

// One frog on a stage wide enough for any piece, centred on it.
function single(pose: Pose, variant: FrogVariant, seed: number): Placed {
  const { width } = pieceSize(pose.kind, pose.rotation);
  return { ...pose, variant, seed, lane: Math.floor((GRID_ROWS - width) / 2) };
}

// Two frogs a lane apart.
function pair(left: Placed, right: Pose, rightVariant: FrogVariant): { frogs: Placed[]; lanes: number } {
  const leftWidth = pieceSize(left.kind, left.rotation).width;
  const rightWidth = pieceSize(right.kind, right.rotation).width;
  return {
    frogs: [
      { ...left, lane: 0 },
      { ...right, variant: rightVariant, seed: left.seed + 101, lane: leftWidth + 1 },
    ],
    lanes: leftWidth + 1 + rightWidth,
  };
}

function Turntable({ pose, variant, cue, assets, palette }: { pose: Pose; variant: FrogVariant; cue: Cue; assets: FrogAssets; palette: Palette }) {
  const { width, height } = pieceSize(pose.kind, pose.rotation);
  const spin = useRef<Group>(null);
  const camera = useRef<PerspectiveCameraImpl>(null);
  const reach = cueReach(cue);
  const middleY = GROUND_CLEARANCE + (height + reach.up) / 2;
  // Far enough back that the frog, hopping a cell or playing a cued set
  // piece, always fits as it turns.
  const around = 2 * Math.max(reach.back, reach.ahead, reach.left, reach.right);
  const radius =
    Math.hypot(width + 0.6 + around, height + 1 + GROUND_CLEARANCE + reach.up, FROG_THICKNESS + 0.6 + around) / 2 + 0.6;
  const distance = radius / Math.sin((TURNTABLE_FOV / 2) * DEGREES);
  const along = Math.hypot(...TURNTABLE_VIEW);
  const position = TURNTABLE_VIEW.map((axis, i) => (i === 1 ? middleY : 0) + (axis / along) * distance) as [
    number,
    number,
    number,
  ];

  useLayoutEffect(() => {
    camera.current?.lookAt(0, middleY + 0.5, 0);
  });
  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += TURNTABLE_SPEED * delta;
  });

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <PerspectiveCamera ref={camera} makeDefault position={position} fov={TURNTABLE_FOV} near={CAMERA_NEAR} far={CAMERA_FAR} />
      <Lights />
      <group ref={spin}>
        <mesh position={[0, -0.03, 0]}>
          <boxGeometry args={[width + 0.6, 0.06, FROG_THICKNESS + 0.6]} />
          <meshLambertMaterial color={palette.road} />
        </mesh>
        <group position={[-(width - 1) / 2, 0, -FROG_THICKNESS / 2]}>
          <PreviewFrog frog={{ ...pose, variant, seed: 7, lane: 0 }} cue={cue} assets={assets} />
        </group>
      </group>
    </>
  );
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-lg border border-border-default">
      {options.map(([option, name]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => {
            onChange(option);
          }}
          className={`px-3 py-1.5 text-sm font-semibold ${
            value === option ? "bg-brand-green text-surface-primary" : "bg-surface-secondary text-text-secondary"
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function Card({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="rounded-xl border border-border-default bg-surface-secondary p-2">
      {children}
      <figcaption className="mt-1 text-center text-xs text-text-muted">{caption}</figcaption>
    </figure>
  );
}

const VARIANT_NAMES: readonly (readonly [FrogVariant, string])[] = [
  ["p1", "P1"],
  ["p2", "P2"],
];

export function FrogPreview() {
  const palette = useMemo(() => readPalette(), []);
  const assets = useMemo(() => makeFrogAssets(), []);
  useEffect(
    () => () => {
      assets.dispose();
    },
    [assets],
  );

  const [variant, setVariant] = useState<FrogVariant>("p1");
  const [angle, setAngle] = useState<Angle>("gameplay");
  const [selected, setSelected] = useState<Pose>({ kind: "T", rotation: 0 });
  const [cue, setCue] = useState<Cue>({ action: "idle", count: 0 });
  const play = (action: PreviewAction) => {
    setCue((previous) => ({ action, count: previous.count + 1 }));
  };

  const partner: Pose = { kind: KINDS[(KINDS.indexOf(selected.kind) + 3) % KINDS.length], rotation: 1 };
  const samePiece = pair(single(selected, "p1", 11), selected, "p2");
  const otherPiece = pair(single(selected, "p1", 12), partner, "p2");

  return (
    <div className="min-h-dvh bg-surface-primary px-4 py-6">
      <header className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-brand-green">Frogmino frogs</h1>
        <p className="mt-1 text-sm text-text-secondary">
          The frog as every piece in every rotation, from the gameplay camera over the cell grid it is tested on,
          lifted by its ground clearance. Flat shows the silhouette straight from behind. Tap a pose to select it.
        </p>
        <a href="?" className="mt-2 inline-block text-sm font-semibold text-brand-blue underline">
          Back to the road
        </a>
      </header>

      <div className="sticky top-0 z-10 mx-auto mt-4 flex max-w-6xl flex-wrap items-center gap-2 bg-surface-primary/90 py-2">
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map(([action, name]) => (
            <button
              key={action}
              type="button"
              onClick={() => {
                play(action);
              }}
              className="rounded-lg bg-brand-green px-3 py-1.5 text-sm font-bold text-surface-primary"
            >
              {name}
            </button>
          ))}
        </div>
        <Toggle label="Frog" options={VARIANT_NAMES} value={variant} onChange={setVariant} />
        <Toggle
          label="Camera"
          options={[
            ["gameplay", "Gameplay"],
            ["flat", "Flat"],
          ]}
          value={angle}
          onChange={setAngle}
        />
      </div>

      <section className="mx-auto mt-4 grid max-w-6xl gap-4 lg:grid-cols-2">
        <Card caption={`${selected.kind} rotation ${String(selected.rotation)}, ${FROG_LOOKS[variant].name}, turning`}>
          <View className="aspect-square w-full">
            <Turntable pose={selected} variant={variant} cue={cue} assets={assets} palette={palette} />
          </View>
        </Card>
        <div className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-2">
            {FROG_VARIANTS.map((each) => (
              <Card key={each} caption={FROG_LOOKS[each].name}>
                <View className="aspect-square w-full">
                  <StageView
                    frogs={[single(selected, each, 21 + FROG_VARIANTS.indexOf(each))]}
                    lanes={GRID_ROWS}
                    angle={angle}
                    cue={cue}
                    assets={assets}
                    palette={palette}
                  />
                </View>
              </Card>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Card caption="Co-op: the same piece">
              <View className="aspect-[4/3] w-full">
                <StageView {...samePiece} angle={angle} cue={cue} assets={assets} palette={palette} />
              </View>
            </Card>
            <Card caption="Co-op: different pieces">
              <View className="aspect-[4/3] w-full">
                <StageView {...otherPiece} angle={angle} cue={cue} assets={assets} palette={palette} />
              </View>
            </Card>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-6 grid max-w-6xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {KINDS.map((kind, k) => (
          <div key={kind}>
            <h2 className="text-lg font-bold text-text-primary">{kind}</h2>
            <div className="grid grid-cols-4 gap-1">
              {ROTATIONS.map((rotation) => {
                const chosen = selected.kind === kind && selected.rotation === rotation;
                return (
                  <figure key={rotation}>
                    <View className="aspect-square w-full">
                      <StageView
                        frogs={[single({ kind, rotation }, variant, k * 4 + rotation)]}
                        lanes={GRID_ROWS}
                        angle={angle}
                        cue={cue}
                        assets={assets}
                        palette={palette}
                      />
                    </View>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => {
                        setSelected({ kind, rotation });
                      }}
                      className={`mt-1 w-full rounded text-xs font-semibold ${
                        chosen ? "bg-brand-orange text-surface-primary" : "bg-surface-secondary text-text-secondary"
                      }`}
                    >
                      {kind}
                      {rotation}
                    </button>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Flat: no tone mapping, so the design tokens show as authored. */}
      <Canvas flat style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
        <View.Port />
      </Canvas>
    </div>
  );
}
