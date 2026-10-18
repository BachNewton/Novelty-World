"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { Armchair, ArrowUp, Bird, Eye, Feather, Sprout, TreePine, ArrowLeft, BedDouble, Dices, Footprints, Hand, PawPrint, PersonStanding, Rabbit, RotateCw, Rows3, Squirrel, Wind, Zap } from "lucide-react";
import { themeColor } from "@/shared/lib/three/theme-color";
import { EVERY_SPECIES, shownCat, shownDog, type Shown } from "./preview-species";
import { makeAtmosphere } from "../../art/atmosphere";
import { Daylight } from "../../art/light/daylight";
import { readPalette } from "../../art/palette";
import { FrameCosts } from "../../art/passes";
import { shadeLambert } from "../../art/shading";
import { makeSkyUniforms, Sky } from "../../art/sky/sky";
import { parseDate } from "../../engine/calendar";
import { makeClock } from "../valley/clock";
import { FeatureRenderer } from "../valley/feature-renderer";

// The animals preview (`?cats`): a meadow of generated cats and dogs to judge
// their art by, and every other species beside them. Reroll for a new field;
// line the dogs up to compare their builds, or every species to compare them
// all; pick an animal to see it alone on a turntable, in each of its
// species' activities, greeting or not.

interface Placed {
  shown: Shown;
  activity: string;
  at: [number, number];
  facing: number;
  greeting: boolean;
  circle: number;
  speed: number;
}

type Mode = "field" | "lineup" | "everyone";

const FIELD_SIZE = 13;
const LINEUP_SIZE = 5;

function placeAt(i: number): { at: [number, number]; facing: number } {
  const ring = i === 0 ? 0 : i < 5 ? 1.15 : 2.3;
  const angle = i * 2.39996 + (i % 2) * 0.4;
  return { at: [Math.cos(angle) * ring, Math.sin(angle) * ring], facing: angle * 1.7 + i };
}

function animalAt(seed: string, i: number): Placed {
  const place = placeAt(i);
  // About half and half, a dog first so the middle of every field has one.
  const shown = i % 2 === 0 ? shownDog(`${seed}-dog-${i}`) : shownCat(`${seed}-${i}`);
  const activity = shown.idle;
  return { shown, activity, ...place, greeting: shown.greets, circle: shown.species === "dog" ? (activity === "trot" ? 0.85 : 0.55) : 0.35 + (i % 3) * 0.12, speed: shown.fieldSpeed };
}

function fieldOf(seed: string): Placed[] {
  return Array.from({ length: FIELD_SIZE }, (_, i) => animalAt(seed, i));
}

/** Dogs side by side, facing the same way, to compare their builds. */
function lineupOf(seed: string): Placed[] {
  return Array.from({ length: LINEUP_SIZE }, (_, i) => ({ shown: shownDog(`${seed}-line-${i}`), activity: "stand", at: [(i - (LINEUP_SIZE - 1) / 2) * 1.3, 0], facing: Math.PI / 2, greeting: false, circle: 0, speed: 0 }));
}

/** One of every species side by side, each spaced by its size, to see them all together. */
function everyoneOf(seed: string): Placed[] {
  const shown = EVERY_SPECIES.map((make, i) => make(`${seed}-every-${i}`));
  const widths = shown.map((s) => 0.35 + s.size * 0.42);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  return shown.map((s, i) => {
    const at: [number, number] = [x + widths[i] / 2, 0];
    x += widths[i];
    return { shown: s, activity: s.activities.includes("stand") ? "stand" : s.activities[0], at, facing: Math.PI / 2, greeting: false, circle: 0, speed: 0 };
  });
}

const nameOf = (p: Placed) => p.shown.name;
const moving = (p: Placed) => p.shown.moving(p.activity);

/** The preview's clock: live, or frozen at a moment for screenshots. */
interface PreviewClock {
  frozen: number | null;
  now: () => number;
}

interface PreviewControl {
  /** Every body of what is shown now is in the scene and has been drawn. */
  isReady: () => boolean;
  /** The seed of what is shown now. */
  seed: () => string;
  frameCount: () => number;
  freeze: (time: number | null) => void;
  setSeed: (seed: string) => void;
  setMode: (mode: Mode) => void;
  focus: (index: number | null) => void;
  /** An activity of the focused animal's species; anything else is refused loudly. */
  setActivity: (activity: string) => void;
  setGreeting: (on: boolean) => void;
  setTurntable: (on: boolean) => void;
  /** Puts the camera at an angle round its target (degrees), a height angle (degrees) and a distance (metres),
   *  looking at the animal's middle, or at its face with `face`. */
  setView: (azimuth: number, elevation: number, distance: number, face?: boolean) => void;
  animals: () => string[];
  /** The activities the animal at an index has. */
  activitiesOf: (index: number) => readonly string[];
}

