"use client";

import { type ComponentRef, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  type Mesh,
  PerspectiveCamera,
  Spherical,
  Vector3,
} from "three";
import { type HeldKeys, useHeldKeys } from "@/shared/hooks/use-held-keys";
import { cn } from "@/shared/lib/utils";
import { fullName } from "../logic";
import {
  GEN_HEIGHT,
  createTreeSimulation,
  immediateFamily,
  type TreeSimNode,
  type TreeSimulation,
} from "../tree-3d-sim";
import type { Tree } from "../types";

const TICKS_PER_FRAME = 2;
const SPHERE_RADIUS = 5;
// Keyboard pan speed, in multiples of the camera's distance to its target
// per second, so it feels the same at any zoom. Shift speeds it up.
const PAN_SPEED = 0.7;
const PAN_BOOST = 3;
// Arrow-key orbit speed, in radians per second.
const ORBIT_SPEED = 1.2;
// Keyboard zoom, as a multiplicative factor per second (matches the 2D view).
// No Shift boost: "+" needs Shift on most layouts.
const ZOOM_RATE = 1.8;
// Held keys are lowercased `KeyboardEvent.key` values. "=" and "_" are the
// unshifted "+" and shifted "-", so either state of the key zooms.
const ZOOM_IN_KEYS = ["+", "="] as const;
const ZOOM_OUT_KEYS = ["-", "_"] as const;
const MOVE_KEYS = [
  "w", "a", "s", "d",
  "arrowleft", "arrowright", "arrowup", "arrowdown",
  ...ZOOM_IN_KEYS, ...ZOOM_OUT_KEYS,
] as const;
// Screen-space gap kept between a label and its sphere, and between labels.
const LABEL_LIFT_PX = 8;
const LABEL_GAP_PX = 2;
const CAMERA_FOV = 50;
// The camera looks at the tree from the front and a little above.
const CAMERA_DIRECTION = new Vector3(0, 0.35, 1).normalize();

function themeColor(token: string): Color {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  if (value === "") throw new Error(`Theme token ${token} is not defined`);
  return new Color(value);
}

interface Palette {
  background: Color;
  ground: Color;
  person: Color;
  trunk: Color;
  selected: Color;
  branch: Color;
  union: Color;
  exUnion: Color;
}

function readPalette(): Palette {
  return {
    background: themeColor("--color-surface-primary"),
    ground: themeColor("--color-border-hover"),
    person: themeColor("--color-brand-blue"),
    trunk: themeColor("--color-brand-orange"),
    selected: themeColor("--color-brand-pink"),
    branch: themeColor("--color-brand-green"),
    union: themeColor("--color-brand-pink"),
    exUnion: themeColor("--color-text-muted"),
  };
}

