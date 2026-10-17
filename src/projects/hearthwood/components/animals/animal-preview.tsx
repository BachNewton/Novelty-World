"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { Armchair, ArrowLeft, BedDouble, Dices, Footprints, Hand, PersonStanding, Rabbit, RotateCw, Rows3, Squirrel, Wind } from "lucide-react";
import { themeColor } from "@/shared/lib/three/theme-color";
import { generateCat, type Cat } from "../../cats/cat";
import { coatName } from "../../cats/genetics";
import type { Activity as CatActivity } from "../../cats/motion";
import { generateDog, kindOf, type Dog } from "../../dogs/dog";
import { coatName as dogCoatName } from "../../dogs/genetics";
import type { DogActivity } from "../../dogs/motion";
import { CatBody } from "../cats/cat-body";
import { DogBody } from "../dogs/dog-body";

// The animals preview (`?cats`): a meadow of generated cats and dogs to judge
// their art by. Reroll for a new field; line the dogs up to compare their
// builds; pick an animal to see it alone on a turntable, in each of its
// species' activities, greeting or not.

type Placed =
  | { kind: "cat"; cat: Cat; activity: CatActivity; at: [number, number]; facing: number; greeting: boolean; circle: number; speed: number }
  | { kind: "dog"; dog: Dog; activity: DogActivity; at: [number, number]; facing: number; greeting: boolean; circle: number; speed: number };

type Mode = "field" | "lineup";

const FIELD_SIZE = 13;
const LINEUP_SIZE = 5;
const CAT_ACTIVITIES: readonly CatActivity[] = ["stand", "walk", "sit", "loaf"];
const DOG_ACTIVITIES: readonly DogActivity[] = ["stand", "walk", "trot", "run", "sit", "lie"];

function catActivity(cat: Cat): CatActivity {
  const { energy, boldness } = cat.personality;
  return energy > 0.35 ? "walk" : energy < -0.4 ? "loaf" : boldness < -0.2 ? "sit" : "stand";
}

function dogActivity(dog: Dog): DogActivity {
  const { playfulness, boldness } = dog.personality;
  return playfulness > 0.8 ? "trot" : playfulness > 0.4 ? "walk" : playfulness < -0.45 ? "lie" : boldness < -0.25 ? "sit" : "stand";
}

function placeAt(i: number): { at: [number, number]; facing: number } {
  const ring = i === 0 ? 0 : i < 5 ? 1.15 : 2.3;
  const angle = i * 2.39996 + (i % 2) * 0.4;
  return { at: [Math.cos(angle) * ring, Math.sin(angle) * ring], facing: angle * 1.7 + i };
}

function animalAt(seed: string, i: number): Placed {
  const place = placeAt(i);
  // About half and half, a dog first so the middle of every field has one.
  if (i % 2 === 0) {
    const dog = generateDog(`${seed}-dog-${i}`);
    const activity = dogActivity(dog);
    return {
      kind: "dog",
      dog,
      activity,
      ...place,
      greeting: dog.personality.affection > 0.35 && activity !== "lie",
      circle: activity === "trot" ? 0.85 : 0.55,
      speed: (activity === "trot" ? 1.5 : 0.75) * (0.6 + dog.build.size * 0.25),
    };
  }
  const cat = generateCat(`${seed}-${i}`);
  const activity = catActivity(cat);
  return {
    kind: "cat",
    cat,
    activity,
    ...place,
    greeting: cat.personality.affection > 0.4 && activity !== "loaf",
    circle: 0.35 + (i % 3) * 0.12,
    speed: 0.28 + (cat.personality.energy + 1) * 0.12,
  };
}

function fieldOf(seed: string): Placed[] {
  return Array.from({ length: FIELD_SIZE }, (_, i) => animalAt(seed, i));
}

/** Dogs side by side, facing the same way, to compare their builds. */
function lineupOf(seed: string): Placed[] {
  return Array.from({ length: LINEUP_SIZE }, (_, i) => {
    const dog = generateDog(`${seed}-line-${i}`);
    return { kind: "dog", dog, activity: "stand", at: [(i - (LINEUP_SIZE - 1) / 2) * 1.3, 0], facing: Math.PI / 2, greeting: false, circle: 0, speed: 0 };
  });
}

const nameOf = (p: Placed) => (p.kind === "cat" ? coatName(p.cat.coat) : dogCoatName(p.dog.coat));
const moving = (p: Placed) => p.activity === "walk" || p.activity === "trot" || p.activity === "run";

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

