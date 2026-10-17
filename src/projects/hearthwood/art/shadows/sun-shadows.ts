import type { FeatureArt, MaterialKind } from "../feature-art";
import { KEY_LIGHT_GLSL, KEY_LIGHT_UNIFORMS, updateKeyLight } from "./key-light";
import { SHADOW_GLSL, SHADOW_UNIFORMS, shadowLight, shadowMapPass } from "./shadow-map";

/*
 * The key light's shadows: the maps drawn before the scene, and every lit
 * surface darkened where they fall. Only the key light's own share of the
 * light is taken away, so the campfire still lights what lies in the sun's
 * shadow. What a shadow leaves is the light of the sky and the ground, so a
 * shadow takes the moment's own colour.
 */

/** Everything that takes the key light's shadows. */
export const SHADOW_RECEIVERS: readonly MaterialKind[] = ["land", "ground", "foliage", "solid", "water"];

/** The sun's apparent radius, as the tangent of its angle: a little wider than the real sun's quarter of a degree, for a storybook's soft edge. */
const SUN_ANGLE = 0.011;
/** The least a sun shadow's edge is softened, in metres. */
const SUN_BLUR = 0.012;

export function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const SUN_SHADOWS_ART: FeatureArt = {
  feature: "sunShadows",
  uniforms: { ...SHADOW_UNIFORMS, ...KEY_LIGHT_UNIFORMS },
  chunks: [
    { kinds: SHADOW_RECEIVERS, fragmentHead: `${KEY_LIGHT_GLSL}\n${SHADOW_GLSL}` },
    {
      kinds: ["land", "ground", "foliage", "solid"],
      light: /* glsl */ `hwDirect -= hwKeyDirect(hwNormal, diffuseColor.rgb) * (1.0 - hwShadowAt(vHwWorld, hwNormal));`,
    },
    // The water lights itself from the sky's light and the key light's (`hwLight`): in shadow its body, its foam and its glints keep only the sky's.
    {
      kinds: ["water"],
      light: /* glsl */ `
        float hwLit = hwShadowAt(vHwWorld, vec3(0.0, 1.0, 0.0));
        vec3 hwShaded = uHwSkyLight + uHwSunLight * hwLit;
        hwBody *= hwShaded / max(hwLight, vec3(1e-4));
        hwSpecular *= hwLit;
        hwLight = hwShaded;
      `,
    },
  ],
  frame: (frame) => {
    updateKeyLight(frame);
    const { key } = frame.day.sky;
    shadowLight.casting = key.body === "sun";
    shadowLight.angle = SUN_ANGLE;
    shadowLight.blur = SUN_BLUR;
    // Shadows fade out over the last few degrees above the horizon, before they could stretch across the land.
    shadowLight.strength = smooth(0.02, 0.07, key.direction.y);
  },
  passes: [{ id: "shadow-maps", stage: "before", order: 0, create: shadowMapPass }],
};
