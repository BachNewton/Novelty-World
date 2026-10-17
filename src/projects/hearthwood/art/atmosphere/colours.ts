import type { Color } from "three";
import { themeColor } from "@/shared/lib/three/theme-color";
import { REGIONS, type Region } from "../../engine/regions";

/*
 * The weather's own colours, read once from their tokens in globals.css:
 * each region's mist, the clouds, rain, snow, the lightning and standing
 * water. The light they are lit by is the day's (`daylight.tsx`), never
 * their own.
 */

export interface WeatherColours {
  mist: Record<Region, Color>;
  cloud: Color;
  cloudShade: Color;
  rain: Color;
  snow: Color;
  lightning: Color;
  puddle: Color;
}

let read: WeatherColours | null = null;

const token = (name: string) => themeColor(`--color-hearthwood-valley-${name}`);

export function weatherColours(): WeatherColours {
  read ??= {
    mist: Object.fromEntries(REGIONS.map((region) => [region, token(`mist-${region}`)])) as Record<Region, Color>,
    cloud: token("cloud"),
    cloudShade: token("cloud-shade"),
    rain: token("rain"),
    snow: token("snow"),
    lightning: token("lightning"),
    puddle: token("puddle"),
  };
  return read;
}

/** A colour blended from each region's, by a point's share of each. */
export function blendByRegion(colours: Record<Region, Color>, weights: Float32Array, out: Color): Color {
  out.setRGB(0, 0, 0);
  REGIONS.forEach((region, i) => {
    const c = colours[region];
    out.setRGB(out.r + c.r * weights[i], out.g + c.g * weights[i], out.b + c.b * weights[i]);
  });
  return out;
}
