"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { type Color, Object3D, type DirectionalLight, type HemisphereLight, type WebGLRenderer } from "three";
import type { CalendarDate } from "../engine/calendar";
import { MOMENTS, type DaySky, type MomentLight } from "../engine/day";
import type { AtmosphereUniforms } from "./atmosphere";
import type { MomentPart, Palette } from "./palette";
import type { SkyUniforms } from "./sky";

/*
 * The day's light, set each frame from the hour: the sun (or the moon) shining
 * on a point of focus, the light from the sky and the ground,
 * the haze and the shadows' tint, the sky's colours and the camera's
 * exposure. Runs before everything else that draws, so the whole frame reads
 * the same hour.
 */

export const DAYLIGHT_PRIORITY = -3;

const HAZE_DENSITY = 0.0024;

/** The moment of the day the light is drawn for: the scene keeps it, the light only reads it. */
export interface DayState {
  /** The date and hour: the real day of the year it stands for keys anything seasonal. */
  date: CalendarDate;
  hours: number;
  light: MomentLight;
  /** Where the sun and moon are, the key light, and the mix of moments the light is in. */
  sky: DaySky;
  /** Seconds of motion, for anything that moves. */
  motion: number;
}

/** Where the light shines towards. Its shadows are a feature of their own (`art/shadows/`), drawn round the camera's view. */
export interface Focus {
  x: number;
  y: number;
  z: number;
}

/** How thick the air is where the camera is, against the usual haze; the scene sets it. */
export interface Air {
  thickness: number;
}

interface DaylightParts {
  day: DayState;
  palette: Palette;
  atmosphere: AtmosphereUniforms;
  sky: SkyUniforms;
  focus: Focus;
  air: Air;
}

interface Lights {
  sun: DirectionalLight | null;
  ambient: HemisphereLight | null;
  target: Object3D;
  gl: WebGLRenderer;
}

function lightTheWorld({ day, palette, atmosphere, sky, focus, air }: DaylightParts, { sun, ambient, target, gl }: Lights): void {
  const { mix, key, moon } = day.sky;
  const part = (name: MomentPart, out: Color) => {
    out.setRGB(0, 0, 0);
    for (const moment of MOMENTS) {
      const c = palette.moments[moment][name];
      out.setRGB(out.r + c.r * mix[moment], out.g + c.g * mix[moment], out.b + c.b * mix[moment]);
    }
    return out;
  };
  const light = day.light;

  part("haze", atmosphere.uHwHaze.value);
  part("sun", atmosphere.uHwSunColor.value);
  part("shadow", atmosphere.uHwShadowTint.value);
  part("sky", sky.uSky.value);
  atmosphere.uHwSunDir.value.set(key.direction.x, key.direction.y, key.direction.z);
  atmosphere.uHwHazeDensity.value = HAZE_DENSITY * light.haze * air.thickness;
  atmosphere.uHwTime.value = day.motion;
  sky.uMoonDir.value.set(moon.direction.x, moon.direction.y, moon.direction.z);
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
  part("sky-light", atmosphere.uHwSkyLight.value).multiplyScalar(light.ambient * 1.1);
  atmosphere.uHwSunLight.value.copy(atmosphere.uHwSunColor.value).multiplyScalar(keyStrength * 0.3 * Math.max(0.2, key.direction.y));
  gl.toneMappingExposure = light.exposure;
}

export function Daylight(parts: DaylightParts) {
  const sun = useRef<DirectionalLight>(null);
  const ambient = useRef<HemisphereLight>(null);
  const gl = useThree((s) => s.gl);
  const target = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (sun.current) sun.current.target = target;
  }, [target]);

  // The lights shine on every layer, so what is drawn late (see `passes.ts`) is lit like the rest.
  useEffect(() => {
    sun.current?.layers.enableAll();
    ambient.current?.layers.enableAll();
  }, []);

  useFrame(() => {
    lightTheWorld(parts, { sun: sun.current, ambient: ambient.current, target, gl });
  }, DAYLIGHT_PRIORITY);

  return (
    <>
      <directionalLight ref={sun} />
      <primitive object={target} />
      <hemisphereLight ref={ambient} />
    </>
  );
}
