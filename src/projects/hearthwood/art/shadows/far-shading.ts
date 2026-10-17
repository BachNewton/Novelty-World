import type { FeatureArt } from "../feature-art";
import { KEY_LIGHT_GLSL } from "./key-light";

/*
 * The far land's own shading: past where the shadow maps reach (or
 * everywhere, with the shadows off), a slope turned from the light goes over
 * into shade more firmly than the plain lighting gives, so a range far off
 * still shows a lit side and a shaded one. It is only the land's own normals
 * and the light, with no shadow map: cheap at any distance.
 */

const FAR_SHADING_GLSL = /* glsl */ `
float hwTurned = 1.0 - smoothstep(-0.04, 0.32, dot(hwNormal, uHwSunDir));
#ifdef HW_SUN_SHADOWS
  float hwBeyond = smoothstep(uHwShadowFade.x, uHwShadowFade.y, length(vHwWorld - cameraPosition));
#else
  float hwBeyond = 1.0;
#endif
hwDirect -= hwKeyDirect(hwNormal, diffuseColor.rgb) * hwTurned * hwBeyond;
hwIndirect *= 1.0 - 0.18 * hwTurned * hwBeyond;
`;

export const FAR_SHADING_ART: FeatureArt = {
  feature: "farShading",
  chunks: [{ kinds: ["land"], fragmentHead: KEY_LIGHT_GLSL, light: FAR_SHADING_GLSL }],
};
