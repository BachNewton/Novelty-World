import { Color, Vector3 } from "three";
import type { Sun } from "../../engine/astronomy";
import type { FeatureArt } from "../feature-art";
import { smooth } from "../light/sun";
import { SKY_INPUTS, type SkyInputs } from "./sky-inputs";

/*
 * Rainbows (`rainbow`): while it rains with the sun out, a bow stands
 * opposite the sun: the primary at 42° from the point straight opposite it,
 * red outside and violet in, a fainter secondary at about 51° with its
 * colours the other way round, the sky inside the primary a little brighter
 * and the band between the two (Alexander's band) a little darker. Only the
 * part of the circle above the horizon shows, so a high sun gives a low
 * bow, and above 42° none. It stands in the rain in front of whatever lies
 * past it, so it is drawn on the land beyond a little way off as well as on
 * the sky.
 *
 * The rain comes from `SKY_INPUTS` until the engine's weather drives it.
 */

/** How strong the bow is: the rain, the sun out, and the sun low enough to put the bow above the horizon. */
export function rainbowAt(sun: Sun, inputs: SkyInputs = SKY_INPUTS): number {
  return inputs.rain * inputs.sunOut * smooth(-1, 3, sun.elevation) * (1 - smooth(36, 42, sun.elevation));
}

const uniforms = {
  uHwRainbow: { value: 0 },
  /** Where the sun is: the bow centres on the point opposite. */
  uHwRainbowSun: { value: new Vector3(0, 1, 0) },
  /** The sunlight the raindrops split. */
  uHwRainbowLight: { value: new Color() },
};

const HEAD = /* glsl */ `
uniform float uHwRainbow;
uniform vec3 uHwRainbowSun;
uniform vec3 uHwRainbowLight;

// The colours across a bow, from violet on its inner edge (0) to red on its outer (1), fading out at both edges.
vec3 hwBow(float across) {
  if (across <= 0.0 || across >= 1.0) return vec3(0.0);
  float hue = (1.0 - across) * 0.76;
  vec3 colour = clamp(abs(fract(hue + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return colour * pow(sin(3.14159 * across), 0.8);
}

// A colour seen through the rain along a direction: the bows' light added, the sky inside brightened and Alexander's band darkened.
vec3 hwRainbow(vec3 colour, vec3 dir, float amount) {
  float angle = degrees(acos(clamp(dot(dir, -uHwRainbowSun), -1.0, 1.0)));
  // Each colour bends by its own angle: red outermost on the primary, innermost on the secondary.
  vec3 primary = hwBow((angle - 40.3) / 2.3);
  vec3 secondary = hwBow((53.6 - angle) / 3.4) * 0.42;
  float inside = (1.0 - smoothstep(38.0, 42.0, angle)) * 0.08;
  float between = smoothstep(42.4, 43.4, angle) * (1.0 - smoothstep(49.2, 50.2, angle)) * 0.14;
  vec3 bows = (primary + secondary) * uHwRainbowLight * 0.22;
  return colour + amount * (colour * (inside - between) + bows);
}
`;

export const RAINBOW_ART: FeatureArt = {
  feature: "rainbow",
  uniforms,
  chunks: [
    {
      kinds: ["sky"],
      fragmentHead: HEAD,
      colour: /* glsl */ `
        if (uHwRainbow > 0.0) {
          vec3 dir = normalize(vHwWorld - cameraPosition);
          hwColour = hwRainbow(hwColour, dir, uHwRainbow * smoothstep(-0.01, 0.03, dir.y));
        }
      `,
    },
    {
      kinds: ["land", "ground", "foliage", "solid", "water"],
      fragmentHead: HEAD,
      colour: /* glsl */ `
        if (uHwRainbow > 0.0) {
          vec3 toEye = vHwWorld - cameraPosition;
          float distance = length(toEye);
          // The bow is in the rain between the eye and what it sees, so only what lies a way off is seen through it.
          hwColour = hwRainbow(hwColour, toEye / distance, uHwRainbow * smoothstep(40.0, 260.0, distance));
        }
      `,
    },
  ],
  frame: ({ day, atmosphere }) => {
    const { sun } = day.sky;
    uniforms.uHwRainbow.value = rainbowAt(sun);
    uniforms.uHwRainbowSun.value.set(sun.direction.x, sun.direction.y, sun.direction.z);
    uniforms.uHwRainbowLight.value.copy(atmosphere.uHwSunColor.value);
  },
};
