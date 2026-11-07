import { rhythm, type Rhythm } from "./characteristic";
import type { GlowInstance } from "./glows";
import data from "./lights.json";
import { nightRgb } from "./night";

/*
 * The sea's lights, from OSM's real tags (`lights.py`): every light on the map, with its own rhythm, in its own colour
 * in its own sectors, so a lighthouse shows white, red or green by where the eye is, as a chart says it will. Leading
 * lights are lights like any other, whose sectors happen to be narrow.
 *
 * No light on Åland turns: they are fixed lenses that flash, so every one, a lighthouse too, flashes from its own lamp,
 * with no beam.
 */

interface LightSector {
  character: string;
  colour: string;
  periodS: number;
  group?: string;
  sequence?: string;
  fromDeg?: number;
  toDeg?: number;
}

export interface SeaLight {
  x: number;
  z: number;
  kind: string;
  name?: string;
  heightM: number | null;
  rangeNm: number | null;
  sectors: LightSector[];
}

export const SEA_LIGHTS = data.lights as SeaLight[];

const METRES_A_NAUTICAL_MILE = 1852;
const FALLBACK_RANGE_NM = 3;
/** A light carries further in the game than its size in the haze would, or the sea would be empty at the scale it's seen. */
const RANGE_GAIN = 1.6;
const SIZE_M: Record<string, number> = { lighthouse: 14, leading: 10, beacon: 7, buoy: 4 };
const MIN_PIXELS: Record<string, number> = { lighthouse: 16, leading: 12, beacon: 10, buoy: 8 };
const FALLBACK_HEIGHT_M: Record<string, number> = { lighthouse: 12, leading: 14, beacon: 7, buoy: 4.2 };
const COLOURS: Record<string, string> = { white: "sea-white", red: "sea-red", green: "sea-green", yellow: "sea-yellow" };
const WATER_Y = 0.1;

const colourOf = (name: string) => nightRgb(COLOURS[name] ?? "sea-white");

/** Rolled from where a light is, so each keeps its own moment. */
export const shareOf = (x: number, z: number) => {
  const value = Math.sin(x * 0.0173 + z * 0.0311) * 9973.1;
  return value - Math.floor(value);
};

/** Every sea light as glows, a reflection under each, and the rhythms they read: each distinct rhythm once. */
export function seaLightGlows(lights: readonly SeaLight[] = SEA_LIGHTS): { glows: GlowInstance[]; rhythms: Rhythm[] } {
  const rhythms: Rhythm[] = [];
  const rows = new Map<string, number>();
  const glows: GlowInstance[] = [];
  for (const light of lights) {
    const y = light.heightM ?? FALLBACK_HEIGHT_M[light.kind];
    const reachM = (light.rangeNm ?? FALLBACK_RANGE_NM) * METRES_A_NAUTICAL_MILE * RANGE_GAIN;
    const phase = shareOf(light.x, light.z);
    for (const sector of light.sectors) {
      const found = rhythm(sector);
      const key = JSON.stringify(found);
      if (!rows.has(key)) {
        rows.set(key, rhythms.length);
        rhythms.push(found);
      }
      const glow: GlowInstance = {
        x: light.x,
        y,
        z: light.z,
        sizeM: SIZE_M[light.kind],
        minPixels: MIN_PIXELS[light.kind],
        colour: colourOf(sector.colour),
        brightness: 1,
        reachM,
        rhythm: rows.get(key) ?? -1,
        periodS: found.periodS,
        phase,
        fromDeg: sector.fromDeg,
        toDeg: sector.toDeg,
      };
      glows.push(glow, { ...glow, y: WATER_Y, brightness: 0.6, streak: true, reachM: reachM * 0.5 });
    }
  }
  return { glows, rhythms };
}

const HARBOUR_LAMPS = 7;
const HARBOUR_SPREAD_M = 70;
const HARBOUR_LAMP_M = 6;
const HARBOUR_REACH_M = 5000;

/** Warm working lamps round a place that's a harbour, each with its streak on the water: real harbours, invented lamps. `marina.places` has no lamps of its own. */
export function harbourGlows(harbours: readonly { x: number; z: number }[]): GlowInstance[] {
  const glows: GlowInstance[] = [];
  for (const { x, z } of harbours) {
    for (let lamp = 0; lamp < HARBOUR_LAMPS; lamp++) {
      const turn = shareOf(x + lamp * 91, z - lamp * 37) * Math.PI * 2;
      const out = shareOf(x - lamp * 53, z + lamp * 11) * HARBOUR_SPREAD_M;
      const glow: GlowInstance = { x: x + Math.cos(turn) * out, y: HARBOUR_LAMP_M, z: z + Math.sin(turn) * out, sizeM: 3, minPixels: 7, colour: nightRgb("lamp-harbour"), brightness: 1, reachM: HARBOUR_REACH_M, rhythm: -1, periodS: 1, phase: 0, strikes: shareOf(z, x) * 0.7 };
      glows.push(glow, { ...glow, y: WATER_Y, brightness: 0.5, streak: true, reachM: HARBOUR_REACH_M * 0.4 });
    }
  }
  return glows;
}
