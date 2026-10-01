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
import { FROG_LOOKS } from "../frog/look";
import { frogModel, frogPivot } from "../frog/model";
import { cellKey, frogCells, pieceSize } from "../logic";
import {
  FROG_THICKNESS,
  crossedFinish,
  frogShape,
  hopHeight,
  inPlay,
  nextWall,
  onOverpass,
  type Bonk,
  type Run,
} from "../run";
import { useFrogminoStore } from "../store";
import { TUNING } from "../tuning";
import type { Cell, Rotation, TetrominoKind } from "../types";
import { DECK_LENGTH, DECK_TOP } from "../world/structures";
import { CAMERA_FAR, CAMERA_NEAR, CAMERA_PITCH, fittedFov } from "./camera-fit";
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
const { corridorCols, courseLength, cameraHeight, cameraFollow } = TUNING;
const CENTER_X = (corridorCols - 1) / 2;
const INITIAL_CAMERA: [number, number, number] = [CENTER_X, DECK_TOP + cameraHeight, cameraFollow];
// The camera rises and falls with the ground under the frog (the overpass,
// the road, the finish gantry) over about this long, in seconds.
const CAMERA_LEVEL_EASE = 0.6;

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

// A bonk knocks the drawn frog back along a low arc; the frog itself
// flattens against the row and is left dazed.
const BONK_DURATION = 0.3;
const BONK_ARC_HEIGHT = 0.8;

// The hop arc overshoots a sine and is capped at one cell, so the drawn frog
// rises quickly to a full cell, as the rules count it, and falls the same way
// once the rules land it.
const HOP_ARC_OVERSHOOT = 1.3;

// The drop from the overpass hops off its lip, then falls ever faster to the
// road, clearing the deck's edge on the way down.
const DROP_HOP = 0.6;

// The finish leap springs back and up from the spring pad, clear of the
// gantry's near face, and comes down in the middle of its deck, spinning
// round once on the way.
const LEAP_BACK = 1.5;
const LEAP_PEAK = DECK_TOP + 3;
const GANTRY_STAND = courseLength + DECK_LENGTH / 2 + FROG_THICKNESS / 2;

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
      fov={fittedFov(aspect)}
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

// Where the drawn frog is heading: the middle of its rule placement's box,
// across and up from the top of the ground clearance, and its depth.
function frogTarget(run: Run): { x: number; y: number; depth: number } {
  const { kind, col, rotation, depth } = run.frog;
  const { width, height } = pieceSize(kind, rotation);
  return { x: col + (width - 1) / 2, y: height / 2, depth };
}

// The rising half of the hop arc, `seconds` into it.
function hopArc(seconds: number, airtime: number): number {
  const progress = MathUtils.clamp(seconds / airtime, 0, 0.5);
  return Math.min(1, HOP_ARC_OVERSHOOT * Math.sin(Math.PI * progress));
}

// How long the arc takes to reach a full cell.
function hopRiseTime(airtime: number): number {
  return (airtime * Math.asin(1 / HOP_ARC_OVERSHOOT)) / Math.PI;
}

// The drawn frog rises along the arc while the rules have it up, and falls
// back along it once they land it. Each only ever moves the drawn frog one
// way, so it carries on smoothly from wherever it was left.
function hopLift(run: Run, drawnLift: number): number {
  const hop = run.frog.latestHop;
  if (hop === null) return 0;
  const airtime = run.tuning.hopAirtime;
  if (hop.landedAt === null) return Math.max(drawnLift, hopArc(run.time - hop.startedAt, airtime));
  return Math.min(drawnLift, hopArc(hopRiseTime(airtime) - (run.time - hop.landedAt), airtime));
}

// Whether any vehicle overlaps the drawn frog.
function overlapsDrawnFrog(run: Run, frogDepth: number): boolean {
  return run.walls.some(
    (wall) =>
      wall.depth < frogDepth && wall.solids.some((solid) => wall.depth + solid.length > frogDepth - FROG_THICKNESS),
  );
}

interface BonkMotion {
  from: number;
  to: number;
  startedAt: number;
}

interface BonkPose {
  depth: number;
  lift: number;
}

// Where a bonk's knock-back has the drawn frog now; null once it is over, or
// once the frog has jumped away from where the bonk put it.
function bonkPose(motion: BonkMotion | null, run: Run): BonkPose | null {
  if (motion === null || run.frog.depth !== motion.to) return null;
  const progress = (run.time - motion.startedAt) / BONK_DURATION;
  if (progress >= 1) return null;
  return {
    depth: MathUtils.lerp(motion.from, motion.to, 1 - (1 - progress) ** 2),
    lift: BONK_ARC_HEIGHT * Math.sin(Math.PI * progress),
  };
}

