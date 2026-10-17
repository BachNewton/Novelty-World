"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Object3D, type DirectionalLight, type HemisphereLight, type WebGLRenderer } from "three";
import { blendAt, keyLight, moonDirection } from "../../world/day";
import type { AtmosphereUniforms } from "./atmosphere";
import { advanceClock, type ValleyClock } from "./clock";
import type { MomentPart, Palette } from "./palette";
import type { RidgeColours, SkyUniforms } from "./sky";

/*
 * The day's light, set each frame from the clock: the sun (or the moon) and
 * its shadows round the walker, the light from the sky and the ground, the
 * haze and the shadows' tint, the sky's colours and the camera's exposure.
 * Runs just after the walker moves and before everything else, so the rest
 * of the frame reads this frame's hour.
 */

export const DAYLIGHT_PRIORITY = -3;

/** How far round the walker the sun's shadows reach, in metres, and how fine their map is. */
const SHADOW_REACH = 42;
const SHADOW_MAP = 1024;
const HAZE_DENSITY = 0.0026;

export interface Focus {
  x: number;
  y: number;
  z: number;
}

interface DaylightParts {
  clock: ValleyClock;
  palette: Palette;
  atmosphere: AtmosphereUniforms;
  sky: SkyUniforms;
  ridges: RidgeColours;
  focus: Focus;
}

interface Lights {
  sun: DirectionalLight | null;
  ambient: HemisphereLight | null;
  target: Object3D;
  gl: WebGLRenderer;
  scratch: { a: Color; b: Color };
}

/** The sun's shadows cover a square round the walker, and follow her. */
function aimShadows(light: DirectionalLight, target: Object3D): void {
  light.target = target;
  const camera = light.shadow.camera;
  camera.left = -SHADOW_REACH;
  camera.right = SHADOW_REACH;
  camera.top = SHADOW_REACH;
  camera.bottom = -SHADOW_REACH;
  camera.near = 1;
  camera.far = 260;
  camera.updateProjectionMatrix();
}

function lightTheValley({ clock, palette, atmosphere, sky, ridges, focus }: DaylightParts, { sun, ambient, target, gl, scratch }: Lights, seconds: number): void {
  advanceClock(clock, Math.min(seconds, 0.1));
  const { from, to, t } = blendAt(clock.hours);
  const part = (name: MomentPart, out: Color) => out.copy(palette.moments[from][name]).lerp(palette.moments[to][name], t);
  const light = clock.light;
  const key = keyLight(clock.hours);

  part("haze", atmosphere.uHwHaze.value);
  part("sun", atmosphere.uHwSunColor.value);
  part("shadow", atmosphere.uHwShadowTint.value);
  part("sky", sky.uSky.value);
  atmosphere.uHwSunDir.value.set(key.direction.x, key.direction.y, key.direction.z);
  atmosphere.uHwHazeDensity.value = HAZE_DENSITY * light.haze;
  atmosphere.uHwTime.value = clock.motion;
  const moon = moonDirection(clock.hours);
  sky.uMoonDir.value.set(moon.x, moon.y, moon.z);
  sky.uNight.value = light.night;

  ridges.near.copy(palette.things["far-ridge"]).multiply(part("sky-light", scratch.a).multiplyScalar(light.ambient)).lerp(atmosphere.uHwHaze.value, 0.55);
  ridges.far.copy(ridges.near).lerp(atmosphere.uHwHaze.value, 0.55);

  const keyStrength = light.sun * key.strength;
  if (sun) {
    sun.color.copy(atmosphere.uHwSunColor.value);
    sun.intensity = keyStrength;
    sun.position.set(focus.x + key.direction.x * 120, focus.y + key.direction.y * 120, focus.z + key.direction.z * 120);
    target.position.set(focus.x, focus.y, focus.z);
    target.updateMatrixWorld();
  }
  if (ambient) {
    part("sky-light", ambient.color);
    part("ground-light", ambient.groundColor);
    ambient.intensity = light.ambient * 1.6;
  }
  atmosphere.uHwLight.value
    .copy(part("sky-light", scratch.a))
    .multiplyScalar(light.ambient * 1.1)
    .add(scratch.b.copy(atmosphere.uHwSunColor.value).multiplyScalar(keyStrength * 0.3 * Math.max(0.2, key.direction.y)));
  gl.toneMappingExposure = light.exposure;
}

export function Daylight(parts: DaylightParts) {
  const sun = useRef<DirectionalLight>(null);
  const ambient = useRef<HemisphereLight>(null);
  const gl = useThree((s) => s.gl);
  const target = useMemo(() => new Object3D(), []);
  const scratch = useMemo(() => ({ a: new Color(), b: new Color() }), []);

  useEffect(() => {
    if (sun.current) aimShadows(sun.current, target);
  }, [target]);

  useFrame((_, delta) => {
    lightTheValley(parts, { sun: sun.current, ambient: ambient.current, target, gl, scratch }, delta);
  }, DAYLIGHT_PRIORITY);

  return (
    <>
      <directionalLight ref={sun} castShadow shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]} shadow-bias={-0.0006} shadow-normalBias={0.05} />
      <primitive object={target} />
      <hemisphereLight ref={ambient} />
    </>
  );
}
