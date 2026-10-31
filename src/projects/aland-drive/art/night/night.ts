import { Vector3, type Node, type UniformNode } from "three/webgpu";
import { dot, float, mix, smoothstep, uniform, vec3 } from "three/tsl";
import { themeColor } from "@/shared/lib/three/theme-color";
import { skyLooks, type SkyLook } from "../sky/sky";

/*
 * The one dial the night hangs on. `amount` runs from full day (0) to the deepest of the short Nordic summer night (1),
 * through the golden hour and dusk at the stops below, and everything else here is a function of it, so moving the hour
 * is writing one uniform (and handing `skyAtHour`'s look to the sky). Åland's midsummer sun only dips about 6.5° under
 * the northern horizon, so deep night here is a blue dusk with a glow low in the north, not black.
 */

export const NIGHT_STOPS = { day: 0, golden: 0.34, dusk: 0.66, night: 1 } as const;
export type NightLook = keyof typeof NIGHT_STOPS;

export type F = Node<"float">;
export type V3 = Node<"vec3">;

const LAMPS_ON_FROM = 0.46;
const LAMPS_ON_FULL = 0.6;
/** How much colour the deepest night takes from a surface: the eye's own loss of colour in the dark. */
const COLOUR_LOST_AT_NIGHT = 0.5;
/** With the sun gone, this share of the baked light's contrast stays, standing in for the open sky mixed into it. */
const SHADE_KEPT_AT_NIGHT = 0.3;
const LUMA = [0.2126, 0.7152, 0.0722] as const;

export interface Night {
  /** The dial. Write `.value`, and nothing else need change. */
  amount: UniformNode<"float", number>;
  /** Seconds, for what blinks and sweeps: the game's clock, so a held game holds them too. */
  seconds: UniformNode<"float", number>;
  /** 0 by day, 1 once lamps are lit: they come on towards the end of the golden hour. */
  lampsOn: F;
  /** A colour for each of the four looks, as this hour's. */
  across: (day: V3, golden: V3, dusk: V3, night: V3) => V3;
}

const tokenRgb = (name: string) => {
  const { r, g, b } = themeColor(`--color-aland-drive-night-${name}`);
  return new Vector3(r, g, b);
};

export const nightRgb = (name: string) => themeColor(`--color-aland-drive-night-${name}`);

export const nightColour = (name: string): V3 => {
  const { x, y, z } = tokenRgb(name);
  return vec3(x, y, z);
};

export function createNight(start = 0): Night {
  const amount = uniform(start);
  const across = (day: V3, golden: V3, dusk: V3, night: V3): V3 => {
    const toGolden = smoothstep(float(NIGHT_STOPS.day), float(NIGHT_STOPS.golden), amount);
    const toDusk = smoothstep(float(NIGHT_STOPS.golden), float(NIGHT_STOPS.dusk), amount);
    const toNight = smoothstep(float(NIGHT_STOPS.dusk), float(NIGHT_STOPS.night), amount);
    return mix(mix(mix(day, golden, toGolden), dusk, toDusk), night, toNight);
  };
  return { amount, seconds: uniform(0), lampsOn: smoothstep(float(LAMPS_ON_FROM), float(LAMPS_ON_FULL), amount), across };
}

/** What the light does to a surface at this hour. The golden hour's is `art/sky`'s own, so land and sky agree there. */
function tinted(night: Night, colour: V3, dusk: string, deep: string): V3 {
  const { x, y, z } = skyLooks().goldenHour.landLight;
  const light = night.across(vec3(1, 1, 1), vec3(x, y, z), nightColour(dusk), nightColour(deep));
  const luma = dot(colour, vec3(LUMA[0], LUMA[1], LUMA[2]));
  const lost = smoothstep(float(NIGHT_STOPS.golden), float(NIGHT_STOPS.night), night.amount).mul(COLOUR_LOST_AT_NIGHT);
  return mix(colour, vec3(luma, luma, luma), lost).mul(light);
}

export const landAtHour = (night: Night, colour: V3) => tinted(night, colour, "land-dusk", "land-deep");
export const forestAtHour = (night: Night, colour: V3) => tinted(night, colour, "forest-dusk", "forest-deep");
export const seaAtHour = (night: Night, colour: V3) => tinted(night, colour, "sea-dusk", "sea-deep");

/** Water drawn inside the land's own haze, as the terrain's sea is: a colour that comes out as `seaAtHour` once `landAtHour` has had it. */
export const seaInLand = (night: Night, colour: V3): V3 => seaAtHour(night, colour).div(tinted(night, vec3(1, 1, 1), "land-dusk", "land-deep"));

