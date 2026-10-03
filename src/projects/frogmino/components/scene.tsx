"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useShallow } from "zustand/react/shallow";
import { PerspectiveCamera } from "@react-three/drei";
import {
  BoxGeometry,
  GreaterDepth,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  type Camera as CameraImpl,
  type Group,
  type InstancedMesh,
} from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { GROUND_CLEARANCE } from "../clearance";
import { dropPose, finishLeapPose, leapProgress } from "../frog/leaps";
import { FROG_LOOKS } from "../frog/look";
import { frogModel, frogPivot } from "../frog/model";
import { moveDuration } from "../frog/moves";
import { cellKey, frogCells } from "../logic";
import { FROG_THICKNESS, crossedFinish, frogShape, nextWall } from "../run";
import { useFrogminoStore } from "../store";
import { tickTiming, toSeconds } from "../ticks";
import { rowLength } from "../traffic";
import { TUNING } from "../tuning";
import type { Cell } from "../types";
import { DECK_TOP } from "../world/structures";
import { CAMERA_FAR, CAMERA_NEAR, CAMERA_PITCH, cameraEye, easedCameraHeight, fittedFov } from "./camera-fit";
import {
  type DrawnFrog,
  DRAWN_PLAYER,
  amongVehicles,
  drawnRuleFrog,
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
import { frogDrawnIn, makeFrogAssets } from "./frog/frog-assets";
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
const { corridorCols, courseLength } = TUNING;
const CENTER_X = (corridorCols - 1) / 2;
const INITIAL_EYE = cameraEye(TUNING, 0, DECK_TOP);
const INITIAL_CAMERA: [number, number, number] = [CENTER_X, INITIAL_EYE.y, INITIAL_EYE.z];

// Solo play is the first player's frog.
const VARIANT = "p1";
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

// The scene's own things: the fit outline and the frog's silhouette.
function makeAssets() {
  return {
    fitEdge: new BoxGeometry(1 + FIT_LINE_WIDTH, FIT_LINE_WIDTH, FIT_LINE_WIDTH),
    fitMaterial: new MeshBasicMaterial({ color: themeColor("--color-text-primary") }),
    // Drawn only where something nearer the camera hides the frog: before
    // the frog itself, so only the traffic and the structures are in the
    // depth buffer yet, and without writing depth, so it never hides the frog.
    silhouette: new MeshBasicMaterial({
      color: themeColor("--color-frogmino-frog-silhouette"),
      depthFunc: GreaterDepth,
      depthWrite: false,
      fog: false,
    }),
  };
}

function Camera() {
  const aspect = useThree((s) => s.size.width / s.size.height);
  return (
    <PerspectiveCamera
      makeDefault
      fov={fittedFov(aspect, corridorCols)}
      near={CAMERA_NEAR}
      far={CAMERA_FAR}
      position={INITIAL_CAMERA}
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

// The camera follows the drawn frog from behind, over the middle of the
// road, rising and falling with the ground under it.
function follow(camera: CameraImpl, d: DrawnFrog, delta: number, snap: boolean): void {
  const eye = cameraEye(TUNING, d.depth, d.level);
  camera.position.z = eye.z;
  camera.position.y = snap ? eye.y : easedCameraHeight(camera.position.y, eye.y, delta);
}

// Runs the game each frame: runs the rules' ticks the frame has brought due,
// then eases the drawn frog toward its rule state and places the traffic, all
// without React re-rendering. Everything is drawn at `now`, the rules' time
// and on into the tick under way, so nothing steps at the tick rate.
function Game() {
  const stream = useFrogminoStore((s) => s.stream);
  // Which row of the stream each wall is: changes only when a wall is
  // recycled as the next row.
  const traffic = useFrogminoStore(useShallow((s) => s.run.walls.map((wall) => wall.index)));
  const kind = useFrogminoStore((s) => s.run.frogs[DRAWN_PLAYER].kind);
  const rotation = useFrogminoStore((s) => s.run.frogs[DRAWN_PLAYER].rotation);

  const assets = useMemo(() => makeAssets(), []);
  const vehicleAssets = useMemo(() => makeVehicleAssets(), []);
  const frogAssets = useMemo(() => makeFrogAssets(), []);
  const gateAssets = useMemo(() => makeGateAssets(), []);
  const silhouette = useMemo(() => frogDrawnIn(frogAssets, assets.silhouette), [frogAssets, assets]);
  useEffect(
    () => () => {
      Object.values(assets).forEach((asset) => {
        asset.dispose();
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

  // The frog turns about the middle of its cells.
  const pivot = useMemo(() => {
    const look = FROG_LOOKS[VARIANT];
    return frogPivot(frogModel(kind, rotation, { markings: look.markings, pupil: look.pupil, clearance: GROUND_CLEARANCE }));
  }, [kind, rotation]);

  const frogRef = useRef<Group>(null);
  const bodyRef = useRef<FrogHandle>(null);
  const silhouetteRef = useRef<FrogHandle>(null);
  const wallRefs = useRef<(Group | null)[]>([]);
  const fitRef = useRef<InstancedMesh>(null);
  const fitShape = useRef("");
  const drawn = useRef<DrawnFrog | null>(null);
  const drawnRunId = useRef(-1);

  useFrame((state, delta) => {
    useFrogminoStore.getState().frame(delta);
    const { run, runId, carry } = useFrogminoStore.getState();
    const ruleFrog = drawnRuleFrog(run);
    const now = toSeconds(run.tick + carry);
    const timing = tickTiming(run.tuning);
    const play = (action: Parameters<FrogHandle["play"]>[0]): void => {
      bodyRef.current?.play(action);
      silhouetteRef.current?.play(action);
    };

    const newRun = drawn.current === null || drawnRunId.current !== runId;
    if (newRun) {
      if (drawnRunId.current !== runId) play("idle");
      drawn.current = snapped(run);
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
    follow(state.camera, d, delta, newRun);

    // The traffic is drawn as far on into the tick as real time has got.
    const travel = run.tuning.wallSpeed * toSeconds(carry);
    run.walls.forEach((wall, i) => {
      const group = wallRefs.current[i];
      if (group) group.position.z = -(wall.depth - travel);
    });

    const fit = fitRef.current;
    if (fit === null) return;
    const next = nextWall(run);
    fit.visible = next !== null && !crossedFinish(run);
    if (next === null) return;
    fit.position.z = -(run.walls[next].depth - travel) + FIT_OUTLINE_LIFT;
    const cells = frogCells(frogShape(ruleFrog));
    const shape = cells.map(cellKey).join(";");
    if (shape !== fitShape.current) {
      fitShape.current = shape;
      placeEdges(fit, perimeterEdges(cells));
    }
  });

  return (
    <>
      <FrogminoWorld courseLength={courseLength} seed={stream.seed} lanes={corridorCols} />
      <group ref={frogRef}>
        <group position={[-pivot[0], -pivot[1], -pivot[2]]}>
          <FrogBody
            ref={silhouetteRef}
            kind={kind}
            rotation={rotation}
            variant={VARIANT}
            renderOrder={SILHOUETTE_ORDER}
            assets={silhouette}
          />
          <FrogBody ref={bodyRef} kind={kind} rotation={rotation} variant={VARIANT} renderOrder={FROG_ORDER} assets={frogAssets} />
        </group>
      </group>
      {traffic.map((index, i) => (
        <group
          key={i}
          ref={(group) => {
            wallRefs.current[i] = group;
          }}
        >
          {stream.row(index).vehicles.map(({ id, lane }) => (
            <Vehicle
              key={`${String(index)}:${String(lane)}`}
              id={id}
              lane={lane}
              depth={0}
              assets={vehicleAssets}
              rumbleSeed={`${String(index)}:${String(lane)}`}
            />
          ))}
          {stream.row(index).gates.map((gate) => (
            <GateView
              key={`${String(index)}:${String(gate.lane)}`}
              gate={gate}
              length={rowLength(stream.row(index).solids)}
              assets={gateAssets}
            />
          ))}
        </group>
      ))}
      <instancedMesh
        ref={fitRef}
        args={[assets.fitEdge, assets.fitMaterial, MAX_PERIMETER]}
        position-y={GROUND_CLEARANCE}
        frustumCulled={false}
      />
    </>
  );
}

export function FrogminoScene() {
  // Flat: no tone mapping, so the design tokens show as authored.
  return (
    <Canvas flat>
      <Camera />
      <ambientLight intensity={1.5} />
      <directionalLight position={[4, 10, 6]} intensity={1.8} />
      <Game />
    </Canvas>
  );
}