declare global {
  interface Window {
    __hearthwoodAnimals?: PreviewControl;
  }
}

/** A clock that starts at its first reading. */
function previewClock(): PreviewClock {
  let start: number | null = null;
  const clock: PreviewClock = {
    frozen: null,
    now: () => {
      start ??= performance.now();
      return clock.frozen ?? (performance.now() - start) / 1000;
    },
  };
  return clock;
}

/**
 * The preview's stage, lit by the game's own day as the gallery is: its light and sky held at an autumn-equinox
 * afternoon, its features' frame (the coat is a shared material, drawn through it), and a meadow underfoot.
 */
function PreviewStage() {
  const stage = useMemo(() => {
    const palette = readPalette();
    const ground = (token: string) => shadeLambert(new THREE.MeshLambertMaterial({ color: themeColor(token) }), "ground", PREVIEW_AIR);
    return {
      palette,
      sky: makeSkyUniforms(palette),
      clock: makeClock(15.5, parseDate("mabon")),
      focus: { x: 0, y: 0, z: 0 },
      air: { thickness: 0.25 },
      costs: new FrameCosts(),
      meadow: ground("--color-hearthwood-preview-meadow"),
      edge: ground("--color-hearthwood-preview-meadow-edge"),
      inner: new THREE.CircleGeometry(5, 64).rotateX(-Math.PI / 2),
      outer: new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2),
    };
  }, []);
  useEffect(
    () => () => {
      for (const a of [stage.meadow, stage.edge, stage.inner, stage.outer]) a.dispose();
    },
    [stage],
  );
  return (
    <>
      <Daylight day={stage.clock} palette={stage.palette} atmosphere={PREVIEW_AIR} sky={stage.sky} focus={stage.focus} air={stage.air} />
      <Sky atmosphere={PREVIEW_AIR} sky={stage.sky} />
      <FeatureRenderer day={stage.clock} atmosphere={PREVIEW_AIR} sky={stage.sky} costs={stage.costs} />
      <mesh geometry={stage.inner} material={stage.meadow} receiveShadow position={[0, 0.005, 0]} />
      <mesh geometry={stage.outer} material={stage.edge} receiveShadow />
    </>
  );
}

/** The air the animals are drawn in, which the game's day moves. */
const PREVIEW_AIR = makeAtmosphere();

/** One animal of any species, drawn where it is told. */
function Body({ placed, clock, activity, greeting, speed, position, rotation }: { placed: Placed; clock: PreviewClock; activity?: string; greeting: boolean; speed?: number; position?: [number, number, number]; rotation?: number }) {
  return placed.shown.body({ activity: activity ?? placed.activity, greeting, clock: clock.now, speed, position, rotation, atmosphere: PREVIEW_AIR });
}

/** An animal going round a circle at its own pace. */
function Walker({ placed, clock, onPick }: { placed: Placed; clock: PreviewClock; onPick: () => void }) {
  const group = useRef<THREE.Group>(null);
  const rate = placed.speed / placed.circle;
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const angle = placed.facing + clock.now() * rate;
    g.position.set(placed.at[0] + Math.cos(angle) * placed.circle, 0, placed.at[1] + Math.sin(angle) * placed.circle);
    // Facing along the circle, anticlockwise seen from above.
    g.rotation.y = -angle + Math.PI;
  });
  return (
    <group ref={group} onClick={onPick}>
      <Body placed={placed} clock={clock} greeting={placed.greeting} speed={placed.speed} />
    </group>
  );
}

function Field({ field, clock, onPick }: { field: Placed[]; clock: PreviewClock; onPick: (index: number) => void }) {
  return (
    <>
      {field.map((placed, i) =>
        moving(placed) ? (
          <Walker key={`${placed.shown.species}-${i}`} placed={placed} clock={clock} onPick={() => onPick(i)} />
        ) : (
          <group key={`${placed.shown.species}-${i}`} onClick={() => onPick(i)}>
            <Body placed={placed} clock={clock} greeting={placed.greeting} position={[placed.at[0], 0, placed.at[1]]} rotation={placed.facing} />
          </group>
        ),
      )}
    </>
  );
}

function Frames({ onFrame }: { onFrame: (scene: THREE.Scene) => void }) {
  useFrame(({ scene }) => onFrame(scene));
  return null;
}