interface Tree3DProps {
  tree: Tree;
  // The person relationships are viewed from; the tree is built around them.
  rootId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function Tree3D({ tree, rootId, selectedId, onSelect }: Tree3DProps) {
  const [settled, setSettled] = useState(false);
  const sim = useMemo(() => createTreeSimulation(tree, rootId), [tree, rootId]);
  const palette = useMemo(() => readPalette(), []);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const controls = useRef<Controls>(null);

  return (
    <div
      className="absolute inset-0"
      data-sim-settled={settled}
      data-testid="tree-3d"
    >
      <Canvas
        camera={{ fov: CAMERA_FOV, far: 10000 }}
        onPointerMissed={() => { onSelect(null); }}
      >
        <color attach="background" args={[palette.background]} />
        <polarGridHelper args={[GEN_HEIGHT * 4, 12, 4, 64, palette.ground, palette.ground]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[300, 600, 400]} intensity={1.8} />
        <OrbitControls ref={controls} makeDefault />
        <Scene
          sim={sim}
          rootId={rootId}
          palette={palette}
          selectedId={selectedId}
          onSelect={onSelect}
          labels={labels}
          controls={controls}
          onSettledChange={setSettled}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {sim.nodes.map((n, i) => (
          <div
            key={n.id}
            ref={(el) => { labels.current[i] = el; }}
            className={cn(
              "invisible absolute left-0 top-0 whitespace-nowrap rounded px-1 text-[11px] leading-tight",
              n.id === selectedId
                ? "bg-brand-pink font-semibold text-surface-primary"
                : "bg-surface-primary/70 text-text-primary",
            )}
          >
            {fullName(tree.persons[n.id])}
          </div>
        ))}
      </div>

    </div>
  );
}

type Controls = ComponentRef<typeof OrbitControls>;

const CAMERA_RIGHT = new Vector3(1, 0, 0);
const CAMERA_UP = new Vector3().crossVectors(CAMERA_DIRECTION, CAMERA_RIGHT);
// Breathing room around the framed people, as a fraction of the fitted distance.
const FIT_MARGIN = 1.25;
// Room kept at each side of the screen for the framed people's labels, which
// are hidden rather than cut off at the edge. It decides the fit on phones.
const FIT_LABEL_ROOM_PX = 90;
const fitPoint = new Vector3();

// Aims the camera at the root and places it at the nearest distance, along
// CAMERA_DIRECTION, from which all of `framed` is inside the view, and at
// least a generation above and below the root. The rest of the tree is there
// to zoom out to.
function fitCamera(
  root: TreeSimNode,
  framed: TreeSimNode[],
  camera: PerspectiveCamera,
  controls: Controls,
  width: number,
): void {
  const center = new Vector3(root.x, root.y, root.z);
  const tanV = Math.tan(((camera.fov / 2) * Math.PI) / 180);
  const usableWidth = width - 2 * FIT_LABEL_ROOM_PX;
  const tanH = tanV * camera.aspect * (usableWidth / width);
  let distance = GEN_HEIGHT / tanV;
  for (const n of framed) {
    fitPoint.set(n.x, n.y, n.z).sub(center);
    const towardCamera = fitPoint.dot(CAMERA_DIRECTION);
    distance = Math.max(
      distance,
      towardCamera + Math.abs(fitPoint.dot(CAMERA_RIGHT)) / tanH,
      towardCamera + Math.abs(fitPoint.dot(CAMERA_UP)) / tanV,
    );
  }
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(CAMERA_DIRECTION, distance * FIT_MARGIN);
  controls.update();
}

const orbitOffset = new Vector3();
const orbitSpherical = new Spherical();

// Swings the camera around its orbit target: left/right around the vertical
// axis, up/down over the top. Returns whether it moved.
function orbitWithKeys(held: HeldKeys, camera: Camera, controls: Controls, delta: number): boolean {
  const right = Number(held.keys.has("arrowright")) - Number(held.keys.has("arrowleft"));
  const up = Number(held.keys.has("arrowup")) - Number(held.keys.has("arrowdown"));
  if (right === 0 && up === 0) return false;
  const step = ORBIT_SPEED * (held.shift ? PAN_BOOST : 1) * delta;
  orbitOffset.copy(camera.position).sub(controls.target);
  orbitSpherical.setFromVector3(orbitOffset);
  orbitSpherical.theta += right * step;
  orbitSpherical.phi -= up * step;
  orbitSpherical.makeSafe();
  camera.position.copy(controls.target).add(orbitOffset.setFromSpherical(orbitSpherical));
  controls.update();
  return true;
}

// Moves the camera toward or away from its orbit target. Returns whether it moved.
function zoomWithKeys(held: HeldKeys, camera: Camera, controls: Controls, delta: number): boolean {
  const zoomIn = ZOOM_IN_KEYS.some((k) => held.keys.has(k));
  const zoomOut = ZOOM_OUT_KEYS.some((k) => held.keys.has(k));
  const direction = Number(zoomIn) - Number(zoomOut);
  if (direction === 0) return false;
  const scale = Math.pow(ZOOM_RATE, -direction * delta);
  camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);
  controls.update();
  return true;
}

const panRight = new Vector3();
const panUp = new Vector3();

// Moves the camera and its orbit target together across the screen plane.
// Returns whether it moved.
function panWithKeys(held: HeldKeys, camera: Camera, controls: Controls, delta: number): boolean {
  const right = Number(held.keys.has("d")) - Number(held.keys.has("a"));
  const up = Number(held.keys.has("w")) - Number(held.keys.has("s"));
  if (right === 0 && up === 0) return false;
  const step =
    camera.position.distanceTo(controls.target) * PAN_SPEED * (held.shift ? PAN_BOOST : 1) * delta;
  panRight.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(right * step);
  panUp.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(up * step);
  camera.position.add(panRight).add(panUp);
  controls.target.add(panRight).add(panUp);
  controls.update();
  return true;
}

interface SceneProps {
  sim: TreeSimulation;
  rootId: string;
  palette: Palette;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  labels: RefObject<(HTMLDivElement | null)[]>;
  controls: RefObject<Controls | null>;
  onSettledChange: (settled: boolean) => void;
}

