"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Object3D, PerspectiveCamera, type Camera, type DirectionalLight, type HemisphereLight } from "three";
import { celestialFrame } from "../../engine/astronomy";
import { CALENDAR, type CalendarDate } from "../../engine/calendar";
import { MOMENTS, type DaySky, type MomentLight } from "../../engine/day";
import { liveFeatures, type FeatureId, type FeatureSwitches } from "../../features";
import type { AtmosphereUniforms } from "../atmosphere";
import type { MomentPart, Palette } from "../palette";
import { AURORA_LIGHT, auroraAt } from "../sky/aurora";
import type { SkyUniforms } from "../sky/sky";
import { SKY_INPUTS } from "../sky/sky-inputs";
import { skyColours } from "../sky/tokens";
import { handoverAt } from "./handover";
import { moonlight, moonPhaseLight } from "./moonlight";
import { lightColourThroughAir, smooth, sunlight, unitLuminance, type BodyLight } from "./sun";
import { rgb } from "./through-air";
import { exposure } from "./tone-mapping";

/*
 * The day's light, set each frame from the calendar's sky before anything
 * is drawn, so the whole frame reads the same moment: the sun or the moon
 * shining on a point of focus (its shadows are a feature of their own, in
 * `art/shadows/`, which find the light by its name), a hemisphere of light
 * from the sky and the ground in the moment's own colours, the haze's
 * colour, the sky's colours and the stars' turning, and the exposure.
 *
 * On its own it is the plain light: each moment's colours from the palette,
 * blended by the engine's mix of moments, and the engine's key light. The
 * light's features each take over a part of it while they are on (see
 * `features/sky-and-light.ts`): the sunlight and moonlight their colours
 * and brightness, the handover when each lights the world, and the aurora a
 * little green light on the land. A feature that is off is never worked
 * out.
 */

export const DAYLIGHT_PRIORITY = -3;

/** The key light's name: the shadows find it by it. */
export const KEY_LIGHT_NAME = "hearthwood-key-light";

/** The plain haze's density at sea level on an ordinary day, per metre: thin enough that a clear day sees tens of kilometres. */
const HAZE_DENSITY = 6e-5;

/** The moment of the day the light is drawn for: the scene keeps it, the light only reads it. */
export interface DayState {
  hours: number;
  /** The date: the season and the year's turning, for anything that changes with them. */
  date: CalendarDate;
  light: MomentLight;
  /** Where the sun and moon are, the key light, and the mix of moments the light is in. */
  sky: DaySky;
  /** Seconds of motion, for anything that moves. */
  motion: number;
}

/** Where the light shines towards. */
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
  key: DirectionalLight | null;
  hemisphere: HemisphereLight | null;
  target: Object3D;
  camera: Camera;
  /** The drawing buffer's height in pixels, for how wide a pixel of the sky is. */
  height: number;
}

/** The hemisphere's strength against the moment's ambient, and the water's share of the sky's light. */
const HEMISPHERE = 1.6;
const WATER_SKY = 1.1;
/** How far from the light the key light stands from the focus, in metres. */
const KEY_DISTANCE = 180;

/** A colour blended from each moment's palette colour by the light's mix of moments. */
function blend(palette: Palette, mix: DaySky["mix"], name: MomentPart, out: Color): Color {
  out.setRGB(0, 0, 0);
  for (const moment of MOMENTS) {
    const c = palette.moments[moment][name];
    out.setRGB(out.r + c.r * mix[moment], out.g + c.g * mix[moment], out.b + c.b * mix[moment]);
  }
  return out;
}

interface Scratch {
  sunColour: Color;
  skyLight: Color;
  tint: Color;
}

/** The sun's disc and its glow in the sky: the disc coloured by the air and gone once it has set; the glow warm through sunset and the first of the twilight. */
function sunInTheSky(parts: DaylightParts, disc: Color, scratch: Scratch): void {
  const { day, sky } = parts;
  const { sun } = day.sky;
  const colours = skyColours();
  const air = lightColourThroughAir(sun.direction);
  const shown = smooth(-0.6, 0.4, sun.elevation);
  sky.uSunDisc.value.copy(disc).multiply(scratch.tint.setRGB(air[0], air[1], air[2])).multiplyScalar(3 * shown);
  // The glow takes the sun's own colour through the air even after it has set, when the key light is the moon's.
  const glow = sunlight(sun, unitLuminance(rgb(colours["sun-morning"])), unitLuminance(rgb(colours["sun-evening"]))).colour;
  // Strongest low in the sky and through the first of the twilight, gone by the blue hour's end.
  const low = (1 - smooth(6, 30, sun.elevation)) * smooth(-9, -1, sun.elevation);
  sky.uSunGlow.value.setRGB(glow[0], glow[1], glow[2]).multiplyScalar((0.25 + 0.55 * low) * smooth(-10, -2, sun.elevation));
}

