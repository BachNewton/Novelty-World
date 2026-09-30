"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BackSide,
  Color,
  Float32BufferAttribute,
  MathUtils,
  Object3D,
  SphereGeometry,
  type Group,
  type InstancedMesh,
  type Material,
} from "three";
import { cloudPlace, clouds } from "../../world/scenery";
import type { WorldPalette } from "./world-assets";

// The sky is a dome around the camera that goes wherever it goes, so it never
// runs out: warm haze at the horizon, the same colour as the fog, rising to
// clear blue overhead, with a blocky low sun.
const SKY_RADIUS = 900;
// How high up the dome the haze has turned fully to blue, as a share of the
// way from horizon to zenith, and how quickly.
const SKY_BLEND_HEIGHT = 0.55;
const SKY_BLEND_CURVE = 0.7;
const SUN_DISTANCE = 850;
const SUN_SIZE = 56;
const SUN_AZIMUTH = MathUtils.degToRad(22);
const SUN_ELEVATION = MathUtils.degToRad(8);
// The sky writes no depth, so its layers are painted in this order, behind
// everything: dome, then halo, then sun. Left to the renderer, the order
// among equal render orders would come down to when each material happened
// to be created.
const RENDER_ORDER = { dome: -3, halo: -2, sun: -1 };

function skyGeometry(horizon: Color, zenith: Color): SphereGeometry {
  const geometry = new SphereGeometry(SKY_RADIUS, 24, 16);
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    const up = Math.max(0, position.getY(i) / SKY_RADIUS);
    const blend = Math.min(1, up / SKY_BLEND_HEIGHT) ** SKY_BLEND_CURVE;
    color.copy(horizon).lerp(zenith, blend);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

export function Sky({ palette }: { palette: WorldPalette }) {
  const geometry = useMemo(() => skyGeometry(palette["sky-horizon"], palette["sky-zenith"]), [palette]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  const groupRef = useRef<Group>(null);
  const sunRef = useRef<Group>(null);
  useLayoutEffect(() => {
    const sun = sunRef.current;
    if (sun === null) return;
    const flat = SUN_DISTANCE * Math.cos(SUN_ELEVATION);
    sun.position.set(flat * Math.sin(SUN_AZIMUTH), SUN_DISTANCE * Math.sin(SUN_ELEVATION), -flat * Math.cos(SUN_AZIMUTH));
    sun.lookAt(0, 0, 0);
  }, []);
  useFrame(({ camera }) => {
    groupRef.current?.position.copy(camera.position);
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry} renderOrder={RENDER_ORDER.dome}>
        <meshBasicMaterial vertexColors side={BackSide} fog={false} depthWrite={false} />
      </mesh>
      <group ref={sunRef}>
        <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, -2]} renderOrder={RENDER_ORDER.halo}>
          <planeGeometry args={[SUN_SIZE * 1.5, SUN_SIZE * 1.5]} />
          <meshBasicMaterial color={palette["sun-halo"]} fog={false} depthWrite={false} />
        </mesh>
        <mesh renderOrder={RENDER_ORDER.sun}>
          <planeGeometry args={[SUN_SIZE, SUN_SIZE]} />
          <meshBasicMaterial color={palette.sun} fog={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// Chunky clouds drifting slowly across the sky, their field following the
// camera along the road.
export function Clouds({ seed, palette, material }: { seed: number; palette: WorldPalette; material: Material }) {
  const field = useMemo(() => clouds(seed), [seed]);
  const count = field.reduce((sum, cloud) => sum + cloud.boxes.length, 0);
  const placer = useMemo(() => new Object3D(), []);
  const meshRef = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    let i = 0;
    for (const cloud of field) {
      for (const b of cloud.boxes) mesh.setColorAt(i++, palette[b.paint]);
    }
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  }, [field, palette]);
  useFrame(({ camera, clock }) => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    let i = 0;
    for (const cloud of field) {
      const { x, depth } = cloudPlace(cloud, clock.elapsedTime, -camera.position.z);
      for (const b of cloud.boxes) {
        placer.position.set(x + b.center[0], cloud.y + b.center[1], -depth + b.center[2]);
        placer.scale.set(...b.size);
        placer.updateMatrix();
        mesh.setMatrixAt(i++, placer.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, material, count]} frustumCulled={false}>
      <boxGeometry />
    </instancedMesh>
  );
}
