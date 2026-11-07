import { Vector3 } from "three/webgpu";
import { uniform } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import type { SkyLook } from "../art/sky/sky";
import type { Weather } from "../climate/weather";
import { TRUE_NORTH_GRID_DEG } from "../time/sky-places";

/*
 * The weather as the render draws it. The climate's values (`climate/`) come in each frame and are eased towards, so a
 * held weather chosen in the dev menu blends in as the shared one does, and they become the few things the drawing
 * reads: the sky's grey lid and storm over the hour's look, how much the sun is hidden, how far the light falls and
 * the lamps come on early, how thick the haze, and the road's water, snow and ice for its material.
 *
 * Arcade first (`docs/TIME-AND-WEATHER.md`): a storm darkens the day and fog thickens the haze, never so far the road
 * is hard to read.
 */

/** A change of weather is eased in over about this long, in real seconds: a held one chosen in the dev menu blends rather than switches. */
const EASE_S = 2.5;
/** How much of the day's light a full grey lid and storm take, as the night's `dark` dial: the land dims with the sky. */
const GLOOM_DARK = 0.7;
/** How far a full gloom moves the night's dial on towards the lamps, once the evening has begun. */
const LAMPS_EARLY = 0.16;
/** How much of the sun's direct light a full grey lid hides. */
const SUN_HIDDEN = 0.85;
/** The haze's reach (where it has closed about two thirds of the way) in a fog of 0.5, the climate's thickest: the road is clear for a hundred metres and more. A challenge's fog of 1 closes it to a quarter of that. */
const HALF_FOG_HAZE_M = 300;
/** The climate's cover, 0 to 1, drawn as the sky's: a clear day keeps a few clouds. */
const COVER_FROM = 0.06;

const smooth = (share: number) => {
  const clamped = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
};

const NUMBERS = ["cloudCover", "rain", "snowfall", "fog", "windMS", "temperatureC", "roadWet", "roadSnow", "blackIce", "aurora"] as const;

/** Eases the weather drawn towards the weather now, over real seconds; the first reading is taken as it is. */
export function eased(shown: Weather | null, now: Weather | null, seconds: number): Weather | null {
  if (now === null || shown === null) return now;
  const share = 1 - Math.exp(-seconds / EASE_S);
  const next = { ...now };
  for (const name of NUMBERS) next[name] = shown[name] + (now[name] - shown[name]) * share;
  // The wind's way turns the short way round.
  const turn = ((((now.windFromDeg - shown.windFromDeg) % 360) + 540) % 360) - 180;
  next.windFromDeg = (shown.windFromDeg + turn * share + 360) % 360;
  return next;
}

/** What the weather does to the light: the grey lid, a storm's darkness under it, and how dark that makes the day, each 0 to 1. */
export function gloomOf(weather: Weather | null) {
  if (weather === null) return { lid: 0, storm: 0, gloom: 0 };
  const lid = smooth((weather.cloudCover - 0.55) / 0.45);
  const storm = smooth(Math.max(weather.rain, weather.snowfall) / 0.7);
  return { lid, storm, gloom: 0.55 * lid + 0.45 * storm };
}

/** The night's dials with the weather's gloom added: the light lower, and the lamps on early once the evening has begun. */
export function gloomedNight(amount: number, dark: number, weather: Weather | null) {
  const { gloom } = gloomOf(weather);
  return { amount: Math.min(1, amount + LAMPS_EARLY * gloom * smooth((amount - 0.1) / 0.36)), dark: Math.min(1, dark + GLOOM_DARK * gloom) };
}

/** The share of the sun's direct light the clouds let through. */
export const sunThrough = (weather: Weather | null) => 1 - SUN_HIDDEN * gloomOf(weather).lid;

/** The haze's reach in fog: the clear day's, closing in by the square of the fog, so the climate's light fogs stay light. */
export const hazeInFog = (clearM: number, fog: number) => clearM / (1 + 4 * (clearM / HALF_FOG_HAZE_M - 1) * Math.min(1, Math.max(0, fog)) ** 2);

