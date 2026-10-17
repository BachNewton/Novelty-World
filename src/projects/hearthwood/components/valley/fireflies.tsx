"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial } from "three";
import { createRng, uniform } from "@/shared/lib/seeded-random";
import { sample } from "../../world/grid";
import type { Valley } from "../../world/valley";
import type { AtmosphereUniforms } from "./atmosphere";
import type { Palette } from "./palette";
import type { SkyUniforms } from "./sky";

/*
 * Fireflies over the meadows round camp and along the lake shore, drifting
 * and blinking, out only as the light goes.
 */

const FIREFLIES = 160;

const VERTEX = /* glsl */ `
uniform float uHwTime;
attribute float seed;
varying float vBlink;
void main() {
  float t = uHwTime * (0.25 + 0.2 * seed) + seed * 50.0;
  vec3 p = position + vec3(sin(t) * 1.6, sin(t * 1.7 + seed * 9.0) * 0.5, cos(t * 0.8) * 1.6);
  vBlink = smoothstep(0.3, 1.0, sin(uHwTime * (1.2 + seed) + seed * 31.0));
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(55.0 / -view.z, 1.5, 14.0);
  gl_Position = projectionMatrix * view;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uGlow;
uniform float uNight;
varying float vBlink;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vBlink * uNight;
  gl_FragColor = vec4(uGlow * a * 1.6, a);
}
`;

function fireflySpots(valley: Valley): BufferGeometry {
  const rng = createRng(`${valley.seed}/fireflies`);
  const { camp, lake, heights } = valley;
  const positions = new Float32Array(FIREFLIES * 3);
  const seeds = new Float32Array(FIREFLIES);
  for (let f = 0; f < FIREFLIES; f++) {
    const byLake = f % 3 === 0;
    const angle = rng.next() * Math.PI * 2;
    const reach = byLake ? lake.radius * lake.shoreAt(angle) * uniform(rng, 1.02, 1.3) : uniform(rng, 5, 45);
    const x = (byLake ? lake.x : camp.x) + Math.cos(angle) * reach;
    const z = (byLake ? lake.z : camp.z) + Math.sin(angle) * reach;
    positions.set([x, Math.max(0, sample(heights, x, z)) + uniform(rng, 0.5, 2.2), z], f * 3);
    seeds[f] = rng.next();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("seed", new BufferAttribute(seeds, 1));
  return geometry;
}

export function Fireflies({ valley, palette, atmosphere, sky }: { valley: Valley; palette: Palette; atmosphere: AtmosphereUniforms; sky: SkyUniforms }) {
  const assets = useMemo(
    () => ({
      geometry: fireflySpots(valley),
      material: new ShaderMaterial({
        uniforms: { uHwTime: atmosphere.uHwTime, uNight: sky.uNight, uGlow: { value: new Color().copy(palette.things.firefly) } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    }),
    [valley, palette, atmosphere, sky],
  );
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  return <points geometry={assets.geometry} material={assets.material} frustumCulled={false} renderOrder={3} />;
}
