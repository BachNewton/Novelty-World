"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Object3D, type DirectionalLight, type HemisphereLight, type WebGLRenderer } from "three";
import { blendAt, keyLight, moonDirection, type MomentLight } from "../engine/day";
import type { AtmosphereUniforms } from "./atmosphere";
import type { MomentPart, Palette } from "./palette";
import type { SkyUniforms } from "./sky";

/*
 * The day's light, set each frame from the hour: the sun (or the moon) and
 * its shadows round a point of focus, the light from the sky and the ground,
 * the haze and the shadows' tint, the sky's colours and the camera's
 * exposure. Runs before everything else that draws, so the whole frame reads
 * the same hour.
 */

export const DAYLIGHT_PRIORITY = -3;

const HAZE_DENSITY = 0.0024;

/** The moment of the day the light is drawn for: the scene keeps it, the light only reads it. */
export interface DayState {
  hours: number;
  light: MomentLight;
  /** Seconds of motion, for anything that moves. */
  motion: number;
}

/** Where the light centres its shadows. */
export interface Focus {
  x: number;
  y: number;
  z: number;
}

/** How thick the air is where the camera is, against the usual haze; the scene sets it. */
export interface Air {
  thickness: number;
}

export interface Shadows {
  /** Texels along each side of the shadow map. */
  map: number;
  /** How far round the focus the sun's shadows reach, in metres. */
  reach: number;
}

interface DaylightParts {
  day: DayState;
  palette: Palette;
  atmosphere: AtmosphereUniforms;
  sky: SkyUniforms;
  focus: Focus;
  air: Air;
  shadows: Shadows;
}

interface Lights {
  sun: DirectionalLight | null;
  ambient: HemisphereLight | null;
  target: Object3D;
  gl: WebGLRenderer;
  scratch: { a: Color; b: Color };
}

/** The sun's shadows cover a square round the focus, and follow it. */
function aimShadows(light: DirectionalLight, target: Object3D, reach: number): void {
  light.target = target;
  const camera = light.shadow.camera;
  camera.left = -reach;
  camera.right = reach;
  camera.top = reach;
  camera.bottom = -reach;
  camera.near = 1;
  camera.far = 400;
  camera.updateProjectionMatrix();
}

function lightTheWorld({ day, palette, atmosphere, sky, focus, air }: DaylightParts, { sun, ambient, target, gl, scratch }: Lights): void {
  const { from, to, t } = blendAt(day.hours);
  const part = (name: MomentPart, out: Color) => out.copy(palette.moments[from][name]).lerp(palette.moments[to][name], t);
  const light = day.light;
  const key = keyLight(day.hours);

  part("haze", atmosphere.uHwHaze.value);
  part("sun", atmosphere.uHwSunColor.value);
  part("shadow", atmosphere.uHwShadowTint.value);
  part("sky", sky.uSky.value);
  atmosphere.uHwSunDir.value.set(key.direction.x, key.direction.y, key.direction.z);
  atmosphere.uHwHazeDensity.value = HAZE_DENSITY * light.haze * air.thickness;
  atmosphere.uHwTime.value = day.motion;
  const moon = moonDirection(day.hours);
  sky.uMoonDir.value.set(moon.x, moon.y, moon.z);
  sky.uNight.value = light.night;

  const keyStrength = light.sun * key.strength;
  if (sun) {
    sun.color.copy(atmosphere.uHwSunColor.value);
    sun.intensity = keyStrength;
    sun.position.set(focus.x + key.direction.x * 180, focus.y + key.direction.y * 180, focus.z + key.direction.z * 180);
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
  const { map, reach } = parts.shadows;

  useEffect(() => {
    if (sun.current) aimShadows(sun.current, target, reach);
  }, [target, reach]);

  useFrame(() => {
    lightTheWorld(parts, { sun: sun.current, ambient: ambient.current, target, gl, scratch });
  }, DAYLIGHT_PRIORITY);

  return (
    <>
      <directionalLight ref={sun} castShadow shadow-mapSize={[map, map]} shadow-bias={-0.0005} shadow-normalBias={0.05} />
      <primitive object={target} />
      <hemisphereLight ref={ambient} />
    </>
  );
}
