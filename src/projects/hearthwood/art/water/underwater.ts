import { Vector3 } from "three";
import type { FeatureArt } from "../feature-art";
import { REGION_ABSORPTION, WATER_COLUMN_GLSL, type Absorption } from "./absorption";

/*
 * Under the water. The scene tells the water where its surface lies above
 * the eye (`setWaterAtEye`, from the engine's water table where the camera
 * is, and the absorption of the region's water there); with the eye under
 * it, everything drawn fades into the water's own colour by how far light
 * travels through water to reach the eye (only the stretch below the
 * surface counts, for anything seen up through it), and the water's colour
 * darkens the deeper the eye goes. The campfire and the fireflies are never
 * under water, so they are left as they are.
 */

/** Where the water's surface lies at the eye, if the eye is over water at all. */
export interface WaterAtEye {
  level: number | null;
  absorb: Absorption;
}

const eye: WaterAtEye = { level: null, absorb: REGION_ABSORPTION.greenwood };

/** The scene says where the water is at the eye, every frame: its surface's height (null on dry land) and its absorption. */
export function setWaterAtEye(level: number | null, absorb: Absorption): void {
  eye.level = level;
  eye.absorb = absorb;
}

/** Where the water is at the eye now. */
export function waterAtEye(): Readonly<WaterAtEye> {
  return eye;
}

/** Far below anything, for an eye that is over dry land. */
const NO_WATER = -1e9;

const uniforms = {
  /** The height of the water's surface over the eye. */
  uHwEyeWater: { value: NO_WATER },
  uHwEyeAbsorb: { value: new Vector3(...REGION_ABSORPTION.greenwood) },
};

const HEAD = /* glsl */ `
uniform float uHwEyeWater;
uniform vec3 uHwEyeAbsorb;
${WATER_COLUMN_GLSL}
`;

const COLOUR = /* glsl */ `
  if (cameraPosition.y < uHwEyeWater) {
    vec3 ray = vHwWorld - cameraPosition;
    float whole = length(ray);
    float wet = vHwWorld.y <= uHwEyeWater ? whole : whole * (uHwEyeWater - cameraPosition.y) / max(ray.y, 1e-4);
    // The light reaching the eye has come down through the water above it first.
    vec3 down = exp(-(uHwEyeAbsorb + HW_WATER_SCATTER) * (uHwEyeWater - cameraPosition.y));
    hwColour = hwThroughWater(hwColour, uHwEyeAbsorb, wet, (uHwSkyLight + uHwSunLight) * down);
  }
`;

export const UNDERWATER_ART: FeatureArt = {
  feature: "underwaterFog",
  uniforms,
  chunks: [{ kinds: ["land", "ground", "foliage", "solid", "water", "sky"], fragmentHead: HEAD, colour: COLOUR }],
  frame: () => {
    uniforms.uHwEyeWater.value = eye.level ?? NO_WATER;
    uniforms.uHwEyeAbsorb.value.set(...eye.absorb);
  },
};
