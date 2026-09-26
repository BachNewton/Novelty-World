"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  type Mesh,
} from "three";
import { fullName } from "../logic";
import {
  GEN_HEIGHT,
  createTreeSimulation,

  type TreeSimLink,
  type TreeSimulation,
} from "../tree-3d-sim";
import type { Tree } from "../types";

const TICKS_PER_FRAME = 2;
const SPHERE_RADIUS = 5;
const CAMERA_FOV = 50;
const CAMERA_DISTANCE = 1100;
// Rough settled width of a production-sized tree, in world units.
const SCENE_WIDTH = 1000;

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
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function Tree3D({ tree, selectedId, onSelect }: Tree3DProps) {
  const [tidy, setTidy] = useState(1);
  const [settled, setSettled] = useState(false);
  // Created at full tidy; the effect below syncs the slider's value in
  // before the first frame ticks.
  const sim = useMemo(() => createTreeSimulation(tree, 1), [tree]);
  const palette = useMemo(() => readPalette(), []);

  useEffect(() => {
    sim.setTidy(tidy);
  }, [sim, tidy]);

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
        <CameraFit />
        <OrbitControls makeDefault target={[0, GEN_HEIGHT, 0]} />
        <Scene
          sim={sim}
          tree={tree}
          palette={palette}
          selectedId={selectedId}
          onSelect={onSelect}
          onSettledChange={setSettled}
        />
      </Canvas>

      <label className="absolute bottom-3 left-3 flex w-[min(20rem,calc(100%-1.5rem))] items-center gap-3 rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-xs text-text-secondary shadow-lg">
        <span>Wild</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={tidy}
          onChange={(e) => { setTidy(Number(e.target.value)); }}
          className="min-w-0 flex-1 accent-brand-green"
          aria-label="Wild to tidy"
        />
        <span>Tidy</span>
      </label>
    </div>
  );
}

// Backs the camera off on narrow (portrait) screens so the crown fits across.
function CameraFit() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => {
    const visibleHeightPerUnit = 2 * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
    const distance = Math.max(CAMERA_DISTANCE, SCENE_WIDTH / (visibleHeightPerUnit * aspect));
    camera.position.set(0, GEN_HEIGHT * 1.6, distance);
  }, [camera, aspect]);
  return null;
}

interface SceneProps {
  sim: TreeSimulation;
  tree: Tree;
  palette: Palette;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSettledChange: (settled: boolean) => void;
}

function Scene({ sim, tree, palette, selectedId, onSelect, onSettledChange }: SceneProps) {
  const meshes = useRef<(Mesh | null)[]>([]);
  const label = useRef<Group>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const settledRef = useRef<boolean | null>(null);

  const edges = useMemo(() => buildEdgeObjects(sim.links, palette), [sim, palette]);
  useEffect(() => () => { edges.dispose(); }, [edges]);

  useFrame(() => {
    if (!sim.settled()) sim.simulation.tick(TICKS_PER_FRAME);
    sim.nodes.forEach((n, i) => { meshes.current[i]?.position.set(n.x, n.y, n.z); });
    if (hovered !== null && label.current) {
      const n = sim.nodes[hovered];
      label.current.position.set(n.x, n.y + SPHERE_RADIUS * 2, n.z);
    }
    edges.update();
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
        const color =
          n.id === selectedId ? palette.selected : n.onTrunkLine ? palette.trunk : palette.person;
        return (
          <mesh
            key={n.id}
            ref={(m) => { meshes.current[i] = m; }}
            position={[n.x, n.y, n.z]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(n.id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(i);
            }}
            onPointerOut={() => { setHovered((h) => (h === i ? null : h)); }}
          >
            <sphereGeometry args={[n.id === tree.rootId ? SPHERE_RADIUS * 1.6 : SPHERE_RADIUS, 16, 12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
        );
      })}
      {hovered !== null ? (
        <group ref={label}>
          <Html center className="pointer-events-none">
            <div className="whitespace-nowrap rounded-md border border-border-default bg-surface-elevated px-2 py-1 text-xs text-text-primary">
              {fullName(tree.persons[sim.nodes[hovered].id])}
            </div>
          </Html>
        </group>
      ) : null}
    </>
  );
}

interface EdgeObjects {
  objects: LineSegments[];
  update: () => void;
  dispose: () => void;
}

function isTrunkEdge(l: TreeSimLink): boolean {
  return l.kind === "parent" && l.source.onTrunkLine && l.target.onTrunkLine;
}

function buildEdgeObjects(links: TreeSimLink[], palette: Palette): EdgeObjects {
  const styles: { matches: (l: TreeSimLink) => boolean; material: LineBasicMaterial }[] = [
    { matches: isTrunkEdge, material: new LineBasicMaterial({ color: palette.trunk }) },
    {
      matches: (l) => l.kind === "parent" && !isTrunkEdge(l),
      material: new LineBasicMaterial({ color: palette.branch, transparent: true, opacity: 0.7 }),
    },
    { matches: (l) => l.kind === "union", material: new LineBasicMaterial({ color: palette.union }) },
    {
      matches: (l) => l.kind === "ex-union",
      material: new LineDashedMaterial({ color: palette.exUnion, dashSize: 3, gapSize: 3 }),
    },
  ];
  const groups = styles.map(({ matches, material }) => {
    const subset = links.filter(matches);
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
        subset.forEach((l, i) => {
          positions.setXYZ(i * 2, l.source.x, l.source.y, l.source.z);
          positions.setXYZ(i * 2 + 1, l.target.x, l.target.y, l.target.z);
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
