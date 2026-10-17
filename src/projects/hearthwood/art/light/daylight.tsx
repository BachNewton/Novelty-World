"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, Object3D, PerspectiveCamera, SphericalHarmonics3, Vector2, type Camera, type DirectionalLight, type HemisphereLight, type LightProbe, type WebGLRenderer } from "three";
import { celestialFrame, type Direction } from "../../engine/astronomy";
import { CALENDAR, type CalendarDate } from "../../engine/calendar";
import { MOMENTS, type DaySky, type MomentLight } from "../../engine/day";
import { liveFeatures, type FeatureId, type FeatureSwitches } from "../../features";
import type { AtmosphereUniforms } from "../atmosphere";
import type { MomentPart, Palette } from "../palette";
import { AURORA_LIGHT, auroraAt } from "../sky/aurora";
import type { Rgb, Vec } from "../sky/scattering";
import { airglowAmount, moonPhaseLight, rgb, skyColour, skyLighting, sunGlow, type SkyLighting } from "../sky/sky-light";
import type { SkyUniforms } from "../sky/sky";
import { SKY_INPUTS } from "../sky/sky-inputs";
import { skyColours } from "../sky/tokens";
import { handoverAt } from "./handover";
import { moonlight } from "./moonlight";
import { AMBIENT_DIRECTIONS, irradianceAt, projectLight } from "./sky-ambient";
import { smooth, sunlight, unitLuminance, type BodyLight } from "./sun";
import { toneMappingFor } from "./tone-mapping";

/*
 * The day's light, set each frame from the calendar's sky before anything
 * is drawn, so the whole frame reads the same moment: the sun or the moon
 * shining on a point of focus (its shadows are a feature of their own, in
 * `art/shadows/`), the light from the sky and the
 * ground all round, the haze's colour, the sky's colours and the stars'
 * turning, and the camera's exposure and tone curve.
 *
 * On its own it is the plain light: each moment's colours from the palette,
 * blended by the engine's mix of moments, the engine's key light, and a
 * hemisphere of sky and ground light. The sky-and-light features each take
 * over a part of it while they are on (see `features/sky-and-light.ts`):
 * the sunlight and moonlight their colours and brightness, the handover
 * when and from where each lights the world, the physical sky the haze's and
 * the sky's colours, the sky's light all round the hemisphere (as a light
 * probe of the live sky), and the aurora a little green light on the land.
 * A feature that is off is never worked out.
 */

export const DAYLIGHT_PRIORITY = -3;

/** The plain haze's density at sea level on an ordinary day, per metre: thin enough that a clear day sees tens of kilometres, as the fog's clear air does. */
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
  probe: LightProbe | null;
  target: Object3D;
  gl: WebGLRenderer;
  camera: Camera;
  /** How high the eye is, for the air it looks through. */
  altitude: number;
}

/** The light on a surface from the sky all round, against the sky's own colour as drawn (a hand-set match to the plain light's). */
const SKY_AMBIENT = 0.8;
const NIGHT_EYE = 1.5;
const LOW_SUN_EYE = 0.6;
/** The plain light's hemisphere, and the water's share of it. */
const HEMISPHERE = 1.6;
const WATER_SKY = 1.1;

/** A colour blended from each moment's palette colour by the light's mix of moments. */
function blend(palette: Palette, mix: DaySky["mix"], name: MomentPart, out: Color): Color {
  out.setRGB(0, 0, 0);
  for (const moment of MOMENTS) {
    const c = palette.moments[moment][name];
    out.setRGB(out.r + c.r * mix[moment], out.g + c.g * mix[moment], out.b + c.b * mix[moment]);
  }
  return out;
}

/**
 * The physical sky's colour low over the horizon and overhead: what the haze
 * over the land and the water take from it. The haze's colour is the
 * horizon's on the side away from the sun (the haze itself warms towards
 * the sun, see `atmosphere.ts`), so the far land never takes the glow round
 * the sun all round the sky.
 */
function physicalSky(lighting: SkyLighting, altitude: number, haze: Color, zenith: Color): void {
  const low = Math.sin((1.5 * Math.PI) / 180);
  const across = Math.sqrt(1 - low * low);
  const sun = lighting.sun.direction;
  const bearing = Math.atan2(sun.z, sun.x);
  const sum: Rgb = [0, 0, 0];
  const around = [0.5, 0.75, 1, 1.25, 1.5];
  for (const turn of around) {
    const a = bearing + turn * Math.PI;
    const c = skyColour({ x: Math.cos(a) * across, y: low, z: Math.sin(a) * across }, altitude, lighting);
    for (let k = 0; k < 3; k++) sum[k] += c[k] / around.length;
  }
  haze.setRGB(sum[0], sum[1], sum[2]);
  const top = skyColour({ x: 0, y: 1, z: 0 }, altitude, lighting);
  zenith.setRGB(top[0], top[1], top[2]);
}