const LUMA = new Vector3(0.2126, 0.7152, 0.0722);
const luma = (colour: Vector3) => colour.dot(LUMA);

/** The weather's own colours, a grey for each kind of sky, scaled to a brightness by the look they fall over. */
function weatherColours() {
  const linear = (name: string) => {
    const { r, g, b } = themeColor(`--color-aland-drive-weather-${name}`);
    return new Vector3(r, g, b);
  };
  return { overcast: linear("overcast"), storm: linear("storm"), fog: linear("fog") };
}

let colours: ReturnType<typeof weatherColours> | null = null;

/** How much of its own hue the night keeps under a grey lid, and how much darker the lid is then than the horizon it hides. */
const NIGHT_HUE_KEPT = 0.6;
const NIGHT_LID_DARKER = 0.35;

/**
 * The hour's look under the weather, at the night's dial. Under a grey lid the sky is one grey at the look's own
 * brightness (keeping the night's blue after dark, and darker than the clear night's horizon), the sun and its glow
 * are hidden and the clouds go grey; a storm darkens that grey; fog pales the horizon, which is the haze's colour. The
 * darkness of the day goes on the night's `dark` dial, so land and sky dim together.
 */
export function weatheredLook(look: SkyLook, weather: Weather | null, amount: number): SkyLook {
  if (weather === null) return look;
  colours ??= weatherColours();
  const { lid, storm } = gloomOf(weather);
  const fog = smooth(weather.fog / 0.45) * 0.9;
  const night = smooth((amount - 0.46) / 0.54);
  const tint = colours.overcast.clone().lerp(colours.storm, storm);
  const hue = look.horizon.clone().multiplyScalar(luma(tint) / Math.max(luma(look.horizon), 1e-6));
  tint.lerp(hue, NIGHT_HUE_KEPT * night);
  const bright = luma(look.horizon) * (1 - NIGHT_LID_DARKER * night);
  const grey = (scale: number) => tint.clone().multiplyScalar((bright * scale) / luma(tint));
  const misty = colours.fog.clone().lerp(hue, NIGHT_HUE_KEPT * night);
  const pale = misty.multiplyScalar((bright * 1.05) / luma(misty));
  const under = (colour: Vector3, scale: number, fogged: number) => colour.clone().lerp(grey(scale), lid).lerp(pale, fog * fogged);
  const toward = weather.windFromDeg + 180 + TRUE_NORTH_GRID_DEG;
  return {
    ...look,
    cloudCover: COVER_FROM + (1 - COVER_FROM) * weather.cloudCover,
    wind: { towardDeg: toward, speedMS: 5 + 2 * weather.windMS },
    zenith: under(look.zenith, 0.85, 0.75),
    band: under(look.band, 0.97, 1),
    bandSun: under(look.bandSun, 0.97, 1),
    horizon: under(look.horizon, 1, 1),
    horizonSun: under(look.horizonSun, 1, 1),
    glow: look.glow.clone().multiplyScalar((1 - lid) * (1 - 0.6 * fog)),
    sunDisc: look.sunDisc.clone().multiplyScalar((1 - lid) * (1 - 0.7 * fog)),
    cloudRim: look.cloudRim.clone().multiplyScalar(1 - lid),
    cloudLit: under(look.cloudLit, 1.02, 1),
    cloudShade: under(look.cloudShade, 0.78 - 0.22 * storm, 1),
  };
}

/** The road's state for its material, eased with the rest. */
export function createRoadWeather() {
  const wet = uniform(0);
  const snow = uniform(0);
  const ice = uniform(0);
  return {
    wet,
    snow,
    ice,
    set(weather: Weather | null) {
      wet.value = weather?.roadWet ?? 0;
      snow.value = weather?.roadSnow ?? 0;
      ice.value = weather?.blackIce ?? 0;
    },
  };
}

export type RoadWeather = ReturnType<typeof createRoadWeather>;