// A jump off one level onto another, drawn over its own time: the drop from
// the overpass and the leap onto the finish gantry.
interface Leap {
  fromDepth: number;
  fromLevel: number;
  startedAt: number;
  landed: boolean;
}

// Where the drop from the overpass has the drawn frog, `progress` of the way
// down to the road, heading for the rules' depth.
function dropPose(leap: Leap, progress: number, depth: number): { depth: number; level: number; height: number } {
  const level = DECK_TOP * (1 - progress ** 3);
  return {
    depth: MathUtils.lerp(leap.fromDepth, depth, 1 - (1 - progress) ** 2),
    level,
    height: level + DROP_HOP * Math.sin(Math.PI * progress),
  };
}

// Where the finish leap has the drawn frog, `progress` of the way onto the
// gantry's deck: along a curve that swings back and up clear of the deck's
// near face, then forward onto it.
function leapPose(leap: Leap, progress: number): { depth: number; level: number; height: number } {
  const bezier = (from: number, via: number, to: number): number =>
    (1 - progress) ** 2 * from + 2 * progress * (1 - progress) * via + progress ** 2 * to;
  return {
    depth: bezier(leap.fromDepth, courseLength - LEAP_BACK, GANTRY_STAND),
    level: MathUtils.lerp(leap.fromLevel, DECK_TOP, progress),
    height: bezier(leap.fromLevel, LEAP_PEAK, DECK_TOP),
  };
}

interface DrawnFrog {
  // The piece drawn; a gate snaps the drawing to the new piece.
  kind: TetrominoKind;
  x: number;
  y: number;
  depth: number;
  // The ground under the frog: the overpass's deck, the road or the gantry's.
  level: number;
  // How far the drawn frog still has to swing to reach the rule rotation,
  // which the frog is already drawn in.
  swing: number;
  rotation: Rotation;
  lift: number;
  // The latest hop and bonk seen, and the knock-back the bonk is drawing.
  hopAt: number | null;
  bonk: Bonk | null;
  bonkMotion: BonkMotion | null;
  drop: Leap | null;
  leap: Leap | null;
}

function snapped(run: Run): DrawnFrog {
  return {
    ...frogTarget(run),
    kind: run.frog.kind,
    level: onOverpass(run) ? DECK_TOP : 0,
    swing: 0,
    rotation: run.frog.rotation,
    lift: hopHeight(run.frog),
    hopAt: run.frog.latestHop?.startedAt ?? null,
    bonk: run.lastBonk,
    bonkMotion: null,
    drop: null,
    leap: null,
  };
}

// The camera follows the drawn frog from behind, over the middle of the
// road, rising and falling with the ground under it.
function follow(camera: CameraImpl, d: DrawnFrog, delta: number, snap: boolean): void {
  camera.position.z = -d.depth + cameraFollow;
  const level = d.level + cameraHeight;
  camera.position.y = snap ? level : MathUtils.damp(camera.position.y, level, 3 / CAMERA_LEVEL_EASE, delta);
}