function Lights() {
  const colours = useMemo(
    () => ({
      key: themeColor("--color-hearthwood-preview-key"),
      fill: themeColor("--color-hearthwood-preview-fill"),
      sky: themeColor("--color-hearthwood-preview-ambient-sky"),
      ground: themeColor("--color-hearthwood-preview-ambient-ground"),
    }),
    [],
  );
  return (
    <>
      <hemisphereLight args={[colours.sky, colours.ground, 1.5]} />
      <directionalLight color={colours.key} intensity={2.4} position={[2.5, 4, 3]} />
      <directionalLight color={colours.fill} intensity={0.7} position={[-3, 1.5, -2]} />
    </>
  );
}

function Meadow() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMeadow: { value: themeColor("--color-hearthwood-preview-meadow") },
          uEdge: { value: themeColor("--color-hearthwood-preview-meadow-edge") },
          uSky: { value: themeColor("--color-hearthwood-preview-sky") },
        },
        vertexShader: /* glsl */ `
          varying vec2 vXZ;
          void main() {
            vXZ = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uMeadow;
          uniform vec3 uEdge;
          uniform vec3 uSky;
          varying vec2 vXZ;
          void main() {
            float r = length(vXZ);
            vec3 grass = mix(uMeadow, uEdge, smoothstep(2.5, 5.5, r));
            gl_FragColor = vec4(mix(grass, uSky, smoothstep(5.5, 12.0, r)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <circleGeometry args={[14, 64]} />
    </mesh>
  );
}

/** One animal of either species, drawn where it is told. */
function Body({ placed, clock, activity, greeting, speed, position, rotation }: { placed: Placed; clock: PreviewClock; activity?: string; greeting: boolean; speed?: number; position?: [number, number, number]; rotation?: number }) {
  const common = { greeting, clock: clock.now, speed, position, rotation };
  return placed.kind === "cat" ? (
    <CatBody cat={placed.cat} activity={(activity as CatActivity | undefined) ?? placed.activity} {...common} />
  ) : (
    <DogBody dog={placed.dog} activity={(activity as DogActivity | undefined) ?? placed.activity} {...common} />
  );
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
          <Walker key={`${placed.kind}-${i}`} placed={placed} clock={clock} onPick={() => onPick(i)} />
        ) : (
          <group key={`${placed.kind}-${i}`} onClick={() => onPick(i)}>
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
    if (object instanceof THREE.SkinnedMesh) count += 1;
  });
  return count;
}

/** The camera's default for each view: the field, the line-up, or one animal of a size. */
function cameraFor(view: "field" | "lineup" | "focus", aspect: number, size: number): { from: THREE.Vector3; target: THREE.Vector3 } {
  // A narrow screen stands further back and looks further down, so the scene fills its height.
  const narrow = Math.max(1, 1.5 / aspect);
  if (view === "focus") return { from: new THREE.Vector3(0.75, 0.42, 0.95).multiplyScalar(size * narrow ** 0.6), target: new THREE.Vector3(0, 0.2 * size, 0) };
  if (view === "lineup") return { from: new THREE.Vector3(0, 0.8, 6.8).multiplyScalar(narrow ** 0.9), target: new THREE.Vector3(0, 0.32, 0) };
  return { from: new THREE.Vector3(4.4, 3.9 * narrow ** 0.5, 6.6).multiplyScalar(narrow ** 0.55), target: new THREE.Vector3(0, 0.2, 0) };
}

/** Hands the camera to the control surface, and points it at the field, the line-up or the one animal. */
function CameraRig({ view, size, controls, onCamera }: { view: "field" | "lineup" | "focus"; size: number; controls: React.RefObject<OrbitControlsImpl | null>; onCamera: (camera: THREE.Camera) => void }) {
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

function Trait({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1" title={label}>
      <span className="sr-only">{label}</span>
      <div className="relative h-1.5 w-12 rounded-sm bg-surface-elevated">
        <div className="absolute top-0 h-1.5 w-1.5 rounded-sm bg-brand-orange" style={{ left: `${((value + 1) / 2) * 100}%`, transform: "translateX(-50%)" }} />
      </div>
    </div>
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
};

function Details({ placed }: { placed: Placed }) {
  if (placed.kind === "cat") {
    const { cat } = placed;
    return (
      <>
        <span className="text-sm">
          {coatName(cat.coat)} {cat.sex === "female" ? "♀" : "♂"}
        </span>
        <div className="flex gap-2">
          <Trait label="Shy to bold" value={cat.personality.boldness} />
          <Trait label="Lazy to busy" value={cat.personality.energy} />
          <Trait label="Aloof to cuddly" value={cat.personality.affection} />
        </div>
      </>
    );
  }
  const { dog } = placed;
  return (
    <>
      <span className="text-sm">
        {dogCoatName(dog.coat)} {dog.sex === "female" ? "♀" : "♂"}
      </span>
      <span className="text-xs text-text-secondary">{kindOf(dog)}</span>
      <div className="flex gap-2">
        <Trait label="Shy to bold" value={dog.personality.boldness} />
        <Trait label="Calm to playful" value={dog.personality.playfulness} />
        <Trait label="Independent to cuddly" value={dog.personality.affection} />
      </div>
    </>
  );
}

export function AnimalPreview() {
  const [seed, setSeed] = useState("hearthwood");
  const [mode, setMode] = useState<Mode>("field");
  const animals = useMemo(() => (mode === "field" ? fieldOf(seed) : lineupOf(seed)), [seed, mode]);
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
  const size = chosen ? (chosen.kind === "cat" ? chosen.cat.build.size : chosen.dog.build.size) : 1;

  useEffect(() => {
    const activities = (p: Placed): readonly string[] => (p.kind === "cat" ? CAT_ACTIVITIES : DOG_ACTIVITIES);
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
        if (chosen && !activities(chosen).includes(next)) throw new Error(`A ${chosen.kind} can't ${next}`);
        setActivity(next);
      },
      setGreeting,
      setTurntable,
      setView: (azimuth, elevation, distance, face = false) => {
        const target = controls.current?.target ?? new THREE.Vector3();
        if (chosen) {
          if (face) target.set(0, (chosen.kind === "cat" ? 0.33 : 0.36) * size, (chosen.kind === "cat" ? 0.22 : 0.25) * size);
          else target.set(0, 0.2 * size, 0);
        }
        const a = (azimuth * Math.PI) / 180;
        const e = (elevation * Math.PI) / 180;
        const d = distance * (chosen ? size : 1);
        camera.current?.position.set(target.x + Math.sin(a) * Math.cos(e) * d, target.y + Math.sin(e) * d, target.z + Math.cos(a) * Math.cos(e) * d);
        controls.current?.update();
      },
      animals: () => animals.map((p) => (p.kind === "cat" ? `cat: ${nameOf(p)} (${p.cat.sex}, ${p.activity})` : `dog: ${nameOf(p)}, ${kindOf(p.dog)}, ${p.dog.ears} ears, ${p.dog.tail} tail, ${p.dog.coat.length} coat, size ${p.dog.build.size.toFixed(2)} (${p.dog.sex}, ${p.activity})`)),
    };
    return () => {
      delete window.__hearthwoodAnimals;
    };
  }, [clock, animals, chosen, size, seed]);

  const sky = useMemo(() => themeColor("--color-hearthwood-preview-sky"), []);
  const activities = chosen ? (chosen.kind === "cat" ? CAT_ACTIVITIES : DOG_ACTIVITIES) : [];

  return (
    <div className="relative h-dvh w-full" data-testid="hearthwood-animals">
      <Canvas dpr={[1, 2]} camera={{ fov: 35, near: 0.05, far: 80 }} gl={{ toneMapping: THREE.NeutralToneMapping }} onCreated={({ scene }) => (scene.background = sky)}>
        <Lights />
        <Meadow />
        {chosen ? (
          <Body key={`${chosen.kind}-${focus}`} placed={chosen} clock={clock} activity={activity} greeting={greeting} speed={chosen.kind === "cat" ? 0.45 : { walk: 0.9, trot: 1.8, run: 3.6 }[activity] ?? 0.9} />
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
            <Details placed={chosen} />
          </div>
        )}
        <div className="pointer-events-auto flex gap-2">
          {!chosen && (
            <IconButton label="Line the dogs up" active={mode === "lineup"} onClick={() => setMode(mode === "lineup" ? "field" : "lineup")}>
              <Rows3 size={20} />
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
          <IconButton label={chosen.kind === "cat" ? "Tail up in greeting" : "Happy greeting"} active={greeting} onClick={() => setGreeting(!greeting)}>
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
