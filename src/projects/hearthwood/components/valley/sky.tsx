"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, DoubleSide, BufferAttribute, BufferGeometry, Color, MeshBasicMaterial, ShaderMaterial, SphereGeometry, Vector3, type Mesh } from "three";
import { createRng } from "@/shared/lib/seeded-random";
import { gradientNoise, fbm } from "../../world/noise";
import type { AtmosphereUniforms } from "./atmosphere";

/*
 * The sky: a dome round the camera, from the haze at the horizon (so the
 * land melts into it) up to the moment's own sky overhead, with a soft sun,
 * a moon, and stars that come out as the light goes. Beyond the valley's rim,
 * two rings of far mountains stand as flat silhouettes in the haze, for depth
 * at the cost of a few hundred triangles.
 */

const DOME_RADIUS = 1200;

export interface SkyUniforms {
  uSky: { value: Color };
  uMoonDir: { value: Vector3 };
  uNight: { value: number };
  uSunDisc: { value: Color };
  uMoon: { value: Color };
  uStar: { value: Color };
}

export function makeSkyUniforms(): SkyUniforms {
  return {
    uSky: { value: new Color() },
    uMoonDir: { value: new Vector3(0, 1, 0) },
    uNight: { value: 0 },
    uSunDisc: { value: new Color() },
    uMoon: { value: new Color() },
    uStar: { value: new Color() },
  };
}

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  // On the far plane, and drawn after everything else, so it only fills what nothing covers.
  gl_Position.z = gl_Position.w;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uHwHaze;
uniform vec3 uHwSunColor;
uniform vec3 uHwSunDir;
uniform float uHwTime;
uniform vec3 uSky;
uniform vec3 uMoonDir;
uniform float uNight;
uniform vec3 uSunDisc;
uniform vec3 uMoon;
uniform vec3 uStar;
varying vec3 vDir;

float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main() {
  vec3 dir = normalize(vDir);
  float up = max(dir.y, 0.0);
  vec3 colour = mix(uHwHaze, uSky, pow(smoothstep(0.0, 0.75, up), 0.7));
  float toSun = max(dot(dir, uHwSunDir), 0.0);
  float sunUp = smoothstep(-0.12, 0.1, uHwSunDir.y);
  colour += uHwSunColor * (0.35 * pow(toSun, 8.0) + 0.25 * pow(toSun, 64.0)) * sunUp;
  colour = mix(colour, uSunDisc * 3.0, smoothstep(0.9993, 0.9996, toSun) * sunUp);

  float toMoon = max(dot(dir, uMoonDir), 0.0);
  colour += uMoon * 0.12 * pow(toMoon, 30.0) * uNight;
  colour = mix(colour, uMoon * 1.4, smoothstep(0.99955, 0.9998, toMoon) * uNight * smoothstep(-0.02, 0.05, uMoonDir.y));

  vec3 cell = floor(dir * 220.0);
  float star = hash3(cell);
  vec3 centre = (cell + 0.5 + 0.3 * (vec3(hash3(cell + 1.0), hash3(cell + 2.0), hash3(cell + 3.0)) - 0.5)) / 220.0;
  float spot = smoothstep(0.0026, 0.0, length(dir - normalize(centre)));
  float twinkle = 0.7 + 0.3 * sin(uHwTime * (1.5 + 3.0 * star) + star * 40.0);
  colour += uStar * spot * step(0.986, star) * twinkle * uNight * smoothstep(0.02, 0.25, up) * (0.6 + 2.0 * (star - 0.986) / 0.014);

  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function ridgeGeometry(seed: string, radius: number, low: number, high: number): BufferGeometry {
  const noise = gradientNoise(`${seed}/far-ridge/${radius}`);
  const rng = createRng(`${seed}/far-ridge/${radius}`);
  const segments = 160;
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const offset = rng.next() * 100;
  for (let s = 0; s <= segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const peak = 0.5 + 0.5 * fbm(noise, Math.cos(angle) * 2.2 + offset, Math.sin(angle) * 2.2, 4);
    const top = low + (high - low) * peak * peak;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    positions.set([x, -30, z, x, top, z], s * 6);
  }
  const indices: number[] = [];
  for (let s = 0; s < segments; s++) {
    const a = s * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** The far ridges' colours: the nearer ring a little more itself, the further almost all haze. */
export interface RidgeColours {
  near: Color;
  far: Color;
}

export function Sky({ seed, atmosphere, sky, ridges }: { seed: string; atmosphere: AtmosphereUniforms; sky: SkyUniforms; ridges: RidgeColours }) {
  const dome = useRef<Mesh>(null);
  const assets = useMemo(() => {
    const material = new ShaderMaterial({
      uniforms: { ...atmosphere, ...sky },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: BackSide,
      depthWrite: false,
    });
    // The ridges' materials hold the shared colours themselves, so the daylight's changes to them show.
    const nearMaterial = new MeshBasicMaterial({ side: DoubleSide });
    nearMaterial.color = ridges.near;
    const farMaterial = new MeshBasicMaterial({ side: DoubleSide });
    farMaterial.color = ridges.far;
    return {
      geometry: new SphereGeometry(DOME_RADIUS, 32, 16),
      material,
      nearRidge: ridgeGeometry(seed, 560, 50, 170),
      farRidge: ridgeGeometry(seed, 760, 90, 260),
      nearMaterial,
      farMaterial,
    };
  }, [seed, atmosphere, sky, ridges]);
  useEffect(
    () => () => {
      for (const thing of Object.values(assets)) thing.dispose();
    },
    [assets],
  );
  useFrame(({ camera }) => {
    dome.current?.position.copy(camera.position);
  });
  return (
    <>
      <mesh ref={dome} geometry={assets.geometry} material={assets.material} renderOrder={100} frustumCulled={false} />
      <mesh geometry={assets.farRidge} material={assets.farMaterial} />
      <mesh geometry={assets.nearRidge} material={assets.nearMaterial} />
    </>
  );
}