// Runs the game each frame: advances the rules, then eases the drawn frog
// toward its rule state and places the traffic, all without React
// re-rendering.
function Game() {
  const stream = useFrogminoStore((s) => s.stream);
  // Which row of the stream each wall is: changes only when a wall is
  // recycled as the next row.
  const traffic = useFrogminoStore(useShallow((s) => s.run.walls.map((wall) => wall.index)));
  const kind = useFrogminoStore((s) => s.run.frog.kind);
  const rotation = useFrogminoStore((s) => s.run.frog.rotation);

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
    useFrogminoStore.getState().tick(delta);
    const { run, runId } = useFrogminoStore.getState();
    const play = (action: Parameters<FrogHandle["play"]>[0]): void => {
      bodyRef.current?.play(action);
      silhouetteRef.current?.play(action);
    };

    const snap = drawn.current === null || drawnRunId.current !== runId || drawn.current.kind !== run.frog.kind;
    if (snap) {
      if (drawnRunId.current !== runId) play("idle");
      drawn.current = snapped(run);
      drawnRunId.current = runId;
    }
    const d = drawn.current;
    if (d === null) throw new Error("The drawn frog wasn't set");
    if (run.frog.rotation !== d.rotation) {
      // The frog is drawn at once in its new rotation, so it starts swung
      // back to where it was and swings the short way round to rest.
      const quarterTurns = (run.frog.rotation - d.rotation + 4) % 4;
      d.swing += (quarterTurns === 3 ? -1 : quarterTurns) * (Math.PI / 2);
      d.rotation = run.frog.rotation;
    }
    // Exponential easing that covers about 95% of the way in the ease duration.
    const lambda = 3 / run.tuning.easeDuration;
    const target = frogTarget(run);
    d.x = MathUtils.damp(d.x, target.x, lambda, delta);
    d.y = MathUtils.damp(d.y, target.y, lambda, delta);
    d.swing = MathUtils.damp(d.swing, 0, lambda, delta);

    const hop = run.frog.latestHop;
    if (hop !== null && hop.startedAt !== d.hopAt) {
      d.hopAt = hop.startedAt;
      play("hop");
    }
    const bonk = run.lastBonk;
    if (bonk !== d.bonk) {
      d.bonk = bonk;
      if (bonk !== null) {
        d.bonkMotion = { from: bonk.depth, to: run.frog.depth, startedAt: bonk.time };
        play("bonk");
      }
    }
    if (run.droppedAt !== null && d.drop === null && d.level > 0) {
      d.drop = { fromDepth: d.depth, fromLevel: d.level, startedAt: run.droppedAt, landed: false };
      play("hop");
    }
    if (run.finishedAt !== null && d.leap === null) {
      d.leap = { fromDepth: d.depth, fromLevel: d.level, startedAt: run.finishedAt, landed: false };
      play("hop");
    }

    const pose = bonkPose(d.bonkMotion, run);
    if (pose === null) d.bonkMotion = null;
    let height = d.level;
    let spin = 0;
    const leap = d.leap ?? d.drop;
    if (leap !== null && !leap.landed) {
      const duration = leap === d.leap ? run.tuning.finishLeapDuration : run.tuning.dropDuration;
      const progress = Math.min(1, (run.time - leap.startedAt) / duration);
      const at = leap === d.leap ? leapPose(leap, progress) : dropPose(leap, progress, target.depth);
      d.depth = at.depth;
      d.level = at.level;
      height = at.height;
      if (leap === d.leap) spin = 2 * Math.PI * (1 - (1 - progress) ** 2);
      if (progress === 1) {
        leap.landed = true;
        play("land");
      }
    } else if (!crossedFinish(run)) {
      d.depth = pose === null ? MathUtils.damp(d.depth, target.depth, lambda, delta) : pose.depth;
    }

    // Eased moves could cut through a vehicle (a turn swings the piece
    // through cells outside both of its poses), and a move made just before
    // a row arrives may not have finished easing. So while a vehicle overlaps
    // the drawn frog in play, it is drawn exactly as the rules have it, and
    // the rules keep that inside the opening.
    const wasUp = d.lift > 0;
    if (inPlay(run) && overlapsDrawnFrog(run, d.depth)) {
      d.x = target.x;
      d.y = target.y;
      d.swing = 0;
      d.lift = hopHeight(run.frog);
    } else {
      d.lift = hopLift(run, d.lift);
    }
    if (wasUp && d.lift === 0 && (leap === null || leap.landed)) play("land");

    const frog = frogRef.current;
    if (frog !== null) {
      const bonkLift = pose === null ? 0 : pose.lift;
      frog.position.set(d.x, height + GROUND_CLEARANCE + d.y + d.lift + bonkLift, -d.depth + FROG_THICKNESS / 2);
      frog.rotation.set(0, spin, d.swing);
    }
    follow(state.camera, d, delta, snap);

    run.walls.forEach((wall, i) => {
      const group = wallRefs.current[i];
      if (group) group.position.z = -wall.depth;
    });

    const fit = fitRef.current;
    if (fit === null) return;
    const next = nextWall(run);
    fit.visible = next !== null && !crossedFinish(run);
    if (next === null) return;
    fit.position.z = -run.walls[next].depth + FIT_OUTLINE_LIFT;
    const cells = frogCells(frogShape(run.frog));
    const shape = cells.map(cellKey).join(";");
    if (shape !== fitShape.current) {
      fitShape.current = shape;
      placeEdges(fit, perimeterEdges(cells));
    }
  });

  return (
    <>
      <FrogminoWorld courseLength={courseLength} seed={stream.seed} />
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
            <Vehicle key={`${String(index)}:${String(lane)}`} id={id} lane={lane} depth={0} assets={vehicleAssets} />
          ))}
          {stream.row(index).gates.map((gate) => (
            <GateView key={`${String(index)}:${String(gate.lane)}`} gate={gate} assets={gateAssets} />
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
