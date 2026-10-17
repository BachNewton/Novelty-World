"use client";

import { useEffect, useMemo } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial } from "three";
import type { AtmosphereUniforms } from "./atmosphere";
import type { Palette } from "./palette";
import type { SkyUniforms } from "./sky";

/*
 * Fireflies drifting and blinking where they are put (x, y, z each), out
 * only as the light goes.
 */

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

function fireflyGeometry(spots: Float32Array): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(spots, 3));
  const seeds = new Float32Array(spots.length / 3);
  // Each its own phase and pace: the golden ratio's steps spread them evenly over 0 to 1.
  for (let f = 0; f < seeds.length; f++) seeds[f] = (f * 0.6180339887) % 1;
  geometry.setAttribute("seed", new BufferAttribute(seeds, 1));
  return geometry;
}

export function Fireflies({ spots, palette, atmosphere, sky }: { spots: Float32Array; palette: Palette; atmosphere: AtmosphereUniforms; sky: SkyUniforms }) {
  const assets = useMemo(
    () => ({
      geometry: fireflyGeometry(spots),
      material: new ShaderMaterial({
        uniforms: { uHwTime: atmosphere.uHwTime, uNight: sky.uNight, uGlow: { value: new Color().copy(palette.things.firefly) } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    }),
    [spots, palette, atmosphere, sky],
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
