"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Mesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { Gate } from "../types";
import { GATE_TOKENS, gapBox, gateParts, type GatePaint, type GatePart } from "./gate-parts";

// A gate as drawn, in its row's frame (see `gate-parts.ts`): the gantry, and
// a faint shimmer of light drifting across the gap, which never hides the fit.

const SHIMMER_STRIPS = 4;
const SHIMMER_WIDTH = 0.05;
const SHIMMER_OPACITY = 0.3;
// How long a strip takes to drift across the gap, in seconds.
const SHIMMER_PERIOD = 2.4;
// The shimmer hangs a little way into the gap, behind the fit outline on the
// row's face.
const SHIMMER_DEPTH = 0.5;

export function makeGateAssets() {
  const materials = Object.fromEntries(
    (Object.keys(GATE_TOKENS) as GatePaint[]).map((paint) => [paint, new MeshLambertMaterial({ color: themeColor(GATE_TOKENS[paint]) })]),
  ) as Record<GatePaint, MeshLambertMaterial>;
  const shimmer = new MeshBasicMaterial({
    color: themeColor("--color-frogmino-gate-shimmer"),
    transparent: true,
    opacity: SHIMMER_OPACITY,
    depthWrite: false,
    side: DoubleSide,
  });
  const strip = new PlaneGeometry(1, 1);
  return {
    materials,
    shimmer,
    strip,
    dispose() {
      Object.values(materials).forEach((material) => {
        material.dispose();
      });
      shimmer.dispose();
      strip.dispose();
    },
  };
}

export type GateAssets = ReturnType<typeof makeGateAssets>;

// A gate's parts merged into one geometry per paint, so a gate is a handful
// of draw calls.
function mergedByPaint(parts: readonly GatePart[]): { paint: GatePaint; geometry: BufferGeometry }[] {
  const byPaint = new Map<GatePaint, BufferGeometry[]>();
  for (const p of parts) {
    const geometry = new BoxGeometry(...p.size);
    geometry.applyMatrix4(
      new Matrix4().compose(new Vector3(...p.center), new Quaternion().setFromEuler(new Euler(0, 0, p.roll)), new Vector3(1, 1, 1)),
    );
    byPaint.set(p.paint, [...(byPaint.get(p.paint) ?? []), geometry]);
  }
  return [...byPaint].map(([paint, geometries]) => {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((g) => {
      g.dispose();
    });
    return { paint, geometry };
  });
}

export function GateView({ gate, assets }: { gate: Gate; assets: GateAssets }) {
  const merged = useMemo(() => mergedByPaint(gateParts(gate)), [gate]);
  useEffect(
    () => () => {
      merged.forEach(({ geometry }) => {
        geometry.dispose();
      });
    },
    [merged],
  );
  const gap = gapBox(gate);
  const strips = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    strips.current.forEach((strip, i) => {
      if (strip === null) return;
      const along = (clock.elapsedTime / SHIMMER_PERIOD + i / SHIMMER_STRIPS) % 1;
      strip.position.x = gap.x0 + SHIMMER_WIDTH / 2 + along * (gap.x1 - gap.x0 - SHIMMER_WIDTH);
    });
  });

  return (
    <group>
      {merged.map(({ paint, geometry }) => (
        <mesh key={paint} geometry={geometry} material={assets.materials[paint]} />
      ))}
      {Array.from({ length: SHIMMER_STRIPS }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            strips.current[i] = mesh;
          }}
          geometry={assets.strip}
          material={assets.shimmer}
          position={[gap.x0, (gap.y0 + gap.y1) / 2, -SHIMMER_DEPTH]}
          scale={[SHIMMER_WIDTH, gap.y1 - gap.y0, 1]}
        />
      ))}
    </group>
  );
}