function Scene({
  sim,
  rootId,
  palette,
  selectedId,
  onSelect,
  labels,
  controls,
  onSettledChange,
}: SceneProps) {
  const meshes = useRef<(Mesh | null)[]>([]);
  const settledRef = useRef<boolean | null>(null);
  // Once the user moves the camera, it is theirs: stop fitting it to the tree.
  const userHasCamera = useRef(false);

  useEffect(() => {
    userHasCamera.current = false;
    const orbit = controls.current;
    if (!orbit) return;
    const takeCamera = () => { userHasCamera.current = true; };
    orbit.addEventListener("start", takeCamera);
    return () => { orbit.removeEventListener("start", takeCamera); };
  }, [sim, controls]);

  const edges = useMemo(() => buildEdgeObjects(sim, palette), [sim, palette]);
  useEffect(() => () => { edges.dispose(); }, [edges]);

  const partners = useMemo(() => partnerIndices(sim), [sim]);
  const { root, family } = useMemo(() => immediateFamily(sim, rootId), [sim, rootId]);
  const labelPriority = useMemo(() => {
    const familySet = new Set(family);
    const rank = (n: TreeSimNode) =>
      n.id === selectedId ? 0
        : n === root ? 1
          : familySet.has(n) ? 2
            : n.onTrunkLine ? 3
              : 4;
    return sim.nodes.map(rank);
  }, [sim, root, family, selectedId]);
  const held = useHeldKeys(MOVE_KEYS);

  useFrame(({ camera, size }, delta) => {
    if (controls.current) {
      const panned = panWithKeys(held.current, camera, controls.current, delta);
      const orbited = orbitWithKeys(held.current, camera, controls.current, delta);
      const zoomed = zoomWithKeys(held.current, camera, controls.current, delta);
      if (panned || orbited || zoomed) userHasCamera.current = true;
    }
    // Follow the family as the tree spreads, unless the user has taken the camera.
    if (!sim.settled()) {
      sim.simulation.tick(TICKS_PER_FRAME);
      if (!userHasCamera.current && controls.current && camera instanceof PerspectiveCamera) {
        fitCamera(root, family, camera, controls.current, size.width);
      }
    }
    sim.nodes.forEach((n, i) => { meshes.current[i]?.position.set(n.x, n.y, n.z); });
    edges.update();
    placeLabels(sim, labels.current, labelPriority, partners, camera, size);
    const settled = sim.settled();
    if (settled !== settledRef.current) {
      settledRef.current = settled;
      onSettledChange(settled);
    }
  });

  return (
    <>
      {edges.objects.map((obj) => <primitive key={obj.uuid} object={obj} />)}
      {sim.nodes.map((n, i) => {
        const selected = n.id === selectedId;
        const color = selected ? palette.selected : n.onTrunkLine ? palette.trunk : palette.person;
        const radius = n.id === rootId ? SPHERE_RADIUS * 1.6 : SPHERE_RADIUS;
        return (
          <mesh
            key={n.id}
            ref={(m) => { meshes.current[i] = m; }}
            position={[n.x, n.y, n.z]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(n.id);
            }}
          >
            <sphereGeometry args={[radius, 16, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
        );
      })}
    </>
  );
}

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const projected = new Vector3();

// Each person's partner, if any, for placing the couple's names on their
// outer sides. A current union wins over an ended one.
function partnerIndices(sim: TreeSimulation): (number | null)[] {
  const index = new Map(sim.nodes.map((n, i) => [n, i]));
  const partners: (number | null)[] = sim.nodes.map(() => null);
  for (const kind of ["union", "ex-union"] as const) {
    for (const l of sim.links) {
      if (l.kind !== kind) continue;
      const a = index.get(l.source)!;
      const b = index.get(l.target)!;
      partners[a] ??= b;
      partners[b] ??= a;
    }
  }
  return partners;
}

// Singles are labelled above their sphere; partners beside theirs, on the
// side away from each other, so a couple's names never cover each other.
function labelRect(
  x: number,
  y: number,
  w: number,
  h: number,
  side: "above" | "left" | "right",
): ScreenRect {
  if (side === "above") {
    return { left: x - w / 2, top: y - LABEL_LIFT_PX - h, right: x + w / 2, bottom: y - LABEL_LIFT_PX };
  }
  const left = side === "left" ? x - LABEL_LIFT_PX - w : x + LABEL_LIFT_PX;
  return { left, top: y - h / 2, right: left + w, bottom: y + h / 2 };
}

// Greedy declutter: labels claim screen space in priority order (then
// nearest first) and any label that would overlap a placed one is hidden.
function placeLabels(
  sim: TreeSimulation,
  labels: (HTMLDivElement | null)[],
  priority: number[],
  partners: (number | null)[],
  camera: Camera,
  size: { width: number; height: number },
): void {
  const screen = sim.nodes.map((n) => {
    projected.set(n.x, n.y, n.z).project(camera);
    return {
      x: ((projected.x + 1) / 2) * size.width,
      y: ((1 - projected.y) / 2) * size.height,
      depth: projected.z,
    };
  });
  const order = sim.nodes.map((_, i) => i);
  order.sort((a, b) => priority[a] - priority[b] || screen[a].depth - screen[b].depth);

  const placed: ScreenRect[] = [];
  for (const i of order) {
    const el = labels[i];
    if (!el) continue;
    const { x, y, depth } = screen[i];
    const partner = partners[i];
    const side = partner === null ? "above" : x < screen[partner].x ? "left" : "right";
    const rect = labelRect(x, y, el.offsetWidth, el.offsetHeight, side);
    const visible =
      depth < 1 &&
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= size.width &&
      rect.bottom <= size.height &&
      !placed.some(
        (p) =>
          rect.left < p.right + LABEL_GAP_PX &&
          p.left < rect.right + LABEL_GAP_PX &&
          rect.top < p.bottom + LABEL_GAP_PX &&
          p.top < rect.bottom + LABEL_GAP_PX,
      );
    el.style.visibility = visible ? "visible" : "hidden";
    if (!visible) continue;
    placed.push(rect);
    el.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  }
}

interface EdgeObjects {
  objects: LineSegments[];
  update: () => void;
  dispose: () => void;
}

type EdgeStyle = "trunk" | "branch" | "union" | "ex-union";

// A line from the midpoint of `from` to `to`. A child's line starts at the
// middle of its parents' union line rather than at each parent.
interface Segment {
  from: TreeSimNode[];
  to: TreeSimNode;
  style: EdgeStyle;
}

function segments(sim: TreeSimulation): Segment[] {
  const unions: Segment[] = sim.links
    .filter((l) => l.kind !== "parent")
    .map((l) => ({ from: [l.source], to: l.target, style: l.kind === "union" ? "union" : "ex-union" }));
  const descent: Segment[] = sim.families.map(({ child, parents }) => ({
    from: parents,
    to: child,
    style: child.onTrunkLine && parents.some((p) => p.onTrunkLine) ? "trunk" : "branch",
  }));
  return [...unions, ...descent];
}

function buildEdgeObjects(sim: TreeSimulation, palette: Palette): EdgeObjects {
  const materials: Record<EdgeStyle, LineBasicMaterial> = {
    trunk: new LineBasicMaterial({ color: palette.trunk }),
    branch: new LineBasicMaterial({ color: palette.branch, transparent: true, opacity: 0.7 }),
    union: new LineBasicMaterial({ color: palette.union }),
    "ex-union": new LineDashedMaterial({ color: palette.exUnion, dashSize: 3, gapSize: 3 }),
  };
  const all = segments(sim);
  const groups = Object.entries(materials).map(([style, material]) => {
    const subset = all.filter((seg) => seg.style === style);
    const positions = new BufferAttribute(new Float32Array(subset.length * 6), 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", positions);
    const object = new LineSegments(geometry, material);
    object.frustumCulled = false;
    return { subset, positions, geometry, material, object, dashed: material instanceof LineDashedMaterial };
  });

  return {
    objects: groups.map((g) => g.object),
    update: () => {
      for (const { subset, positions, object, dashed } of groups) {
        subset.forEach(({ from, to }, i) => {
          const k = 1 / from.length;
          let x = 0;
          let y = 0;
          let z = 0;
          for (const n of from) {
            x += n.x * k;
            y += n.y * k;
            z += n.z * k;
          }
          positions.setXYZ(i * 2, x, y, z);
          positions.setXYZ(i * 2 + 1, to.x, to.y, to.z);
        });
        positions.needsUpdate = true;
        if (dashed) object.computeLineDistances();
      }
    },
    dispose: () => {
      for (const { geometry, material } of groups) {
        geometry.dispose();
        material.dispose();
      }
    },
  };
}
