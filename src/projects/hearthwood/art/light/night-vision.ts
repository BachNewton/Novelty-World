import { Color } from "three";
import type { FeatureArt } from "../feature-art";
import { skyColours } from "../sky/tokens";
import { smooth } from "./sun";

/*
 * Night vision (`nightVision`), the Purkinje shift: in the dark the eye's
 * colour-seeing cones give way to its rods, which see no colour and are
 * most sensitive to blue-green light, so a moonlit wood drains of colour
 * and turns blue. It happens by how dim a thing is, so anything well lit
 * keeps its colour: the campfire, and the ground its light falls on, stay
 * warm, and firelight is spared even where it fades, while the woods round
 * it go moonlit blue. The campfire's flames and glow and the fireflies are
 * light of their own, never shifted.
 */

const uniforms = {
  /** How far into the night the eye is, 0 by day. */
  uHwNightVision: { value: 0 },
  uHwNightVisionTint: { value: new Color() },
};

const HEAD = /* glsl */ `
uniform float uHwNightVision;
uniform vec3 uHwNightVisionTint;
`;

const COLOUR = /* glsl */ `
  if (uHwNightVision > 0.0) {
    float luma = dot(hwColour, vec3(0.2126, 0.7152, 0.0722));
    // What the rods see: mostly green and blue, none of the red.
    float rods = dot(hwColour, vec3(0.05, 0.62, 0.48));
    float warm = smoothstep(0.08, 0.45, (hwColour.r - hwColour.b) / (hwColour.r + hwColour.b + 1e-4));
    float dim = exp(-luma / 0.07);
    float shift = uHwNightVision * dim * (1.0 - 0.85 * warm);
    hwColour = mix(hwColour, rods * uHwNightVisionTint, shift * 0.85);
  }
`;

export const NIGHT_VISION_ART: FeatureArt = {
  feature: "nightVision",
  uniforms,
  chunks: [{ kinds: ["sky", "land", "ground", "foliage", "solid", "water"], fragmentHead: HEAD, colour: COLOUR }],
  frame: ({ day }) => {
    uniforms.uHwNightVision.value = smooth(-2, -10, day.sky.sun.elevation);
    const tint = skyColours()["night-vision"];
    const luma = 0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b;
    uniforms.uHwNightVisionTint.value.copy(tint).multiplyScalar(1 / luma);
  },
};
