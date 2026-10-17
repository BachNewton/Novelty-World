"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, ShaderMaterial, SphereGeometry, Vector3, type Mesh } from "three";
import type { AtmosphereUniforms } from "./atmosphere";
import type { Palette } from "./palette";

/*
 * The sky: a dome round the camera, from the haze at the horizon (so the
 * land melts into it) up to the moment's own sky overhead, with a soft sun,
 * a moon, and stars that come out as the light goes.
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

export function makeSkyUniforms(palette: Palette): SkyUniforms {
  return {
    uSky: { value: new Color() },
    uMoonDir: { value: new Vector3(0, 1, 0) },
    uNight: { value: 0 },
    uSunDisc: { value: palette.things["sun-disc"].clone() },
    uMoon: { value: palette.things.moon.clone() },
    uStar: { value: palette.things.star.clone() },
  };
}

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  // On the far plane, and drawn after everything else, so it only fills what nothing covers.
  #ifdef USE_REVERSED_DEPTH_BUFFER
    gl_Position.z = 0.0;
  #else
    gl_Position.z = gl_Position.w;
  #endif
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

export function Sky({ atmosphere, sky }: { atmosphere: AtmosphereUniforms; sky: SkyUniforms }) {
  const dome = useRef<Mesh>(null);
  const assets = useMemo(
    () => ({
      geometry: new SphereGeometry(DOME_RADIUS, 32, 16),
      material: new ShaderMaterial({
        uniforms: { ...atmosphere, ...sky },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: BackSide,
        depthWrite: false,
      }),
    }),
    [atmosphere, sky],
  );
  useEffect(
    () => () => {
      assets.geometry.dispose();
      assets.material.dispose();
    },
    [assets],
  );
  useFrame(({ camera }) => {
    dome.current?.position.copy(camera.position);
  });
  return <mesh ref={dome} geometry={assets.geometry} material={assets.material} renderOrder={100} frustumCulled={false} />;
}