function lightTheWorld(parts: DaylightParts, lights: Lights, switches: FeatureSwitches, scratch: Scratch, disc: Color): void {
  const { day, palette, atmosphere, sky, focus, air } = parts;
  const on = (id: FeatureId) => switches.isOn(id);
  const { mix, key, sun, moon } = day.sky;
  const light = day.light;
  const colours = skyColours();

  blend(palette, mix, "haze", atmosphere.uHwHaze.value);
  blend(palette, mix, "shadow", atmosphere.uHwShadowTint.value);
  blend(palette, mix, "sky", sky.uSky.value);
  const paletteSun = blend(palette, mix, "sun", scratch.sunColour);
  atmosphere.uHwHazeDensity.value = HAZE_DENSITY * light.haze * air.thickness;
  atmosphere.uHwTime.value = day.motion;
  sky.uSunDir.value.set(sun.direction.x, sun.direction.y, sun.direction.z);
  sky.uMoonDir.value.set(moon.direction.x, moon.direction.y, moon.direction.z);
  sky.uNight.value = light.night;
  const { pole, equinox } = celestialFrame(day.date.realDayOfYear, day.date.hour, CALENDAR.latitude);
  const ninety = { x: pole.y * equinox.z - pole.z * equinox.y, y: pole.z * equinox.x - pole.x * equinox.z, z: pole.x * equinox.y - pole.y * equinox.x };
  sky.uCelestial.value.set(equinox.x, ninety.x, pole.x, equinox.y, ninety.y, pole.y, equinox.z, ninety.z, pole.z);

  // The key light: which body, how bright, and from where.
  const plainSun: BodyLight = { colour: rgb(paletteSun), intensity: light.sun };
  const sunLight = on("sunLight") ? sunlight(sun, unitLuminance(rgb(colours["sun-morning"])), unitLuminance(rgb(colours["sun-evening"]))) : plainSun;
  const handover = on("handover") ? handoverAt(sun, moon) : null;
  const moonLight = on("moonlight") ? moonlight(moon, unitLuminance(rgb(colours.moonlight))) : { colour: plainSun.colour, intensity: light.sun * (handover ? moonPhaseLight(moon) : 1) };
  // Which body lights the world, and from where, is the engine's (the shadows follow it too); the handover only shapes how each fades.
  const body = key.body;
  const shining = body === "sun" ? sunLight : moonLight;
  const fade = handover ? (body === "sun" ? handover.sun : handover.moon) : key.strength;
  const intensity = shining.intensity * fade;
  const direction = body === "sun" ? sun.direction : moon.direction;
  atmosphere.uHwSunColor.value.setRGB(shining.colour[0], shining.colour[1], shining.colour[2]);
  atmosphere.uHwSunDir.value.set(direction.x, direction.y, direction.z);
  atmosphere.uHwKeyLight.value.copy(atmosphere.uHwSunColor.value).multiplyScalar(intensity);
  if (lights.key) {
    lights.key.color.copy(atmosphere.uHwSunColor.value);
    lights.key.intensity = intensity;
    lights.key.position.set(focus.x + direction.x * KEY_DISTANCE, focus.y + direction.y * KEY_DISTANCE, focus.z + direction.z * KEY_DISTANCE);
    lights.target.position.set(focus.x, focus.y, focus.z);
    lights.target.updateMatrixWorld();
  }

  // The light from the sky and the ground all round: a little more in early night, less on a moonless one, and the aurora's green.
  const lift = handover?.skyLift ?? 1;
  const moonNight = on("moonlight") ? 1 - mix.night * (1 - (0.3 + 0.7 * moonPhaseLight(moon) * smooth(-2, 10, moon.elevation))) : 1;
  const aurora = on("aurora") ? auroraAt(day.date, sun) * AURORA_LIGHT : 0;
  const auroraGreen = colours["aurora-green"];
  const strength = light.ambient * lift * moonNight;
  const skyLight = blend(palette, mix, "sky-light", scratch.skyLight);
  skyLight.setRGB(skyLight.r + auroraGreen.r * aurora, skyLight.g + auroraGreen.g * aurora, skyLight.b + auroraGreen.b * aurora);
  if (lights.hemisphere) {
    lights.hemisphere.color.copy(skyLight);
    blend(palette, mix, "ground-light", lights.hemisphere.groundColor);
    lights.hemisphere.intensity = strength * HEMISPHERE;
  }
  atmosphere.uHwSkyLight.value.copy(skyLight).multiplyScalar(strength * WATER_SKY);
  atmosphere.uHwSunLight.value.copy(atmosphere.uHwSunColor.value).multiplyScalar(intensity * 0.3 * Math.max(0.2, direction.y));
  sunInTheSky(parts, disc, scratch);
  exposure.value = light.exposure;
  if (lights.camera instanceof PerspectiveCamera) sky.uSkyPixel.value = (lights.camera.getEffectiveFOV() * Math.PI) / 180 / lights.height;
}

export function Daylight(parts: DaylightParts) {
  const key = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const target = useMemo(() => new Object3D(), []);
  const scratch = useMemo<Scratch>(() => ({ sunColour: new Color(), skyLight: new Color(), tint: new Color() }), []);
  // The sun disc's own colour, before the air colours and dims it.
  const disc = parts.palette.things["sun-disc"];
  useEffect(() => {
    if (key.current) key.current.target = target;
  }, [target]);

  // The sky's inputs, for the screenshot tools to set.
  useEffect(() => {
    window.__hearthwoodSky = SKY_INPUTS;
    return () => {
      delete window.__hearthwoodSky;
    };
  }, []);

  const height = size.height * dpr;
  useFrame(({ camera }) => {
    lightTheWorld(parts, { key: key.current, hemisphere: hemisphere.current, target, camera, height }, liveFeatures(), scratch, disc);
  }, DAYLIGHT_PRIORITY);

  return (
    <>
      <directionalLight ref={key} name={KEY_LIGHT_NAME} />
      <primitive object={target} />
      <hemisphereLight ref={hemisphere} />
    </>
  );
}
