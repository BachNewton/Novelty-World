import type { FeatureArt } from "../feature-art";
import { SHADOW_RECEIVERS } from "./sun-shadows";

/*
 * Soft shadows that harden where they touch: a shadow's edge is as wide as
 * the light's disc seen past whatever casts it, so it is crisp at a trunk's
 * foot and soft where a crown's shadow falls far below it. First a search
 * round the point finds how far off its casters are, then a filter as wide
 * as that distance gives softens the edge.
 */

const SOFT_GLSL = /* glsl */ `
#ifdef HW_SUN_SHADOWS
// How far from a point a caster's shadow is searched for, in metres of the caster's height above it.
#define HW_SHADOW_SEARCH 25.0

float hwShadowSoft(vec3 c, int k, float turn) {
  float texel = hwOfMap(uHwShadowTexel, k);
  float search = clamp(uHwShadowAngle * HW_SHADOW_SEARCH / texel, 1.5, 32.0);
  float blockers = 0.0;
  float found = 0.0;
  for (int i = 0; i < 12; i++) {
    float depth = hwLightDepth(c.xy + hwShadowDisc(i, 12, turn + 1.7) * search / uHwShadowSize, k);
    if (depth > c.z) {
      blockers += depth;
      found += 1.0;
    }
  }
  // In the open, or deep in a shadow's core, the filter would only agree.
  if (found == 0.0) return 1.0;
  if (found == 12.0) return 0.0;
  float apart = (blockers / found - c.z) * hwOfMap(uHwShadowDepthRange, k);
  float radius = clamp(max(apart * uHwShadowAngle, uHwShadowBlur) / texel, 1.0, 32.0);
  return hwShadowFilter(c, k, radius, 16, turn);
}
#endif
`;

export const SOFT_SHADOWS_ART: FeatureArt = {
  feature: "softShadows",
  chunks: [{ kinds: SHADOW_RECEIVERS, fragmentHead: SOFT_GLSL }],
};
