import type { FeatureArt } from "../feature-art";

/*
 * The shore: where the water is very shallow it brightens to a soft edge,
 * and a slow lace of foam laps along it, breathing in and out, so every
 * shoreline reads against the land at a glance.
 */

const LIGHT = /* glsl */ `
  // A river is shallow all across: only its very edge brightens.
  float reach = (0.28 + 0.12 * sin(uHwTime * 0.8 + hwP.x * 0.3 + hwP.y * 0.2)) * (1.0 - 0.7 * hwMoving);
  float edge = 1.0 - smoothstep(0.0, reach, hwDepth);
  float glow = 1.0 - smoothstep(0.0, reach * 2.0, hwDepth);
  hwBody += uFoam * hwLight * 0.14 * glow;
  float lace = smoothstep(0.45, 0.75, hwValueNoise(hwP * 2.2 + uHwTime * 0.15));
  hwFoam = max(hwFoam, edge * (0.5 + 0.5 * lace) * 0.85);
`;

export const SHORE_ART: FeatureArt = {
  feature: "shoreHighlight",
  chunks: [{ kinds: ["water"], light: LIGHT }],
};