/** The light from the sky all round, as harmonics: the sky as it is drawn above, and the ground's bounce of the sun's and the sky's light below. */
class SkyAmbient {
  readonly sh = new SphericalHarmonics3();
  private last = "";

  update(sky: (direction: Vec) => Rgb, ground: Rgb, keyLight: Rgb, keyDirection: Direction, gain: number, signature: string): void {
    if (signature === this.last) return;
    this.last = signature;
    const above = AMBIENT_DIRECTIONS.filter((d) => d.y >= 0).map((d) => ({ d, light: sky(d) }));
    // The sky's light on the level ground, and the sun's: what the ground has to give back.
    const fromSky: Rgb = [0, 0, 0];
    for (const { d, light } of above) for (let c = 0; c < 3; c++) fromSky[c] += (light[c] * d.y * 2 * Math.PI) / above.length;
    const lit = Math.max(0, keyDirection.y);
    const bounce: Rgb = [0, 1, 2].map((c) => (ground[c] * (fromSky[c] + keyLight[c] * lit)) / Math.PI) as Rgb;
    const lookup = new Map(above.map(({ d, light }) => [d, light]));
    projectLight((d) => {
      const light = lookup.get(d) ?? bounce;
      return [light[0] * gain, light[1] * gain, light[2] * gain];
    }, AMBIENT_DIRECTIONS, this.sh);
  }
}

function lightTheWorld(parts: DaylightParts, lights: Lights, switches: FeatureSwitches, ambient: SkyAmbient, scratch: { sunColour: Color; skyLight: Color; size: Vector2 }): void {
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
  const stars = celestialFrame(day.date.realDayOfYear, day.date.hour, CALENDAR.latitude);
  const { pole, equinox } = stars;
  const ninety = { x: pole.y * equinox.z - pole.z * equinox.y, y: pole.z * equinox.x - pole.x * equinox.z, z: pole.x * equinox.y - pole.y * equinox.x };
  sky.uCelestial.value.set(equinox.x, ninety.x, pole.x, equinox.y, ninety.y, pole.y, equinox.z, ninety.z, pole.z);

  // The physical sky's colours, for the haze over the land and what the water mirrors.
  const lighting = on("skyScattering") ? skyLighting(sun, moon, rgb(colours.moonlight), rgb(colours.airglow), sunGlow(sun, colours)) : null;
  if (lighting) physicalSky(lighting, lights.altitude, atmosphere.uHwHaze.value, sky.uSky.value);

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
    lights.key.position.set(focus.x + direction.x * 180, focus.y + direction.y * 180, focus.z + direction.z * 180);
    lights.target.position.set(focus.x, focus.y, focus.z);
    lights.target.updateMatrixWorld();
  }

  // The light from the sky and the ground all round: a little more in early night, less on a moonless one, and the aurora's green.
  const lift = handover?.skyLift ?? 1;
  const moonNight = on("moonlight") ? 1 - mix.night * (1 - (0.3 + 0.7 * moonPhaseLight(moon) * smooth(-2, 10, moon.elevation))) : 1;
  const aurora = on("aurora") ? auroraAt(day.date, sun) * AURORA_LIGHT : 0;
  const auroraGreen = colours["aurora-green"];
  if (on("skyAmbient")) {
    const plainSkyColour = (d: Vec): Rgb => {
      const t = Math.pow(smooth(0, 0.75, Math.max(d.y, 0)), 0.7);
      const h = atmosphere.uHwHaze.value;
      const s = sky.uSky.value;
      return [h.r + (s.r - h.r) * t, h.g + (s.g - h.g) * t, h.b + (s.b - h.b) * t];
    };
    const skyAt = (d: Vec): Rgb => {
      const c = lighting ? skyColour(d, lights.altitude, lighting, 10) : plainSkyColour(d);
      return [c[0] + auroraGreen.r * aurora, c[1] + auroraGreen.g * aurora, c[2] + auroraGreen.b * aurora];
    };
    const keyLight: Rgb = [shining.colour[0] * intensity, shining.colour[1] * intensity, shining.colour[2] * intensity];
    // The eye opens up in the dark, so the night's faint sky lights the land a little more than its share.
    // Round a low sun the woods stand in the long shadows; the eye opens up for them as it does at night, so shade under the trees stays readable.
    const lowSun = smooth(-2, 3, sun.elevation) * (1 - smooth(8, 20, sun.elevation));
    const gain = SKY_AMBIENT * lift * moonNight * (1 + NIGHT_EYE * airglowAmount(sun.elevation) + LOW_SUN_EYE * lowSun);
    const signature = [sun.direction.x, sun.direction.y, moon.direction.x, moon.direction.y, intensity, gain, aurora, lights.altitude / 50, lighting ? 1 : 0, atmosphere.uHwHaze.value.r, sky.uSky.value.b]
      .map((n) => Math.round(n * 400))
      .join(",");
    ambient.update(skyAt, rgb(colours["ground-bounce"]), keyLight, direction, gain, signature);
    if (lights.probe) lights.probe.sh.copy(ambient.sh);
    const up = irradianceAt(ambient.sh, { x: 0, y: 1, z: 0 });
    atmosphere.uHwSkyLight.value.setRGB(up[0], up[1], up[2]).multiplyScalar(WATER_SKY / HEMISPHERE);
  } else {
    const strength = light.ambient * lift * moonNight;
    const skyLight = blend(palette, mix, "sky-light", scratch.skyLight);
    skyLight.setRGB(skyLight.r + auroraGreen.r * aurora, skyLight.g + auroraGreen.g * aurora, skyLight.b + auroraGreen.b * aurora);
    if (lights.hemisphere) {
      lights.hemisphere.color.copy(skyLight);
      blend(palette, mix, "ground-light", lights.hemisphere.groundColor);
      lights.hemisphere.intensity = strength * HEMISPHERE;
    }
    atmosphere.uHwSkyLight.value.copy(skyLight).multiplyScalar(strength * WATER_SKY);
  }
  atmosphere.uHwSunLight.value.copy(atmosphere.uHwSunColor.value).multiplyScalar(intensity * 0.3 * Math.max(0.2, direction.y));
  lights.gl.toneMappingExposure = light.exposure;
  // Three recompiles what is tone mapped only when this changes.
  lights.gl.toneMapping = toneMappingFor(on("toneMapping"));
  lights.gl.getDrawingBufferSize(scratch.size);
  if (lights.camera instanceof PerspectiveCamera) sky.uSkyPixel.value = (lights.camera.getEffectiveFOV() * Math.PI) / 180 / scratch.size.y;
}

