"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Cat } from "../../cats/cat";
import { coatLook } from "../../cats/coat-look";
import { catPose, motionSeed, type Activity } from "../../cats/motion";
import { rigOf } from "../../cats/rig";
import { loadCatGeometry, readyCatGeometry } from "./cat-geometry";
import { SkinnedCat } from "./skinned-cat";

/*
 * One cat, drawn and moving: its sculpture skinned to its own skeleton, its
 * coat's shader, and its motion posed each frame from its clock. Whoever
 * places it moves and turns the group; the cat walks on the spot at `speed`
 * and does what `activity` says.
 */

export interface CatBodyProps {
  cat: Cat;
  activity?: Activity;
  /** Walking speed in world metres a second, while walking. */
  speed?: number;
  /** Tail up in greeting. */
  greeting?: boolean;
  /** The clock in seconds; the scene's own by default. A fixed clock freezes the cat. */
  clock?: () => number;
  /** A soft shadow on the ground beneath it (default on). */
  shadow?: boolean;
  position?: readonly [number, number, number];
  rotation?: number;
  children?: ReactNode;
}

/** Seconds the tail takes to rise or fall in greeting. */
const GREETING_TIME = 0.7;

function shadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColour: { value: themeColor("--color-hearthwood-cat-shadow") } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      varying vec2 vUv;
      void main() {
        float d = length(vUv);
        gl_FragColor = vec4(uColour, 0.42 * smoothstep(1.0, 0.15, d));
      }`,
  });
}

/** The cat's geometry once its worker has meshed it; until then null. A failed mesh throws here, loudly. */
function useCatGeometry(longHair: boolean): THREE.BufferGeometry | null {
  const [loaded, setLoaded] = useState<{ longHair: boolean; geometry: THREE.BufferGeometry } | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  useEffect(() => {
    let live = true;
    loadCatGeometry(longHair).then(
      (geometry) => live && setLoaded({ longHair, geometry }),
      (error: unknown) => live && setFailure(error instanceof Error ? error : new Error(String(error))),
    );
    return () => {
      live = false;
    };
  }, [longHair]);
  if (failure) throw failure;
  return readyCatGeometry(longHair) ?? (loaded?.longHair === longHair ? loaded.geometry : null);
}

export function CatBody(props: CatBodyProps) {
  const geometry = useCatGeometry(props.cat.coat.longHair);
  return geometry ? <PosedCat {...props} geometry={geometry} /> : null;
}

function PosedCat({ cat, activity = "stand", speed = 0.5, greeting = false, clock, shadow = true, position, rotation = 0, children, geometry }: CatBodyProps & { geometry: THREE.BufferGeometry }) {
  const rig = useMemo(() => rigOf(cat.build), [cat.build]);
  const seed = useMemo(() => motionSeed(cat.seed), [cat.seed]);
  const skinned = useMemo(() => new SkinnedCat(geometry, coatLook(cat.coat), rig), [geometry, cat.coat, rig]);
  const shadowMat = useMemo(() => shadowMaterial(), []);
  const shadowRef = useRef<THREE.Mesh>(null);
  useEffect(() => () => skinned.dispose(), [skinned]);
  useEffect(() => () => shadowMat.dispose(), [shadowMat]);

  const state = useRef({ activity, previous: activity, since: -Infinity, greeting, greetingSince: -Infinity, travelled: 0, last: null as number | null });

  useFrame((frame, delta) => {
    const now = clock ? clock() : frame.clock.elapsedTime + (seed % 1000) / 37;
    const s = state.current;
    if (s.activity !== activity) {
      s.previous = s.activity;
      s.activity = activity;
      s.since = now;
    }
    if (s.greeting !== greeting) {
      s.greeting = greeting;
      s.greetingSince = now;
    }
    const size = cat.build.size;
    // With a clock of its own the walk is a function of it; with the scene's, the stride follows the distance covered.
    const travelled = clock ? (now * speed) / size : (s.travelled += (activity === "walk" ? speed * delta : 0) / size);
    const rise = Math.min(1, Math.max(0, (now - s.greetingSince) / GREETING_TIME));
    const pose = catPose({
      time: now,
      travelled,
      speed: speed / size,
      activity,
      previous: s.previous,
      since: s.since,
      greeting: greeting ? rise : 1 - rise,
      personality: cat.personality,
      rig,
      seed,
    });
    skinned.pose(pose);
    if (shadowRef.current) shadowRef.current.position.z = pose.pelvis[2] + 0.12;
  });

  const { size, stockiness } = cat.build;
  return (
    <group position={position as [number, number, number] | undefined} rotation={[0, rotation, 0]}>
      <group scale={[size * stockiness, size, size]}>
        <primitive object={skinned.mesh} />
        {shadow && (
          <mesh ref={shadowRef} geometry={SHADOW_PLANE} material={shadowMat} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.22, 0.42, 1]} renderOrder={-1} />
        )}
      </group>
      {children}
    </group>
  );
}

const SHADOW_PLANE = new THREE.PlaneGeometry(1, 1);
