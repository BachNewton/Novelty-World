"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, ShaderMaterial } from "three";
import { sample } from "../../world/grid";
import type { Valley } from "../../world/valley";
import { WATER_LEVEL } from "../../world/water";
import { ATMOSPHERE_GLSL, type AtmosphereUniforms } from "./atmosphere";
import type { Palette } from "./palette";
import type { SkyUniforms } from "./sky";

/*
 * The lake and the stream, opaque (no blending, so no overdraw), each lit by
 * its own small shader: the lake shades from clear shallows to deep blue by
 * how far the bed lies below, rings its shore with a slow foam, and catches
 * the sky at a glancing angle and the sun in glints; the stream is a ribbon
 * along its channel whose streaks run downhill, white where it falls.
 */

const COMMON = /* glsl */ `
${ATMOSPHERE_GLSL}
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSky;

float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec3 waterSurface(vec3 base, vec3 world, vec2 ripple) {
  vec3 view = normalize(cameraPosition - world);
  vec3 normal = normalize(vec3(ripple.x, 1.0, ripple.y));
  float fresnel = pow(1.0 - max(dot(view, normal), 0.0), 3.0);
  vec3 lit = base * uHwLight;
  vec3 sky = mix(uHwHaze, uSky, 0.7) * mix(vec3(1.0), uHwLight, 0.5);
  vec3 colour = mix(lit, sky, 0.08 + 0.45 * fresnel);
  float glint = pow(max(dot(reflect(-view, normal), uHwSunDir), 0.0), 180.0) * smoothstep(-0.05, 0.1, uHwSunDir.y);
  return colour + uHwSunColor * glint * 2.2;
}
`;

const LAKE_VERTEX = /* glsl */ `
attribute float depth;
varying float vDepth;
varying vec3 vWorld;
void main() {
  vDepth = depth;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const LAKE_FRAGMENT = /* glsl */ `