/**
 * The baked land light holds a sun at its one fixed bearing, cast shadow and all, in one channel, and it must not outlive
 * that sun going round and down, so its contrast eases out with the hour. A `sky` of its own, if the pipeline ever bakes
 * the open sky apart, takes over at night in place of 1.
 */
export function bakedLightAtHour(night: Night, light: F, sky: F = float(1)): F {
  const sunGone = smoothstep(float(NIGHT_STOPS.day), float(NIGHT_STOPS.dusk), night.amount);
  return mix(light, mix(sky, light, float(SHADE_KEPT_AT_NIGHT)), sunGone);
}

function hourLooks(): { share: number; look: SkyLook }[] {
  const { summer, goldenHour } = skyLooks();
  const blend = (from: string, to: string, share: number) => tokenRgb(from).lerp(tokenRgb(to), share);
  const dusk: SkyLook = {
    ...goldenHour,
    sun: { azimuthDeg: 325, elevationDeg: -1.5 },
    cloudCover: 0.42,
    zenith: tokenRgb("zenith-dusk"),
    horizon: blend("horizon-deep", "horizon-dusk", 0.42),
    horizonSun: tokenRgb("horizon-dusk"),
    band: blend("zenith-dusk", "horizon-deep", 0.6),
    bandSun: blend("horizon-dusk", "glow-dusk", 0.4),
    bandTop: 0.3,
    glow: tokenRgb("glow-dusk").multiplyScalar(0.7),
    sunDisc: new Vector3(0, 0, 0),
    cloudLit: blend("horizon-dusk", "cloud-dusk", 0.55),
    cloudShade: tokenRgb("cloud-dusk"),
    cloudRim: tokenRgb("glow-dusk").multiplyScalar(0.3),
    landLight: tokenRgb("land-dusk"),
  };
  const deep: SkyLook = {
    ...goldenHour,
    sun: { azimuthDeg: 354, elevationDeg: -6.5 },
    cloudCover: 0.38,
    zenith: tokenRgb("zenith-deep"),
    horizon: blend("zenith-deep", "horizon-deep", 0.55),
    horizonSun: tokenRgb("horizon-deep"),
    band: blend("zenith-deep", "horizon-deep", 0.3),
    bandSun: blend("horizon-deep", "glow-deep", 0.5),
    bandTop: 0.26,
    glow: tokenRgb("glow-deep").multiplyScalar(0.25),
    sunDisc: new Vector3(0, 0, 0),
    cloudLit: blend("cloud-deep", "horizon-deep", 0.35),
    cloudShade: tokenRgb("cloud-deep"),
    cloudRim: new Vector3(0, 0, 0),
    landLight: tokenRgb("land-deep"),
  };
  return [
    { share: NIGHT_STOPS.day, look: summer },
    { share: NIGHT_STOPS.golden, look: goldenHour },
    { share: NIGHT_STOPS.dusk, look: dusk },
    { share: NIGHT_STOPS.night, look: deep },
  ];
}

const COLOURS = ["zenith", "horizon", "horizonSun", "band", "bandSun", "glow", "sunDisc", "cloudLit", "cloudShade", "cloudRim", "landLight"] as const;
const lerp = (from: number, to: number, share: number) => from + (to - from) * share;

/** Builds the sky's four looks once, and answers the look at any hour: the only part of the night the CPU works out, and only when the hour moves. */
export function skyAtHour(): (amount: number) => SkyLook {
  const stops = hourLooks();
  return (amount) => {
    const after = Math.max(1, stops.findIndex(({ share }) => share >= amount));
    const [from, to] = [stops[after - 1], stops[after]];
    const raw = Math.min(1, Math.max(0, (amount - from.share) / (to.share - from.share)));
    const share = raw * raw * (3 - 2 * raw);
    const look: SkyLook = {
      ...to.look,
      sun: { azimuthDeg: lerp(from.look.sun.azimuthDeg, to.look.sun.azimuthDeg, share), elevationDeg: lerp(from.look.sun.elevationDeg, to.look.sun.elevationDeg, share) },
      cloudCover: lerp(from.look.cloudCover, to.look.cloudCover, share),
      bandTop: lerp(from.look.bandTop, to.look.bandTop, share),
    };
    for (const name of COLOURS) look[name] = from.look[name].clone().lerp(to.look[name], share);
    return look;
  };
}
