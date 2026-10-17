import { Color, Vector3 } from "three";
import { createRng } from "@/shared/lib/seeded-random";
import type { Sun } from "../../engine/astronomy";
import type { CalendarDate } from "../../engine/calendar";
import type { FeatureArt } from "../feature-art";
import { smooth } from "../light/sun";
import { nightOf } from "./aurora";
import { SKY_INPUTS, sighted, type Sighting } from "./sky-inputs";
import { SKY_NOISE_GLSL } from "./sky-noise";
import { skyColours } from "./tokens";

/*
 * Noctilucent clouds (`noctilucent`): the highest clouds there are, thin
 * ice about 82 km up, seen only on some summer nights, low over the
 * northern horizon, glowing electric blue-white while the sun, below the
 * horizon for the land, still lights them from beneath. Drawn as a layer of
 * billows and fine ripples at that height, where the sun's side of the sky
 * meets the deepening twilight.
 */

/** The real days of the year they are seen on (early June to early August), and the chance of a night in that season showing them. */
const SEASON = { from: 155, peak: 190, to: 222 } as const;
const CHANCE = 0.4;

/** How strong a night's noctilucent clouds are, 0 for none: seeded by the night, mostly round midsummer's end. */
export function noctilucentTonight(date: CalendarDate): number {
  const day = date.realDayOfYear;
  if (day < SEASON.from || day > SEASON.to) return 0;
  const rng = createRng(`hearthwood-noctilucent-${nightOf(date)}`);
  if (rng.next() >= CHANCE) return 0;
  const inSeason = day < SEASON.peak ? smooth(SEASON.from, SEASON.peak, day) : 1 - smooth(SEASON.peak, SEASON.to, day);
  return (0.4 + 0.6 * rng.next()) * inSeason;
}

/** How bright they are now: the night's, while the sun is between about 6° and 16° below the horizon, lighting them from beneath a sky dark enough to show them. */
export function noctilucentAt(date: CalendarDate, sun: Sun, sighting: Sighting = SKY_INPUTS.noctilucent): number {
  const twilight = smooth(-4.5, -7, sun.elevation) * (1 - smooth(-13, -16.5, sun.elevation));
  if (twilight === 0) return 0;
  return sighted(sighting, noctilucentTonight(date)) * twilight;
}

const uniforms = {
  uHwNoctilucent: { value: new Color() },
  /** The sun's bearing along the ground, which side of the sky they glow on. */
  uHwNoctilucentSun: { value: new Vector3(0, 0, -1) },
};

const HEAD = /* glsl */ `
uniform vec3 uHwNoctilucent;
uniform vec3 uHwNoctilucentSun;
${SKY_NOISE_GLSL}
`;

const COLOUR = /* glsl */ `
  vec3 dir = normalize(vHwWorld - cameraPosition);
  if (uHwNoctilucent.b > 0.0 && dir.y > 0.005) {
    // Where the view meets the layer 82 km up, over the curved earth (kilometres).
    float distance = sqrt(dir.y * dir.y * 6371.0 * 6371.0 + 2.0 * 6371.0 * 82.0 + 82.0 * 82.0) - dir.y * 6371.0;
    vec2 p = dir.xz * distance;
    float bearing = dot(normalize(p), uHwNoctilucentSun.xz);
    float where = smoothstep(-0.3, 0.7, bearing) * smoothstep(180.0, 380.0, distance) * (1.0 - smoothstep(800.0, 1200.0, distance));
    // Long billows across the sky, with fine ripples running over them.
    vec2 q = vec2(p.x * 0.8 + p.y * 0.6, p.y * 0.8 - p.x * 0.6);
    float billows = hwSkyFbm3(vec3(q.x / 120.0, q.y / 38.0, 4.0));
    float ripples = 0.6 + 0.4 * sin(q.y / 6.0 + 3.0 * hwSkyNoise3(vec3(q / 25.0, 9.0)));
    float cloud = smoothstep(0.42, 0.78, billows) * ripples;
    hwColour += uHwNoctilucent * cloud * where;
  }
`;

/** How bright they are drawn, against the twilight they show in. */
const BRIGHTNESS = 0.45;

export const NOCTILUCENT_ART: FeatureArt = {
  feature: "noctilucent",
  uniforms,
  chunks: [{ kinds: ["sky"], fragmentHead: HEAD, colour: COLOUR }],
  frame: ({ day }) => {
    const { sun } = day.sky;
    const strength = noctilucentAt(day.date, sun);
    uniforms.uHwNoctilucent.value.copy(skyColours().noctilucent).multiplyScalar(strength * BRIGHTNESS);
    const flat = Math.hypot(sun.direction.x, sun.direction.z) || 1;
    uniforms.uHwNoctilucentSun.value.set(sun.direction.x / flat, 0, sun.direction.z / flat);
  },
};
