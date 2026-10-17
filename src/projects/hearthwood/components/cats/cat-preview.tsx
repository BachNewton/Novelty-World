"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { Armchair, ArrowLeft, Dices, Footprints, Hand, PersonStanding, RotateCw, Squirrel } from "lucide-react";
import { themeColor } from "@/shared/lib/three/theme-color";
import { generateCat, type Cat } from "../../cats/cat";
import { coatName } from "../../cats/genetics";
import type { Activity } from "../../cats/motion";
import { CatBody } from "./cat-body";
import { readyCatGeometry } from "./cat-geometry";

// The cat preview (`?cats`): a meadow of generated cats to judge the cats'
// art by. Reroll for a new field; pick a cat to see it alone on a turntable,
// standing, walking, sitting or loafing, with its tail up in greeting.

const FIELD_SIZE = 9;

interface Placed {
  cat: Cat;
  at: [number, number];
  facing: number;
  activity: Activity;
  greeting: boolean;
  /** A walker goes round a circle this big, the way it faces. */
  circle: number;
}

function fieldOf(seed: string): Placed[] {
  return Array.from({ length: FIELD_SIZE }, (_, i) => {
    const cat = generateCat(`${seed}-${i}`);
    const { energy, boldness, affection } = cat.personality;
    const ring = i === 0 ? 0 : i < 4 ? 0.85 : 1.6;
    const angle = i * 2.39996 + (i % 2) * 0.4;
    const activity: Activity = energy > 0.35 ? "walk" : energy < -0.4 ? "loaf" : boldness < -0.2 ? "sit" : "stand";
    return {
      cat,
      at: [Math.cos(angle) * ring, Math.sin(angle) * ring],
      facing: angle * 1.7 + i,
      activity,
      greeting: affection > 0.4 && activity !== "loaf",
      circle: 0.35 + (i % 3) * 0.12,
    };
  });
}

/** The preview's clock: live, or frozen at a moment for screenshots. */
interface PreviewClock {
  frozen: number | null;
  now: () => number;
}

interface PreviewControl {
  isReady: () => boolean;
  frameCount: () => number;
  freeze: (time: number | null) => void;
  setSeed: (seed: string) => void;
  focus: (index: number | null) => void;
  setActivity: (activity: Activity) => void;
  setGreeting: (on: boolean) => void;
  setTurntable: (on: boolean) => void;
  /** Puts the camera at an angle round its target (degrees), a height angle (degrees) and a distance (metres),
   *  looking at the cat's middle, or at its face with `face`. */
  setView: (azimuth: number, elevation: number, distance: number, face?: boolean) => void;
  cats: () => string[];
}