${COMMON}
varying float vDepth;
varying vec3 vWorld;
void main() {
  float t = uHwTime;
  vec2 p = vWorld.xz;
  vec2 ripple = vec2(wNoise(p * 0.35 + vec2(t * 0.25, 0.0)) - 0.5, wNoise(p * 0.35 + vec2(0.0, t * 0.21) + 7.0) - 0.5) * 0.22;
  ripple += vec2(wNoise(p * 1.3 - t * 0.4) - 0.5, wNoise(p * 1.3 + 3.0 + t * 0.35) - 0.5) * 0.08;
  vec3 base = mix(uShallow, uDeep, smoothstep(0.05, 2.6, vDepth));
  vec3 colour = waterSurface(base, vWorld, ripple);
  float edge = 1.0 - smoothstep(0.0, 0.28 + 0.12 * sin(t * 0.8 + p.x * 0.3 + p.y * 0.2), vDepth);
  float lace = smoothstep(0.45, 0.75, wNoise(p * 2.2 + t * 0.15));
  colour = mix(colour, uFoam * uHwLight, edge * (0.5 + 0.5 * lace) * 0.85);
  gl_FragColor = vec4(hwAtmosphere(colour, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const STREAM_VERTEX = /* glsl */ `
attribute vec2 flow;
attribute float fall;
varying vec2 vFlow;
varying float vFall;
varying vec3 vWorld;
void main() {
  vFlow = flow;
  vFall = fall;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const STREAM_FRAGMENT = /* glsl */ `
${COMMON}
varying vec2 vFlow;
varying float vFall;
varying vec3 vWorld;
void main() {
  float t = uHwTime;
  float along = vFlow.x;
  float across = vFlow.y;
  float speed = 1.2 + 2.0 * min(vFall, 3.0);
  float streak = wNoise(vec2(along * 0.5 - t * speed, across * 3.0)) * wNoise(vec2(along * 1.4 - t * speed * 1.3, across * 6.0 + 4.0));
  vec2 ripple = vec2(wNoise(vec2(along * 0.8 - t * 2.0, across * 2.0)) - 0.5, wNoise(vec2(along * 0.7 - t * 1.6, across * 2.0 + 9.0)) - 0.5) * 0.35;
  vec3 colour = waterSurface(mix(uShallow, uDeep, 0.5), vWorld, ripple);
  float banks = smoothstep(0.65, 1.0, abs(across));
  float white = clamp(smoothstep(0.4, 0.65, streak) * 0.4 + banks * 0.25 + smoothstep(0.6, 1.8, vFall), 0.0, 1.0);
  colour = mix(colour, uFoam * uHwLight, white * 0.8);
  gl_FragColor = vec4(hwAtmosphere(colour, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function lakeGeometry(valley: Valley): BufferGeometry {
  const { heights, lake } = valley;
  const reach = lake.radius * 1.6;
  const step = heights.spacing;
  const across = Math.ceil((2 * reach) / step) + 1;
  const positions: number[] = [];
  const depths: number[] = [];
  for (let r = 0; r < across; r++) {
    for (let c = 0; c < across; c++) {
      const x = lake.x - reach + c * step;
      const z = lake.z - reach + r * step;
      positions.push(x, WATER_LEVEL, z);
      depths.push(WATER_LEVEL - sample(heights, x, z));
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < across - 1; r++) {
    for (let c = 0; c < across - 1; c++) {
      const a = r * across + c;
      const quad = [a, a + across, a + 1, a + across + 1];
      if (quad.every((i) => depths[i] < -0.4)) continue;
      indices.push(a, a + across, a + 1, a + 1, a + across, a + across + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("depth", new BufferAttribute(new Float32Array(depths), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const STREAM_LIFT = 0.04;

function streamGeometry(valley: Valley): BufferGeometry {
  const points = valley.stream.points.filter((p) => sample(valley.heights, p.x, p.z) > WATER_LEVEL - 0.6 || p.surface > WATER_LEVEL + 0.05);
  const positions: number[] = [];
  const flows: number[] = [];
  const falls: number[] = [];
  let along = 0;
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    const prev = points[Math.max(0, k - 1)];
    const next = points[Math.min(points.length - 1, k + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const length = Math.hypot(dx, dz) || 1;
    const width = p.halfWidth * 1.25;
    const nx = (-dz / length) * width;
    const nz = (dx / length) * width;
    if (k > 0) along += Math.hypot(p.x - prev.x, p.z - prev.z);
    const drop = Math.max(0, prev.surface - next.surface) / Math.max(1, Math.hypot(dx, dz));
    const y = p.surface + STREAM_LIFT;
    positions.push(p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz);
    flows.push(along, 1, along, -1);
    falls.push(drop, drop);
  }
  const indices: number[] = [];
  for (let k = 0; k < points.length - 1; k++) {
    const a = k * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("flow", new BufferAttribute(new Float32Array(flows), 2));
  geometry.setAttribute("fall", new BufferAttribute(new Float32Array(falls), 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function Water({ valley, palette, atmosphere, sky }: { valley: Valley; palette: Palette; atmosphere: AtmosphereUniforms; sky: SkyUniforms }) {
  const assets = useMemo(() => {
    const uniforms = {
      ...atmosphere,
      uSky: sky.uSky,
      uShallow: { value: new Color().copy(palette.things["water-shallow"]) },
      uDeep: { value: new Color().copy(palette.things["water-deep"]) },
      uFoam: { value: new Color().copy(palette.things["water-foam"]) },
    };
    return {
      lake: lakeGeometry(valley),
      stream: streamGeometry(valley),
      lakeMaterial: new ShaderMaterial({ uniforms, vertexShader: LAKE_VERTEX, fragmentShader: LAKE_FRAGMENT }),
      streamMaterial: new ShaderMaterial({ uniforms, vertexShader: STREAM_VERTEX, fragmentShader: STREAM_FRAGMENT, side: DoubleSide }),
    };
  }, [valley, palette, atmosphere, sky]);
  useEffect(
    () => () => {
      for (const thing of Object.values(assets)) thing.dispose();
    },
    [assets],
  );
  return (
    <>
      <mesh geometry={assets.lake} material={assets.lakeMaterial} />
      <mesh geometry={assets.stream} material={assets.streamMaterial} />
    </>
  );
}
