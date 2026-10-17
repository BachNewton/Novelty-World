import { groundSeason } from "../../engine/seasons";
import type { FeatureArt } from "../feature-art";

/*
 * Winter ice at the edges of lakes and rivers. It grows out from the shore
 * into deeper water as winter comes on and melts back in spring, by the
 * seasons' own ice on the ground's calendar (`engine/seasons.ts`), so the
 * water freezes as the land's snow lies. Running water freezes only along its
 * edges, and a falling river never. The ice's edge wanders, it is pale and
 * matt with a dusting of snow and dark cracks, and its surface is flat, so
 * no ripple crosses it.
 */

/** How deep the water is that the ice reaches out over at its greatest, in metres. */
const ICE_REACH = 2.2;

const uniforms = { uHwIceCover: { value: 0 } };

const HEAD = /* glsl */ `
uniform float uHwIceCover;
// How frozen the surface is at a point of water this deep.
float hwIceAt(vec2 p, float depth, float moving, float falling) {
  float reach = uHwIceCover * ${ICE_REACH.toFixed(2)} * (1.0 - 0.8 * moving) * (1.0 - falling);
  float edge = reach + uHwIceCover * ((hwValueNoise(p * 0.07) - 0.5) * 1.4 + (hwValueNoise(p * 0.5) - 0.5) * 0.25);
  return (1.0 - smoothstep(edge - 0.05, edge, depth)) * step(0.001, reach);
}
`;

const NORMAL = /* glsl */ `
  hwIce = hwIceAt(hwP, hwDepth, hwMoving, hwFalling);
  hwNormal = normalize(mix(hwNormal, vec3(0.0, 1.0, 0.0), hwIce));
`;

const LIGHT = /* glsl */ `
  float dust = smoothstep(0.3, 0.75, hwValueNoise(hwP * 0.7) * 0.6 + hwValueNoise(hwP * 3.1) * 0.4);
  // Fine dark cracks, straighter than the noise they come from: two ridges of it, crossing.
  float ridgeA = abs(hwValueNoise(hwP * vec2(0.9, 0.25) + 3.1) - 0.5);
  float ridgeB = abs(hwValueNoise(mat2(0.6, -0.8, 0.8, 0.6) * hwP * vec2(0.9, 0.3) + 7.7) - 0.5);
  float crack = 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.018, min(ridgeA, ridgeB))) * (1.0 - dust);
  vec3 ice = mix(mix(uShallow, uFoam, 0.7), uFoam, dust) * hwLight * crack;
  // The rim where the ice meets the open water is wet and darker.
  float rim = smoothstep(0.0, 0.25, hwIce) * (1.0 - smoothstep(0.25, 0.9, hwIce));
  ice *= 1.0 - 0.25 * rim;
  hwBody = mix(hwBody, ice, hwIce);
  hwFresnel = mix(hwFresnel, 0.05, hwIce);
  hwSpecular *= 1.0 - 0.85 * hwIce;
  hwFoam *= 1.0 - hwIce;
`;

export const ICE_ART: FeatureArt = {
  feature: "lakeIce",
  uniforms,
  chunks: [{ kinds: ["water"], fragmentHead: HEAD, normal: NORMAL, light: LIGHT }],
  frame: ({ day }) => {
    uniforms.uHwIceCover.value = groundSeason(day.date.realDayOfYear).ice;
  },
};