/** Whether a feature is on, as React state. */
function useSwitch(id: FeatureId): boolean {
  const switches = liveFeatures();
  return useSyncExternalStore(
    (listener) => switches.subscribe(listener),
    () => switches.isOn(id),
    () => switches.isOn(id),
  );
}

export function Daylight(parts: DaylightParts) {
  const key = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const probe = useRef<LightProbe>(null);
  const gl = useThree((s) => s.gl);
  const target = useMemo(() => new Object3D(), []);
  const ambient = useMemo(() => new SkyAmbient(), []);
  const scratch = useMemo(() => ({ sunColour: new Color(), skyLight: new Color(), size: new Vector2() }), []);
  const skyAmbient = useSwitch("skyAmbient");
  useEffect(() => {
    if (key.current) key.current.target = target;
  }, [target]);

  // The lights shine on every layer, so what is drawn late (see `passes.ts`) is lit like the rest.
  useEffect(() => {
    key.current?.layers.enableAll();
    hemisphere.current?.layers.enableAll();
    probe.current?.layers.enableAll();
  }, [skyAmbient]);

  // The sky's inputs, for the screenshot tools to set.
  useEffect(() => {
    window.__hearthwoodSky = SKY_INPUTS;
    return () => {
      delete window.__hearthwoodSky;
    };
  }, []);

  useFrame(({ camera }) => {
    const lights = { key: key.current, hemisphere: hemisphere.current, probe: probe.current, target, gl, camera, altitude: camera.position.y };
    lightTheWorld(parts, lights, liveFeatures(), ambient, scratch);
  }, DAYLIGHT_PRIORITY);

  return (
    <>
      <directionalLight ref={key} />
      <primitive object={target} />
      {skyAmbient ? <lightProbe ref={probe} /> : <hemisphereLight ref={hemisphere} />}
    </>
  );
}
