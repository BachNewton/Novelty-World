"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { PerspectiveCamera } from "@react-three/drei";
import {
  BoxGeometry,
  GreaterDepth,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  type Group,
  type InstancedMesh,
} from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { GROUND_CLEARANCE } from "../clearance";
import { dropPose, finishLeapPose, leapProgress } from "../frog/leaps";
import { FROG_LOOKS, FROG_VARIANTS, type FrogVariant } from "../frog/look";
import { frogModel, frogPivot } from "../frog/model";
import { moveDuration } from "../frog/moves";
import { cellKey, frogCells } from "../logic";
import { FROG_THICKNESS, crossedFinish, frogShape, nextWall, placedFrog } from "../run";
import type { Session } from "../session";
import { tickTiming, toSeconds } from "../ticks";
import { rowLength } from "../traffic";
import { TUNING } from "../tuning";
import type { Cell } from "../types";
import { DECK_TOP } from "../world/structures";
import { CAMERA_FAR, CAMERA_NEAR, CAMERA_PITCH, cameraEye, easedCameraHeight, fittedFov } from "./camera-fit";
import {
  type DrawnFrog,
  amongVehicles,
  arrived,
  bonkPose,
  followDepth,
  frogTarget,
  glideAt,
  moveLift,
  seeMoves,
  seeBonk,
  snapped,
  withHop,
  withPiece,
} from "./drawn-frog";
import { FrogBody, type FrogHandle } from "./frog/frog-body";
import { frogDrawnIn, makeFrogAssets, type FrogDrawing } from "./frog/frog-assets";
import { GateView, makeGateAssets } from "./gate";
import { Vehicle } from "./vehicle";
import { makeVehicleAssets } from "./vehicle-assets";
import { FrogminoWorld } from "./world/world";

// World axes: x runs across the corridor (one unit per column), y up (one unit
// per row), and the traffic comes at the frog from -z. A rule depth d sits at
// z = -d: a row's vehicles lie just beyond its depth and the frog just short
// of its own, each as deep as the rules count it, so the two touch when their
// depths meet and overlap exactly when the rules say they do. Everything drawn
// in the cell grid stands the ground clearance above the ground under it.
const { courseLength } = TUNING;
const INITIAL_EYE = cameraEye(TUNING, 0, DECK_TOP);

// The road's middle, which the camera rides over.
function roadMiddle(lanes: number): number {
  return (lanes - 1) / 2;
}

// Each frame runs in this order: the rules' ticks and the traffic, then each
// drawn frog, then the camera following the team. Negative priorities order
// the frame without taking over rendering.
const STEP_PRIORITY = -2;
const FROG_PRIORITY = -1;

// Each player's frog is their variant: P1 Sprout, P2 Splash.
function variantOf(player: number): FrogVariant {
  const variant = FROG_VARIANTS[player] as FrogVariant | undefined;
  if (variant === undefined) throw new Error(`No frog looks for player ${String(player)}`);
  return variant;
}

// The frog's silhouette draws after the traffic and the world, so it sees
// what hides the frog in the depth buffer, and before the frog itself, so
// the frog never hides its own parts from it.
const SILHOUETTE_ORDER = 1;
const FROG_ORDER = 2;

// The fit outline is drawn just in front of the next row's face.
const FIT_LINE_WIDTH = 0.1;
const FIT_OUTLINE_LIFT = 0.03;
// The longest perimeter of any tetromino, in cell edges.
const MAX_PERIMETER = 10;

// The scene's own things: the fit outline and each frog's silhouette, in
// its own colour.
function makeAssets() {
  return {
    fitEdge: new BoxGeometry(1 + FIT_LINE_WIDTH, FIT_LINE_WIDTH, FIT_LINE_WIDTH),
    fitMaterial: new MeshBasicMaterial({ color: themeColor("--color-text-primary") }),
    // Drawn only where something nearer the camera hides the frog: before
    // the frog itself, so only the traffic and the structures are in the
    // depth buffer yet, and without writing depth, so it never hides the frog.
    silhouettes: Object.fromEntries(
      FROG_VARIANTS.map((variant) => [
        variant,
        new MeshBasicMaterial({
          color: themeColor(`--color-frogmino-frog-${variant}-silhouette`),
          depthFunc: GreaterDepth,
          depthWrite: false,
          fog: false,
        }),
      ]),
    ) as Record<FrogVariant, MeshBasicMaterial>,
  };
}
type SceneAssets = ReturnType<typeof makeAssets>;