/** How many animals' bodies the scene holds. */
function bodiesIn(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((object) => {
    // A skinned animal, or a songbird (rigid parts, marked by whoever draws it).
    if (object instanceof THREE.SkinnedMesh || object.userData.previewBody === true) count += 1;
  });
  return count;
}

/** The camera's default for each view: the field, the line-up, or one animal of a size. */
function cameraFor(view: Mode | "focus", aspect: number, size: number): { from: THREE.Vector3; target: THREE.Vector3 } {
  // A narrow screen stands further back and looks further down, so the scene fills its height.
  const narrow = Math.max(1, 1.5 / aspect);
  if (view === "focus") return { from: new THREE.Vector3(0.75, 0.42, 0.95).multiplyScalar(size * narrow ** 0.6), target: new THREE.Vector3(0, 0.2 * size, 0) };
  if (view === "lineup") return { from: new THREE.Vector3(0, 0.8, 6.8).multiplyScalar(narrow ** 0.9), target: new THREE.Vector3(0, 0.32, 0) };
  if (view === "everyone") return { from: new THREE.Vector3(0, 1.4, 11).multiplyScalar(narrow ** 0.9), target: new THREE.Vector3(0, 0.35, 0) };
  return { from: new THREE.Vector3(4.4, 3.9 * narrow ** 0.5, 6.6).multiplyScalar(narrow ** 0.55), target: new THREE.Vector3(0, 0.2, 0) };
}

/** Hands the camera to the control surface, and points it at the field, the line-up or the one animal. */
function CameraRig({ view, size, controls, onCamera }: { view: Mode | "focus"; size: number; controls: React.RefObject<OrbitControlsImpl | null>; onCamera: (camera: THREE.Camera) => void }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => {
    onCamera(camera);
  }, [camera, onCamera]);
  useEffect(() => {
    const { from, target } = cameraFor(view, aspect, size);
    camera.position.copy(from);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [view, size, camera, controls, aspect]);
  return null;
}

function IconButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-md border ${active ? "border-brand-orange bg-surface-elevated text-brand-orange" : "border-border-default bg-surface-secondary text-text-primary"}`}
    >
      {children}
    </button>
  );
}

const ACTIVITY_BUTTONS: Record<string, { label: string; icon: ReactNode }> = {
  stand: { label: "Stand", icon: <PersonStanding size={20} /> },
  walk: { label: "Walk", icon: <Footprints size={20} /> },
  trot: { label: "Trot", icon: <Rabbit size={20} /> },
  run: { label: "Run", icon: <Wind size={20} /> },
  sit: { label: "Sit", icon: <Armchair size={20} /> },
  loaf: { label: "Loaf", icon: <Squirrel size={20} /> },
  lie: { label: "Lie down", icon: <BedDouble size={20} /> },
  pounce: { label: "Pounce", icon: <Zap size={20} /> },
  graze: { label: "Graze", icon: <Sprout size={20} /> },
  perch: { label: "Perch", icon: <Bird size={20} /> },
  hop: { label: "Hop and peck", icon: <Footprints size={20} /> },
  fly: { label: "Fly", icon: <Feather size={20} /> },
  peek: { label: "Peek out", icon: <Eye size={20} /> },
  climb: { label: "Climb", icon: <ArrowUp size={20} /> },
  cling: { label: "Cling to a trunk", icon: <TreePine size={20} /> },
};

export function AnimalPreview() {
  const [seed, setSeed] = useState("hearthwood");
  const [mode, setMode] = useState<Mode>("field");
  const animals = useMemo(() => (mode === "field" ? fieldOf(seed) : mode === "lineup" ? lineupOf(seed) : everyoneOf(seed)), [seed, mode]);
  const [focus, setFocus] = useState<number | null>(null);
  const [activity, setActivity] = useState<string>("stand");
  const [greeting, setGreeting] = useState(false);
  const [turntable, setTurntable] = useState(false);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const camera = useRef<THREE.Camera | null>(null);
  const frames = useRef(0);
  const bodies = useRef(0);
  const clock = useMemo(() => previewClock(), []);
  const chosen = focus === null ? null : (animals[focus] ?? null);
  const size = chosen ? chosen.shown.size : 1;

  useEffect(() => {
    // Ready once a frame drawn after this was shown holds every body, not only once they are meshed.
    const shownAt = frames.current;
    window.__hearthwoodAnimals = {
      isReady: () => frames.current > shownAt + 1 && bodies.current === (chosen ? 1 : animals.length),
      seed: () => seed,
      frameCount: () => frames.current,
      freeze: (time) => {
        clock.frozen = time;
      },
      setSeed,
      setMode: (next) => {
        setFocus(null);
        setMode(next);
      },
      focus: (index) => {
        setFocus(index);
        if (index !== null) setActivity(animals[index].activity);
      },
      setActivity: (next) => {
        if (chosen && !chosen.shown.activities.includes(next)) throw new Error(`A ${chosen.shown.species} can't ${next}`);
        setActivity(next);
      },
      setGreeting,
      setTurntable,
      setView: (azimuth, elevation, distance, face = false) => {
        const target = controls.current?.target ?? new THREE.Vector3();
        if (chosen) {
          if (face) target.set(0, chosen.shown.face[0] * size, chosen.shown.face[1] * size);
          else target.set(0, 0.2 * size, 0);
        }
        const a = (azimuth * Math.PI) / 180;
        const e = (elevation * Math.PI) / 180;
        const d = distance * (chosen ? size : 1);
        camera.current?.position.set(target.x + Math.sin(a) * Math.cos(e) * d, target.y + Math.sin(e) * d, target.z + Math.cos(a) * Math.cos(e) * d);
        controls.current?.update();
      },
      animals: () => animals.map((p) => p.shown.describe),
      activitiesOf: (index) => animals[index].shown.activities,
    };
    return () => {
      delete window.__hearthwoodAnimals;
    };
  }, [clock, animals, chosen, size, seed]);

  const activities = chosen ? chosen.shown.activities : [];

  return (
    <div className="relative h-dvh w-full" data-testid="hearthwood-animals">
      <Canvas dpr={[1, 2]} camera={{ fov: 35, near: 0.05, far: 4000 }} gl={{ antialias: true, reversedDepthBuffer: true }}>
        <PreviewStage />
        {chosen ? (
          <Body key={`${chosen.shown.species}-${focus}`} placed={chosen} clock={clock} activity={activity} greeting={greeting} speed={chosen.shown.speed(activity)} />
        ) : mode === "field" ? (
          <Field
            field={animals}
            clock={clock}
            onPick={(i) => {
              setFocus(i);
              setActivity(animals[i].activity);
              setGreeting(animals[i].greeting);
            }}
          />
        ) : (
          animals.map((p, i) => (
            <group key={i} onClick={() => setFocus(i)}>
              <Body placed={p} clock={clock} greeting={false} position={[p.at[0], 0, p.at[1]]} rotation={p.facing} />
            </group>
          ))
        )}
        <OrbitControls ref={controls} makeDefault enableDamping={false} autoRotate={turntable} autoRotateSpeed={1.5} maxPolarAngle={Math.PI * 0.48} minDistance={0.3} maxDistance={14} />
        <CameraRig view={chosen ? "focus" : mode} size={size} controls={controls} onCamera={(c) => (camera.current = c)} />
        <Frames
          onFrame={(scene) => {
            frames.current += 1;
            bodies.current = bodiesIn(scene);
          }}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto">
          {chosen && (
            <IconButton label="Back" onClick={() => setFocus(null)}>
              <ArrowLeft size={20} />
            </IconButton>
          )}
        </div>
        {chosen && (
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-md bg-surface-secondary/80 px-3 py-2 text-text-primary" title={nameOf(chosen)}>
            {chosen.shown.details()}
          </div>
        )}
        <div className="pointer-events-auto flex gap-2">
          {!chosen && (
            <IconButton label="Line the dogs up" active={mode === "lineup"} onClick={() => setMode(mode === "lineup" ? "field" : "lineup")}>
              <Rows3 size={20} />
            </IconButton>
          )}
          {!chosen && (
            <IconButton label="Every species side by side" active={mode === "everyone"} onClick={() => setMode(mode === "everyone" ? "field" : "everyone")}>
              <PawPrint size={20} />
            </IconButton>
          )}
          <IconButton
            label="New animals"
            onClick={() => {
              setFocus(null);
              setSeed(`field-${Math.floor(Math.random() * 1e9)}`);
            }}
          >
            <Dices size={20} />
          </IconButton>
        </div>
      </div>

      {chosen && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 p-3">
          {activities.map((a) => (
            <IconButton key={a} label={ACTIVITY_BUTTONS[a].label} active={activity === a} onClick={() => setActivity(a)}>
              {ACTIVITY_BUTTONS[a].icon}
            </IconButton>
          ))}
          <IconButton label="Greeting" active={greeting} onClick={() => setGreeting(!greeting)}>
            <Hand size={20} />
          </IconButton>
          <IconButton label="Turntable" active={turntable} onClick={() => setTurntable(!turntable)}>
            <RotateCw size={20} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
