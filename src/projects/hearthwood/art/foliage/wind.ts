import { Vector2 } from "three";
import type { FeatureArt } from "../feature-art";
import { weatherInput } from "../shadows/weather-input";

/*
 * The plants in the wind: every tree, bush and flower leans downwind and
 * rocks in its own time, more the higher up the plant, while its branches
 * and leaves flutter on top. Gusts roll across the land with the wind as
 * broad patches of stronger air, so a meadow ripples and a wood sways in
 * waves. How hard and which way it blows comes from the weather
 * (`weather-input.ts`, the engine's weather). The plants' shadows
 * move with them, as their shadow casters run this same code.
 */

export const WIND_UNIFORMS = {
  /** How hard the wind blows, 0 still to 1 a gale. */
  uHwWind: { value: 0.35 },
  /** Which way it blows towards, across the land (x, z). */
  uHwWindDir: { value: new Vector2(1, 0) },
};

/**
 * Turns `hwShift`, a shift in the world in metres, into the plant's own
 * space, where `transformed` lies: a plant's placing is a turn, a lean and a
 * scale along each axis, so each axis of its own space is a column of its
 * matrix, as long as its scale.
 */
export const INSTANCE_SHIFT_GLSL = /* glsl */ `
transformed += vec3(
  dot(instanceMatrix[0].xyz, hwShift) / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz),
  dot(instanceMatrix[1].xyz, hwShift) / dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz),
  dot(instanceMatrix[2].xyz, hwShift) / dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz)
);
`;

// A plant's shape stands one unit tall (or about a unit across), so its height squared bends the top and leaves the root.
const SWAY_GLSL = /* glsl */ `
#ifdef USE_INSTANCING
  vec3 hwRoot = instanceMatrix[3].xyz;
  float hwTall = length(instanceMatrix[1].xyz);
  float hwUp = max(position.y, 0.0);
  float hwBend = hwUp * hwUp;
  vec2 hwDrift = uHwWindDir * uHwTime * (1.5 + 6.0 * uHwWind);
  float hwGust = hwValueNoise((hwRoot.xz - hwDrift) * 0.035) * 0.7 + hwValueNoise((hwRoot.xz - hwDrift * 1.3) * 0.11) * 0.3;
  float hwBlow = uHwWind * (0.45 + 1.3 * hwGust * hwGust);
  float hwPhase = uHwTime * (1.2 + 0.8 * uHwWind) + hwRoot.x * 0.21 + hwRoot.z * 0.17;
  float hwRock = sin(hwPhase) * 0.6 + sin(hwPhase * 2.3 + 1.7) * 0.25;
  // A tree's crown moves a hand or two; a flower's head nearly its own width.
  float hwReach = 0.06 + 0.12 * hwTall / (1.0 + 0.08 * hwTall);
  vec2 hwSide = vec2(-uHwWindDir.y, uHwWindDir.x);
  vec2 hwLean = (uHwWindDir * hwBlow * (0.55 + 0.35 * hwRock) + hwSide * 0.15 * hwBlow * sin(hwPhase * 0.7 + 2.0)) * hwReach * hwBend;
  // Each branch round the trunk sways in its own time, and each leaf flutters faster.
  float hwBranch = sin(uHwTime * 2.3 + atan(position.z, position.x + 1e-4) * 2.0 + hwPhase) * length(position.xz) * hwUp;
  float hwLeaf = sin(uHwTime * 9.0 + dot(position, vec3(23.1, 17.3, 19.7)) + hwPhase);
  vec3 hwShift = vec3(hwLean.x, 0.0, hwLean.y);
  hwShift += vec3(hwSide.x, 0.35, hwSide.y) * hwBranch * hwBlow * 0.05 * hwReach * 4.0;
  hwShift += vec3(0.6, 0.5, -0.6) * hwLeaf * hwBlow * 0.012 * hwTall * hwUp / (1.0 + 0.05 * hwTall);
  ${INSTANCE_SHIFT_GLSL}
#endif
`;

export const SWAY_ART: FeatureArt = {
  feature: "sway",
  uniforms: WIND_UNIFORMS,
  chunks: [
    {
      kinds: ["foliage"],
      vertexHead: /* glsl */ `uniform float uHwWind;\nuniform vec2 uHwWindDir;`,
      vertex: SWAY_GLSL,
    },
  ],
  frame: ({ weather }) => {
    const { wind, windToward } = weatherInput(weather.weather);
    WIND_UNIFORMS.uHwWind.value = wind;
    WIND_UNIFORMS.uHwWindDir.value.set(Math.cos(windToward), Math.sin(windToward));
  },
};
