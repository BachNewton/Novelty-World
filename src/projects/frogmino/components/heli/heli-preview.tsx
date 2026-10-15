"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import type { Group, PerspectiveCamera as PerspectiveCameraImpl } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { FROG_VARIANTS } from "../../frog/look";
import { BOB, DECK_CENTRE, bob } from "../../heli/flight";
import { PREVIEW_PIECES, startPoses } from "../../world/preview-rows";
import { CAMERA_FAR, CAMERA_NEAR } from "../camera-fit";
import { makeFrogAssets } from "../frog/frog-assets";
import { FrogBody } from "../frog/frog-body";
import { HeliBody } from "./heli-body";

// `?heli`: the Lily Lifter, the helicopter every course starts from, alone
// with its two passengers on a turntable, in three-quarter view, bobbing as
// it hovers, for judging its art. The game shows its flight.

const LANES = 10;
const MIDDLE = (LANES - 1) / 2;
const FOV = 35;
const SPEED = 0.35;
// The whole craft, rotors and tails included, fits in a sphere this big
// about the deck's middle.
const RADIUS = 10.5;
const VIEW = [0, 0.45, 1] as const;
const DEGREES = 180 / Math.PI;

function Turntable() {
  const background = useMemo(() => themeColor("--color-surface-tertiary"), []);
  const frogAssets = useMemo(() => makeFrogAssets(), []);
  useEffect(
    () => () => {
      frogAssets.dispose();
    },
    [frogAssets],
  );
  const poses = useMemo(() => startPoses(LANES, PREVIEW_PIECES), []);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const camera = useRef<PerspectiveCameraImpl>(null);
  const spin = useRef<Group>(null);
  const hover = useRef<Group>(null);

  const horizontalFov = 2 * Math.atan(Math.tan(FOV / 2 / DEGREES) * aspect) * DEGREES;
  const distance = RADIUS / Math.sin(Math.min(FOV, horizontalFov) / 2 / DEGREES);
  const along = Math.hypot(...VIEW);
  const position = VIEW.map((axis) => (axis / along) * distance) as [number, number, number];

  useEffect(() => {
    camera.current?.lookAt(0, 0, 0);
  });
  useFrame(({ clock }, delta) => {
    if (spin.current) spin.current.rotation.y += SPEED * delta;
    if (hover.current) hover.current.position.y = bob(clock.elapsedTime) - BOB;
  });

  return (
    <>
      <color attach="background" args={[background]} />
      <PerspectiveCamera ref={camera} makeDefault position={position} fov={FOV} near={CAMERA_NEAR} far={CAMERA_FAR} />
      <group ref={spin}>
        <group ref={hover} position={[-MIDDLE, 0, 1.5]}>
          <HeliBody lanes={LANES} />
          {/* The frogs stand in the deck's middle, as aboard in the game. */}
          <group position={[0, 0, DECK_CENTRE]}>
            {poses.map((frog, i) => (
              <group key={i} position={[frog.col - 0.5, frog.height, 0]}>
                <FrogBody kind={frog.kind} rotation={frog.rotation} variant={FROG_VARIANTS[i]} seed={i} assets={frogAssets} />
              </group>
            ))}
          </group>
        </group>
      </group>
    </>
  );
}

export function HeliPreview() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-surface-primary">
      <div className="absolute inset-0">
        <Canvas flat>
          <ambientLight intensity={1.5} />
          <directionalLight position={[4, 10, 6]} intensity={1.8} />
          <Turntable />
        </Canvas>
      </div>
      <div className="pointer-events-none absolute inset-x-4 top-4">
        <div className="inline-block rounded-lg bg-surface-secondary/80 px-3 py-1.5">
          <h1 className="text-xl font-bold text-brand-green">
            Frogmino <span className="text-sm font-normal text-text-secondary">the Lily Lifter</span>
          </h1>
        </div>
      </div>
    </div>
  );
}
