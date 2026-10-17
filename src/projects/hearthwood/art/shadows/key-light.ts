import { Color } from "three";
import type { FeatureFrame } from "../feature-art";

/*
 * The key light's own share of what a surface gives back. Three adds every
 * direct light into one sum (the sun or moon, and the campfire's flicker),
 * so a shadow can't darken that sum without darkening the fire too: the
 * shadows and foliage work out the key light's part themselves, the same
 * Lambert term three used, and change only that.
 */

/** The key light's colour times its strength, as the directional light shines it: set every frame by any feature that reads it. */
export const KEY_LIGHT_UNIFORMS = { uHwKeyLight: { value: new Color() } };

export function updateKeyLight({ day, atmosphere }: FeatureFrame): void {
  KEY_LIGHT_UNIFORMS.uHwKeyLight.value.copy(atmosphere.uHwSunColor.value).multiplyScalar(day.light.sun * day.sky.key.strength);
}

/**
 * `hwKeyDirect(normal, albedo)`: the light the key light alone gives a
 * surface, as three's Lambert term gives it. Guarded, so every feature that
 * reads it can declare it.
 */
export const KEY_LIGHT_GLSL = /* glsl */ `
#ifndef HW_KEY_LIGHT
#define HW_KEY_LIGHT
uniform vec3 uHwKeyLight;
vec3 hwKeyDirect(vec3 normal, vec3 albedo) {
  return max(dot(normal, uHwSunDir), 0.0) * uHwKeyLight * albedo * 0.3183098862;
}
#endif
`;
