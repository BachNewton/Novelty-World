"use client";

import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Pose } from "../../animals/motion";
import type { AtmosphereUniforms } from "../../art/atmosphere";
import type { Rig } from "../../animals/rig";
import type { CoatUniforms } from "./coat-material";
import { SkinnedAnimal } from "./skinned-animal";

/*
 * One animal, drawn and moving: its species' sculpture skinned to its own
 * skeleton, its coat's shader, and its motion posed each frame from its clock.
 * Whoever places it moves and turns the group; the animal moves on the spot
 * at `speed` and does what `activity` says. A species' body (`CatBody`,
 * `DogBody`) gives this its geometry, coat and pose.
 */

/** Where the animal's clock stands this frame, for its species' pose. */
export interface MotionClock<A extends string> {
  time: number;
  /** How far it has moved, in its own metres (world metres over its size): the stride follows it. */
  travelled: number;
  /** In its own metres a second. */
  speed: number;
  activity: A;
  previous: A;
  since: number;
  /** How far into its greeting, 0 to 1. */
  greeting: number;
}

/** What the scene drives an animal with frame by frame, read each frame instead of the props, so moving one never re-renders it. */
export interface AnimalDrive<A extends string> {
  activity: A;
  /** In world metres a second. */
  speed: number;
  /** How far it has moved over the ground, in world metres: the stride follows it. */
  travelled: number;
  greeting: boolean;
}

/** What every species' body takes. */
export interface AnimalProps<A extends string> {
  activity?: A;
  /** Speed in world metres a second, while moving. */
  speed?: number;
  /** Greeting whoever is near: a cat's tail up, a dog's wag. */
  greeting?: boolean;
  /** The clock in seconds; the scene's own by default. A fixed clock freezes the animal. */
  clock?: () => number;
  /** The air it is drawn in, as every material in the world is. */
  atmosphere: AtmosphereUniforms;
  /** A soft shadow on the ground beneath it (default on). */
  shadow?: boolean;
  position?: readonly [number, number, number];
  rotation?: number;
  /** Driven from the scene each frame: overrides `activity`, `speed` and `greeting`. */
  drive?: RefObject<AnimalDrive<A>>;
  children?: ReactNode;
}

interface AnimalBodyProps<A extends string> extends AnimalProps<A> {
  activity: A;
  geometry: THREE.BufferGeometry;
  coat: () => { material: THREE.Material; uniforms: CoatUniforms };
  rig: Rig;
  /** The sculpture's scale in the world, and how much wider it is than that. */
  size: number;
  width: number;
  /** From the animal's seed, so no two animals' clocks start in step. */
  seed: number;
  /** Whether an activity moves over the ground, so the stride follows the distance. */
  moving: (activity: A) => boolean;
  pose: (clock: MotionClock<A>) => Pose;
  /** The blob shadow's size across and along, in the sculpture's metres, and where it centres behind the pelvis. */
  shadowSize: readonly [number, number];
  shadowAt: number;
  /** Seconds a greeting takes to come on or go. */
  greetingTime: number;
}

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

const SHADOW_PLANE = new THREE.PlaneGeometry(1, 1);

export function AnimalBody<A extends string>(props: AnimalBodyProps<A>) {
  const { clock, shadow = true, position, rotation = 0, drive, children, geometry, coat, rig, size, width, seed, moving, pose, shadowSize, shadowAt, greetingTime } = props;
  const skinned = useMemo(() => {
    const { material, uniforms } = coat();
    return new SkinnedAnimal(geometry, material, uniforms, rig);
  }, [geometry, coat, rig]);
  const shadowMat = useMemo(() => shadowMaterial(), []);
  const shadowRef = useRef<THREE.Mesh>(null);
  useEffect(() => () => skinned.dispose(), [skinned]);
  useEffect(() => () => shadowMat.dispose(), [shadowMat]);

  const first = drive?.current.activity ?? props.activity;
  const state = useRef({ activity: first, previous: first, since: -Infinity, greeting: drive?.current.greeting ?? props.greeting ?? false, greetingSince: -Infinity, travelled: 0 });

  useFrame((frame, delta) => {
    const driven = drive?.current;
    const activity = driven?.activity ?? props.activity;
    const speed = driven?.speed ?? props.speed ?? 0.5;
    const greeting = driven?.greeting ?? props.greeting ?? false;
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
    // Driven, the stride follows the distance the scene moved it; with a clock of its own it is a function of the clock; with the scene's, it follows the distance covered.
    const travelled = driven ? driven.travelled / size : clock ? (now * speed) / size : (s.travelled += (moving(activity) ? speed * delta : 0) / size);
    const rise = Math.min(1, Math.max(0, (now - s.greetingSince) / greetingTime));
    const posed = pose({ time: now, travelled, speed: speed / size, activity, previous: s.previous, since: s.since, greeting: greeting ? rise : 1 - rise });
    skinned.pose(posed);
    if (shadowRef.current) shadowRef.current.position.z = posed.pelvis[2] + shadowAt;
  });

  return (
    <group position={position as [number, number, number] | undefined} rotation={[0, rotation, 0]}>
      <group scale={[size * width, size, size]}>
        <primitive object={skinned.mesh} />
        {shadow && (
          <mesh ref={shadowRef} geometry={SHADOW_PLANE} material={shadowMat} position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[shadowSize[0], shadowSize[1], 1]} renderOrder={-1} />
        )}
      </group>
      {children}
    </group>
  );
}
