"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, Matrix3, SphereGeometry, Vector3, type Mesh } from "three";
import type { AtmosphereUniforms } from "../atmosphere";
import type { Palette } from "../palette";
import { shadeCustom } from "../shading";

/*
 * The sky's dome round the camera. On its own it is the plain sky: from the
 * haze at the horizon (so the land melts into it) up to the moment's own sky
 * overhead, with a soft sun. Everything else drawn in it is a feature at
 * its colour hook (see `features/sky-and-light.ts`): the physical sky, the
 * moon, the stars, the Milky Way, the aurora, noctilucent clouds and the
 * rainbow, each in a file of its own beside this one.
 */

const DOME_RADIUS = 1200;

export interface SkyUniforms {
  /** The sky overhead: what the water mirrors. */
  uSky: { value: Color };
  /** Where the sun is, day or night (the key light, `uHwSunDir`, is the moon's by night). */
  uSunDir: { value: Vector3 };
  uMoonDir: { value: Vector3 };
  /** How much of the night sky shows: fireflies over the meadow. */
  uNight: { value: number };
  uSunDisc: { value: Color };
  /** The sphere of the stars: its columns are the celestial axes (the March equinox's point, right ascension 90°, the pole) in the world's. */
  uCelestial: { value: Matrix3 };
  /** How wide a pixel is, in radians: what the sky draws round to, so nothing in it is finer than a pixel. */
  uSkyPixel: { value: number };
}

export function makeSkyUniforms(palette: Palette): SkyUniforms {
  return {
    uSky: { value: new Color() },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uMoonDir: { value: new Vector3(0, 1, 0) },
    uNight: { value: 0 },
    uSunDisc: { value: palette.things["sun-disc"].clone() },
    uCelestial: { value: new Matrix3() },
    uSkyPixel: { value: 0.001 },
  };
}

const VERTEX = /* glsl */ `
#include <hw_vertex_head>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vHwWorld = world.xyz;
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
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunDisc;
uniform mat3 uCelestial;
uniform float uSkyPixel;
#include <hw_fragment_head>

void main() {
  vec3 dir = normalize(vHwWorld - cameraPosition);
  float up = max(dir.y, 0.0);
  vec3 colour = mix(uHwHaze, uSky, pow(smoothstep(0.0, 0.75, up), 0.7));
  float toSun = max(dot(dir, uSunDir), 0.0);
  float sunUp = smoothstep(-0.12, 0.1, uSunDir.y);
  colour += uHwSunColor * (0.35 * pow(toSun, 8.0) + 0.25 * pow(toSun, 64.0)) * sunUp;
  colour = mix(colour, uSunDisc * 3.0, smoothstep(0.9993, 0.9996, toSun) * sunUp);

  vec3 hwColour = colour;
  #include <hw_colour>
  gl_FragColor = vec4(hwColour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function Sky({ atmosphere, sky }: { atmosphere: AtmosphereUniforms; sky: SkyUniforms }) {
  const dome = useRef<Mesh>(null);
  const assets = useMemo(
    () => ({
      geometry: new SphereGeometry(DOME_RADIUS, 64, 32),
      material: shadeCustom("sky", atmosphere, {
        uniforms: { ...sky },
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