function Camera({ lanes }: { lanes: number }) {
  const aspect = useThree((s) => s.size.width / s.size.height);
  return (
    <PerspectiveCamera
      makeDefault
      fov={fittedFov(aspect, lanes)}
      near={CAMERA_NEAR}
      far={CAMERA_FAR}
      position={[roadMiddle(lanes), INITIAL_EYE.y, INITIAL_EYE.z]}
      rotation={[CAMERA_PITCH, 0, 0]}
    />
  );
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

// Where each player's frog is drawn this frame, along the road and the ground
// under it, for the camera following the team.
type DrawnTeam = (Pick<DrawnFrog, "depth" | "level"> | null)[];

// One player's frog: eases its drawn frog toward the rule frog each frame
// and places it, its silhouette and its fit outline, all without React
// re-rendering. Everything is drawn at `now`, the rules' time and on into
// the tick under way, so nothing steps at the tick rate.
function TeamFrog({
  session,
  player,
  assets,
  frogAssets,
  silhouette,
  onDrawn,
}: {
  session: Session;
  player: number;
  assets: SceneAssets;
  frogAssets: FrogDrawing;
  silhouette: FrogDrawing;
  // Hears where the frog is drawn each frame, and null once it is gone.
  onDrawn: (player: number, drawn: DrawnFrog | null) => void;
}) {
  const variant = variantOf(player);
  const kind = useStore(session.store, (s) => s.run.frogs[player].kind);
  const rotation = useStore(session.store, (s) => s.run.frogs[player].rotation);

  // The frog turns about the middle of its cells.
  const pivot = useMemo(() => {
    const look = FROG_LOOKS[variant];
    return frogPivot(frogModel(kind, rotation, { markings: look.markings, pupil: look.pupil, clearance: GROUND_CLEARANCE }));
  }, [kind, rotation, variant]);

  const frogRef = useRef<Group>(null);
  const bodyRef = useRef<FrogHandle>(null);
  const silhouetteRef = useRef<FrogHandle>(null);
  const fitRef = useRef<InstancedMesh>(null);
  const fitShape = useRef("");
  const drawn = useRef<DrawnFrog | null>(null);
  const drawnRunId = useRef(-1);

  useEffect(
    () => () => {
      onDrawn(player, null);
    },
    [onDrawn, player],
  );

  useFrame((_, delta) => {
    const { run, runId, carry } = session.store.getState();
    const ruleFrog = placedFrog(run, player);
    const now = toSeconds(run.tick + carry);
    const timing = tickTiming(run.tuning);
    const play = (action: Parameters<FrogHandle["play"]>[0]): void => {
      bodyRef.current?.play(action);
      silhouetteRef.current?.play(action);
    };

    const newRun = drawn.current === null || drawnRunId.current !== runId;
    if (newRun) {
      if (drawnRunId.current !== runId) play("idle");
      drawn.current = snapped(run, player);
      drawnRunId.current = runId;
    }
    let d = drawn.current;
    if (d === null) throw new Error("The drawn frog wasn't set");
    // The frog's model is rendered by React from the store, so it shows a
    // new piece or rotation only from the frame after the rules take it.
    // Until then the drawn frog holds its pose, or the old model would be
    // drawn for a frame in the new pose's place.
    const modelPosed = kind === ruleFrog.kind && rotation === ruleFrog.rotation;
    if (modelPosed && d.kind !== kind) {
      d = withPiece(d, ruleFrog);
      drawn.current = d;
    } else if (modelPosed && d.rotation !== rotation) {
      // The frog is drawn at once in its new rotation, so it starts swung
      // back to where it was and swings the short way round to rest.
      const quarterTurns = (rotation - d.rotation + 4) % 4;
      d.swing += (quarterTurns === 3 ? -1 : quarterTurns) * (Math.PI / 2);
      d.rotation = rotation;
    }
    // Exponential easing that covers about 95% of the way in the ease
    // duration, for what isn't drawn as a move's glide: a turn's swing and
    // shift, and anything else that moves the frog.
    const lambda = 3 / run.tuning.easeDuration;
    const target = frogTarget(ruleFrog);
    const stride = moveDuration(run.tuning);

    const hop = ruleFrog.latestHop;
    if (hop !== null && hop.startedAt !== d.hopAt) {
      d.hopAt = hop.startedAt;
      play("hop");
    }
    const bonked = run.lastBonk !== d.bonk;
    if (bonked) {
      d = seeBonk(d, run);
      drawn.current = d;
      if (run.lastBonk !== null) play("bonk");
    }
    if (run.droppedAt !== null && d.drop === null && d.level > 0) {
      d.drop = { fromDepth: d.depth, fromLevel: d.level, startedAt: toSeconds(run.droppedAt), landed: false };
      play("hop");
    }
    if (run.finishedAt !== null && d.leap === null) {
      d.leap = { fromDepth: d.depth, fromLevel: d.level, startedAt: toSeconds(run.finishedAt), landed: false };
      play("hop");
    }

    const leap = d.leap ?? d.drop;
    const leaping = leap !== null && !leap.landed;

    // A slide or a jump is drawn as a move: a glide to its new place, with
    // a small hop. A bonk's knock-back, the drop and the finish leap move the
    // frog too, and are drawn as their own motions.
    const seen = seeMoves(d, ruleFrog, now, !bonked && !leaping && !crossedFinish(run));
    if (seen.moveHops !== d.moveHops) {
      bodyRef.current?.move(stride);
      silhouetteRef.current?.move(stride);
    }
    d = seen;
    drawn.current = d;
    if (modelPosed) {
      const slide = d.glideX;
      if (slide !== null && slide.to === target.x) {
        d.x = glideAt(slide, now, stride);
        if (arrived(slide, now, stride)) d.glideX = null;
      } else {
        d.glideX = null;
        d.x = MathUtils.damp(d.x, target.x, lambda, delta);
      }
      d.y = MathUtils.damp(d.y, target.y, lambda, delta);
      d.swing = MathUtils.damp(d.swing, 0, lambda, delta);
    }

    const pose = bonkPose(d.bonkMotion, run, now);
    if (pose === null) d.bonkMotion = null;
    let height = d.level;
    let spin = 0;
    if (leaping) {
      const duration = toSeconds(leap === d.leap ? timing.finishLeap : timing.dropDuration);
      const progress = leapProgress(now - leap.startedAt, duration);
      const at =
        leap === d.leap ? finishLeapPose(leap, courseLength, progress) : dropPose(leap, target.depth, progress);
      d.depth = at.depth;
      d.level = at.level;
      height = at.height;
      spin = at.spin;
      if (progress === 1) {
        leap.landed = true;
        play("land");
      }
    } else if (!crossedFinish(run)) {
      d = followDepth(d, run, now, pose, delta);
      drawn.current = d;
    }

    // Eased moves could cut through a vehicle (a turn swings the piece
    // through cells outside both of its poses), and a move made just before
    // a row arrives may not have finished easing. So while a vehicle overlaps
    // the drawn frog in play, it is drawn exactly as the rules have it across
    // the face, and the rules keep that inside the opening. Its height is the
    // rules' too, unless it rides on past their landing (see `withHop`).
    const wasUp = d.lift > 0;
    const among = amongVehicles(run, d.depth);
    if (among && modelPosed) {
      d.x = target.x;
      d.y = target.y;
      d.swing = 0;
      d.glideX = null;
    }
    d = withHop(run, d, now);
    drawn.current = d;
    onDrawn(player, d);
    if (wasUp && d.lift === 0 && (leap === null || leap.landed)) play("land");
    // A move's hop never lifts the frog among vehicles, and never plays over
    // a bonk's knock-back, the drop or the finish leap. A hop's arc already
    // lifts it higher, so the two never add up.
    const stepLift = among || pose !== null || leaping ? 0 : moveLift(d.moveHops, now, stride);

    const frog = frogRef.current;
    if (frog !== null) {
      const bonkLift = pose === null ? 0 : pose.lift;
      const lift = Math.max(d.lift, stepLift) + bonkLift;
      frog.position.set(d.x, height + GROUND_CLEARANCE + d.y + lift, -d.depth + FROG_THICKNESS / 2);
      frog.rotation.set(0, spin, d.swing);
    }

    const fit = fitRef.current;
    if (fit === null) return;
    const next = nextWall(run);
    fit.visible = next !== null && !crossedFinish(run);
    if (next === null) return;
    const travel = run.tuning.wallSpeed * toSeconds(carry);
    fit.position.z = -(run.walls[next].depth - travel) + FIT_OUTLINE_LIFT;
    const cells = frogCells(frogShape(ruleFrog));
    const shape = cells.map(cellKey).join(";");
    if (shape !== fitShape.current) {
      fitShape.current = shape;
      placeEdges(fit, perimeterEdges(cells));
    }
  }, FROG_PRIORITY);

  return (
    <>
      <group ref={frogRef}>
        <group position={[-pivot[0], -pivot[1], -pivot[2]]}>
          <FrogBody
            ref={silhouetteRef}
            kind={kind}
            rotation={rotation}
            variant={variant}
            seed={player}
            renderOrder={SILHOUETTE_ORDER}
            assets={silhouette}
          />
          <FrogBody
            ref={bodyRef}
            kind={kind}
            rotation={rotation}
            variant={variant}
            seed={player}
            renderOrder={FROG_ORDER}
            assets={frogAssets}
          />
        </group>
      </group>
      <instancedMesh
        ref={fitRef}
        args={[assets.fitEdge, assets.fitMaterial, MAX_PERIMETER]}
        position-y={GROUND_CLEARANCE}
        frustumCulled={false}
      />
    </>
  );
}

// Runs the game each frame: runs the rules' ticks the frame has brought due
// and places the traffic, then each frog draws itself, then the camera
// follows the team, all without React re-rendering.
function Game({ session }: { session: Session }) {
  const course = useStore(session.store, (s) => s.course);
  const players = useStore(session.store, (s) => s.run.frogs.length);
  // Which row of the course each wall is: changes only when a wall is
  // recycled as the next row.
  const traffic = useStore(session.store, useShallow((s) => s.run.walls.map((wall) => wall.index)));

  const assets = useMemo(() => makeAssets(), []);
  const vehicleAssets = useMemo(() => makeVehicleAssets(), []);
  const frogAssets = useMemo(() => makeFrogAssets(), []);
  const gateAssets = useMemo(() => makeGateAssets(), []);
  const silhouettes = useMemo(
    () => Object.fromEntries(FROG_VARIANTS.map((variant) => [variant, frogDrawnIn(frogAssets, assets.silhouettes[variant])])) as Record<FrogVariant, FrogDrawing>,
    [frogAssets, assets],
  );
  useEffect(
    () => () => {
      assets.fitEdge.dispose();
      assets.fitMaterial.dispose();
      Object.values(assets.silhouettes).forEach((material) => {
        material.dispose();
      });
    },
    [assets],
  );
  useEffect(
    () => () => {
      vehicleAssets.dispose();
      frogAssets.dispose();
      gateAssets.dispose();
    },
    [vehicleAssets, frogAssets, gateAssets],
  );

  const wallRefs = useRef<(Group | null)[]>([]);
  const team = useRef<DrawnTeam>([]);
  const onDrawn = useCallback((player: number, drawn: DrawnFrog | null) => {
    team.current[player] = drawn;
  }, []);
  const cameraRunId = useRef(-1);

  useFrame((_, delta) => {
    session.frame(delta);
    const { run, carry } = session.store.getState();
    // The traffic is drawn as far on into the tick as real time has got.
    const travel = run.tuning.wallSpeed * toSeconds(carry);
    run.walls.forEach((wall, i) => {
      const group = wallRefs.current[i];
      if (group) group.position.z = -(wall.depth - travel);
    });
  }, STEP_PRIORITY);

  // The camera follows the team from behind, over the middle of the road,
  // rising and falling with the ground under it. The frogs share a depth, so
  // their drawn depths are as one; it follows their middle.
  useFrame((state, delta) => {
    const drawnFrogs = team.current.filter((d) => d !== null);
    if (drawnFrogs.length === 0) return;
    const mean = (of: (d: Pick<DrawnFrog, "depth" | "level">) => number): number =>
      drawnFrogs.reduce((sum, d) => sum + of(d), 0) / drawnFrogs.length;
    const eye = cameraEye(TUNING, mean((d) => d.depth), mean((d) => d.level));
    const { runId } = session.store.getState();
    const snap = cameraRunId.current !== runId;
    cameraRunId.current = runId;
    state.camera.position.z = eye.z;
    state.camera.position.y = snap ? eye.y : easedCameraHeight(state.camera.position.y, eye.y, delta);
  });

  return (
    <>
      <FrogminoWorld courseLength={courseLength} seed={course.seed} lanes={course.lanes} />
      {Array.from({ length: players }, (_, player) => (
        <TeamFrog
          key={player}
          session={session}
          player={player}
          assets={assets}
          frogAssets={frogAssets}
          silhouette={silhouettes[variantOf(player)]}
          onDrawn={onDrawn}
        />
      ))}
      {traffic.map((index, i) => {
        const row = course.row(index);
        return (
          <group
            key={i}
            ref={(group) => {
              wallRefs.current[i] = group;
            }}
          >
            {row.vehicles.map(({ id, lane }) => (
              <Vehicle
                key={`${String(index)}:${String(lane)}`}
                id={id}
                lane={lane}
                depth={0}
                assets={vehicleAssets}
                rumbleSeed={`${String(index)}:${String(lane)}`}
              />
            ))}
            {row.gates.map((gate) => (
              <GateView
                key={`${String(index)}:${String(gate.lane)}`}
                gate={gate}
                length={rowLength(row.solids)}
                assets={gateAssets}
              />
            ))}
          </group>
        );
      })}
    </>
  );
}

export function FrogminoScene({ session }: { session: Session }) {
  const lanes = useStore(session.store, (s) => s.course.lanes);
  // Flat: no tone mapping, so the design tokens show as authored.
  return (
    <Canvas flat>
      <Camera lanes={lanes} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 10, 6]} intensity={1.8} />
      <Game session={session} />
    </Canvas>
  );
}
