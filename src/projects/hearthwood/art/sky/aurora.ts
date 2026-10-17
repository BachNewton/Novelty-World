import { Color } from "three";
import { createRng } from "@/shared/lib/seeded-random";
import type { Sun } from "../../engine/astronomy";
import type { CalendarDate, Season } from "../../engine/calendar";
import type { FeatureArt } from "../feature-art";
import { smooth } from "../light/sun";
import { SKY_INPUTS, sighted, type Sighting } from "./sky-inputs";
import { SKY_NOISE_GLSL } from "./sky-noise";
import { skyColours } from "./tokens";

/*
 * The northern lights (`aurora`): on some clear nights, seeded so no two
 * nights are alike, curtains of green with violet edges hang in the north,
 * drifting and rippling, some nights faint and some nights a show. Mostly
 * in the long dark of autumn and winter; summer's bright nights hide them.
 * They light the land a little green (the light from the sky all round
 * takes `auroraLight`), and their light is offered to anything else lit by
 * the sky, such as clouds (`uHwAuroraLight`).
 *
 * The curtains are drawn as the real ones stand: sheets about a hundred
 * kilometres up and more, running east to west across the northern sky,
 * with fine rays down them. The sky's shader steps up through them along
 * each view and gathers their light: green from the oxygen low down, violet
 * at the lower fringe and the tops.
 */

/** The chance of the northern lights on a night, by the season. */
const CHANCE: Record<Season, number> = { autumn: 0.45, winter: 0.4, spring: 0.25, summer: 0.06 };

/** The night a date falls in: a night belongs to the day whose evening it began on. */
export function nightOf(date: CalendarDate): number {
  return date.hour < 12 ? date.day - 1 : date.day;
}

/** How strong a night's northern lights are, 0 for none: seeded by the night, so it is always the same night's show. */
export function auroraTonight(date: CalendarDate): number {
  const rng = createRng(`hearthwood-aurora-${nightOf(date)}`);
  if (rng.next() >= CHANCE[date.season]) return 0;
  return 0.3 + 0.7 * Math.pow(rng.next(), 1.5);
}

/** How lively the show is through the night: brightest round midnight, at a seeded hour, quieter in the evening and towards dawn. */
function activity(date: CalendarDate): number {
  const rng = createRng(`hearthwood-aurora-peak-${nightOf(date)}`);
  const peak = (rng.next() - 0.5) * 3;
  const fromMidnight = ((date.hour + 12) % 24) - 12;
  return 0.3 + 0.7 * Math.exp(-((fromMidnight - peak) ** 2) / (2 * 2.2 * 2.2));
}

/** How bright the northern lights are now, 0 to 1: the night's show, how lively it is, and how dark the sky is. */
export function auroraAt(date: CalendarDate, sun: Sun, sighting: Sighting = SKY_INPUTS.aurora): number {
  const dark = 1 - smooth(-14, -7, sun.elevation);
  if (dark === 0) return 0;
  return sighted(sighting, auroraTonight(date)) * activity(date) * dark;
}

/** The light the aurora casts on the land at its fullest, against the sky's own brightness. */
export const AURORA_LIGHT = 0.05;

const uniforms = {
  uHwAuroraStrength: { value: 0 },
  uHwAuroraTime: { value: 0 },
  uHwAuroraGreen: { value: new Color() },
  uHwAuroraViolet: { value: new Color() },
  /** The aurora's light on whatever the sky lights, for other features (clouds) to take. */
  uHwAuroraLight: { value: new Color() },
};

const HEAD = /* glsl */ `
uniform float uHwAuroraStrength;
uniform float uHwAuroraTime;
uniform vec3 uHwAuroraGreen;
uniform vec3 uHwAuroraViolet;
uniform vec3 uHwAuroraLight;
${SKY_NOISE_GLSL}

// How much curtain stands at a point (kilometres east and south of the eye) of the layer at a height: a few sheets running east to west in the north, wandering, folding and rippling.
float hwAuroraCurtain(vec2 p, float height, float t) {
  float wander = 90.0 * sin(p.x / 420.0 + t * 0.03) + 60.0 * (hwSkyNoise3(vec3(p.x / 260.0, t * 0.02, 1.0)) - 0.5) * 2.0;
  float sum = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float line = -170.0 - 130.0 * fk + wander * (1.0 - 0.3 * fk) + 25.0 * sin(p.x / (130.0 + 40.0 * fk) - t * (0.08 + 0.03 * fk));
    float width = 7.0 + 9.0 * hwSkyNoise3(vec3(p.x / 90.0, fk * 3.1, t * 0.05));
    float sheet = exp(-pow((p.y - line) / width, 2.0));
    // The fine rays down a curtain, and its light gathering and fading along it.
    float rays = 0.45 + 0.55 * hwSkyNoise3(vec3(p.x / 4.5 + fk * 7.0, t * 0.25, 0.0));
    float along = smoothstep(0.25, 0.7, hwSkyNoise3(vec3(p.x / 180.0 + fk * 5.0, t * 0.04, 2.0)));
    sum += sheet * rays * along * (1.0 - 0.35 * fk);
  }
  return sum;
}
`;

const COLOUR = /* glsl */ `
  vec3 dir = normalize(vHwWorld - cameraPosition);
  if (uHwAuroraStrength > 0.0 && dir.y > 0.015) {
    vec3 glow = vec3(0.0);
    const int LAYERS = 32;
    float jitter = hwSkyHash4(floor(dir * 1500.0)).x;
    for (int i = 0; i < LAYERS; i++) {
      float f = (float(i) + jitter) / float(LAYERS);
      float height = 92.0 + 150.0 * f;
      // Along the view to that height over the curved earth (kilometres).
      float distance = (sqrt(dir.y * dir.y * 6371.0 * 6371.0 + 2.0 * 6371.0 * height + height * height) - dir.y * 6371.0);
      vec2 p = dir.xz * distance;
      float curtain = hwAuroraCurtain(p, height, uHwAuroraTime);
      float green = smoothstep(93.0, 102.0, height) * exp(-max(0.0, height - 106.0) / 30.0);
      float violet = exp(-pow((height - 95.0) / 3.5, 2.0)) * 0.7 + smoothstep(150.0, 190.0, height) * exp(-max(0.0, height - 190.0) / 30.0) * 0.3;
      glow += (uHwAuroraGreen * green + uHwAuroraViolet * violet) * curtain;
    }
    hwColour += glow / float(LAYERS) * uHwAuroraStrength * smoothstep(0.015, 0.12, dir.y);
  }
`;

/** How bright the curtains are drawn, at the sky's own brightness, on a night that is a show. */
const BRIGHTNESS = 4.5;

export const AURORA_ART: FeatureArt = {
  feature: "aurora",
  uniforms,
  chunks: [{ kinds: ["sky"], fragmentHead: HEAD, colour: COLOUR }],
  frame: ({ day }) => {
    const strength = auroraAt(day.date, day.sky.sun);
    const colours = skyColours();
    uniforms.uHwAuroraStrength.value = strength * BRIGHTNESS;
    uniforms.uHwAuroraTime.value = day.motion;
    uniforms.uHwAuroraGreen.value.copy(colours["aurora-green"]);
    uniforms.uHwAuroraViolet.value.copy(colours["aurora-violet"]);
    uniforms.uHwAuroraLight.value.copy(colours["aurora-green"]).multiplyScalar(strength * AURORA_LIGHT);
  },
};
