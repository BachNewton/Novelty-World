import type { FeatureArt } from "../feature-art";
import { KEY_LIGHT_GLSL } from "../shadows/key-light";

/*
 * Light through leaves: a leaf with the sun behind it glows, deeper in its
 * own colour, brightest looking straight towards the light, which is the
 * golden-hour forest. How much light gets through comes from how much of the
 * plant the light has crossed to reach the leaf, read from the shadow map's
 * depth: the thin rim of a crown and a fern's frond shine, the heart of a
 * crown stays dark. With the shadows off, a leaf turned from the light lets a
 * steady share through.
 */

const LEAF_LIGHT_GLSL = /* glsl */ `
float hwToLight = max(dot(normalize(vHwWorld - cameraPosition), uHwSunDir), 0.0);
float hwGlow = 0.1 + 0.5 * hwToLight * hwToLight + 1.8 * pow(hwToLight, 8.0);
#ifdef HW_SUN_SHADOWS
  // Light thins as it crosses leaves and branches, by about half every metre.
  float hwThrough = uHwShadowStrength > 0.0 ? exp(-0.7 * hwLightThrough(vHwWorld)) : 0.4;
#else
  float hwThrough = 0.2 + 0.5 * max(-dot(hwNormal, uHwSunDir), 0.0);
#endif
// What a leaf lets through is its own colour, deepened: its strongest channel kept, the others thinned.
vec3 hwLeaf = diffuseColor.rgb * diffuseColor.rgb / max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 0.02));
hwDirect += uHwKeyLight * hwLeaf * 0.3183098862 * hwThrough * hwGlow;
`;

export const LEAF_LIGHT_ART: FeatureArt = {
  feature: "leafLight",
  chunks: [{ kinds: ["foliage"], fragmentHead: KEY_LIGHT_GLSL, light: LEAF_LIGHT_GLSL }],
};