declare global {
  interface Window {
    __hearthwoodCats?: PreviewControl;
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
            vec3 grass = mix(uMeadow, uEdge, smoothstep(1.5, 4.0, r));
            gl_FragColor = vec4(mix(grass, uSky, smoothstep(4.0, 9.0, r)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <circleGeometry args={[10, 64]} />
    </mesh>
  );
}

/** A cat going round a little circle at its own pace. */
function Walker({ placed, clock, onPick }: { placed: Placed; clock: PreviewClock; onPick: () => void }) {
  const group = useRef<THREE.Group>(null);
  const speed = 0.28 + (placed.cat.personality.energy + 1) * 0.12;
  const rate = speed / placed.circle;
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
      <CatBody cat={placed.cat} activity="walk" speed={speed} greeting={placed.greeting} clock={clock.now} />
    </group>
  );
}

function Field({ field, clock, onPick }: { field: Placed[]; clock: PreviewClock; onPick: (index: number) => void }) {
  return (
    <>
      {field.map((placed, i) =>
        placed.activity === "walk" ? (
          <Walker key={placed.cat.seed} placed={placed} clock={clock} onPick={() => onPick(i)} />
        ) : (
          <group key={placed.cat.seed} onClick={() => onPick(i)}>
            <CatBody cat={placed.cat} activity={placed.activity} greeting={placed.greeting} clock={clock.now} position={[placed.at[0], 0, placed.at[1]]} rotation={placed.facing} />
          </group>
        ),
      )}
    </>
  );
}

function Frames({ onFrame }: { onFrame: () => void }) {
  useFrame(onFrame);
  return null;
}

/** Hands the camera to the control surface, and points it at the field or the one cat. */
function CameraRig({ focused, controls, onCamera }: { focused: boolean; controls: React.RefObject<OrbitControlsImpl | null>; onCamera: (camera: THREE.Camera) => void }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => {
    onCamera(camera);
  }, [camera, onCamera]);
  useEffect(() => {
    const target = focused ? new THREE.Vector3(0, 0.2, 0) : new THREE.Vector3(0, 0.15, 0);
    // A narrow screen stands further back and looks further down, so the field fills its height.
    const narrow = Math.max(1, 1.5 / aspect);
    const from = focused ? new THREE.Vector3(0.75, 0.42, 0.95).multiplyScalar(narrow ** 0.6) : new THREE.Vector3(2.4, 2.0 * narrow ** 0.5, 3.6).multiplyScalar(narrow ** 0.55);
    camera.position.copy(from);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [focused, camera, controls, aspect]);
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

export function CatPreview() {
  const [seed, setSeed] = useState("hearthwood");
  const field = useMemo(() => fieldOf(seed), [seed]);
  const [focus, setFocus] = useState<number | null>(null);
  const [activity, setActivity] = useState<Activity>("stand");
  const [greeting, setGreeting] = useState(false);
  const [turntable, setTurntable] = useState(false);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const camera = useRef<THREE.Camera | null>(null);
  const frames = useRef(0);
  const clock = useMemo(() => previewClock(), []);

  useEffect(() => {
    window.__hearthwoodCats = {
      isReady: () => frames.current > 0 && field.every((p) => readyCatGeometry(p.cat.coat.longHair) !== null),
      frameCount: () => frames.current,
      freeze: (time) => {
        clock.frozen = time;
      },
      setSeed,
      focus: setFocus,
      setActivity,
      setGreeting,
      setTurntable,
      setView: (azimuth, elevation, distance, face = false) => {
        const target = controls.current?.target ?? new THREE.Vector3();
        if (face) target.set(0, 0.33, 0.22);
        else if (focus !== null) target.set(0, 0.2, 0);
        const a = (azimuth * Math.PI) / 180;
        const e = (elevation * Math.PI) / 180;
        camera.current?.position.set(target.x + Math.sin(a) * Math.cos(e) * distance, target.y + Math.sin(e) * distance, target.z + Math.cos(a) * Math.cos(e) * distance);
        controls.current?.update();
      },
      cats: () => field.map((p) => `${coatName(p.cat.coat)} (${p.cat.sex}, ${p.activity})`),
    };
    return () => {
      delete window.__hearthwoodCats;
    };
  }, [clock, field, focus]);

  const chosen = focus === null ? null : field[focus];
  const sky = useMemo(() => themeColor("--color-hearthwood-preview-sky"), []);

  return (
    <div className="relative h-dvh w-full" data-testid="hearthwood-cats">
      <Canvas dpr={[1, 2]} camera={{ fov: 35, near: 0.05, far: 60 }} gl={{ toneMapping: THREE.NeutralToneMapping }} onCreated={({ scene }) => (scene.background = sky)}>
        <Lights />
        <Meadow />
        {chosen ? (
          <CatBody key={chosen.cat.seed} cat={chosen.cat} activity={activity} speed={0.45} greeting={greeting} clock={clock.now} />
        ) : (
          <Field
            field={field}
            clock={clock}
            onPick={(i) => {
              setFocus(i);
              setActivity(field[i].activity);
              setGreeting(field[i].greeting);
            }}
          />
        )}
        <OrbitControls ref={controls} makeDefault enableDamping={false} autoRotate={turntable} autoRotateSpeed={1.5} maxPolarAngle={Math.PI * 0.48} minDistance={0.3} maxDistance={9} />
        <CameraRig focused={chosen !== null} controls={controls} onCamera={(c) => (camera.current = c)} />
        <Frames onFrame={() => (frames.current += 1)} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto">
          {chosen && (
            <IconButton label="Back to the field" onClick={() => setFocus(null)}>
              <ArrowLeft size={20} />
            </IconButton>
          )}
        </div>
        {chosen && (
          <div className="pointer-events-auto flex flex-col items-center gap-1 rounded-md bg-surface-secondary/80 px-3 py-2 text-text-primary" title={coatName(chosen.cat.coat)}>
            <span className="text-sm">
              {coatName(chosen.cat.coat)} {chosen.cat.sex === "female" ? "♀" : "♂"}
            </span>
            <div className="flex gap-2">
              <Trait label="Shy to bold" value={chosen.cat.personality.boldness} />
              <Trait label="Lazy to busy" value={chosen.cat.personality.energy} />
              <Trait label="Aloof to cuddly" value={chosen.cat.personality.affection} />
            </div>
          </div>
        )}
        <div className="pointer-events-auto">
          <IconButton
            label="New cats"
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
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3">
          <IconButton label="Stand" active={activity === "stand"} onClick={() => setActivity("stand")}>
            <PersonStanding size={20} />
          </IconButton>
          <IconButton label="Walk" active={activity === "walk"} onClick={() => setActivity("walk")}>
            <Footprints size={20} />
          </IconButton>
          <IconButton label="Sit" active={activity === "sit"} onClick={() => setActivity("sit")}>
            <Armchair size={20} />
          </IconButton>
          <IconButton label="Loaf" active={activity === "loaf"} onClick={() => setActivity("loaf")}>
            <Squirrel size={20} />
          </IconButton>
          <IconButton label="Tail up in greeting" active={greeting} onClick={() => setGreeting(!greeting)}>
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
