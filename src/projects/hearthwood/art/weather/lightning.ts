import { Color } from "three";
import type { FeatureArt } from "../feature-art";
import { weatherColours } from "../atmosphere/colours";

/*
 * Lightning: in a storm, now and then a flash (`engine/weather.ts` says
 * when), a bright stroke and a flicker or two after it, lighting every
 * surface from the whole sky at once, and the sky and the clouds with it
 * (the clouds light themselves from inside; see `clouds.ts`). The fire and
 * the fireflies, which make their own light, are left as they are.
 */

const uniforms = {
  /** The flash's light now: its colour times how bright it is. */
  uHwFlash: { value: new Color() },
};

const HEAD = /* glsl */ `uniform vec3 uHwFlash;`;

export const LIGHTNING_ART: FeatureArt = {
  feature: "lightning",
  uniforms,
  chunks: [
    { kinds: ["land", "ground", "foliage", "solid"], fragmentHead: HEAD, light: /* glsl */ `hwIndirect += diffuseColor.rgb * uHwFlash;` },
    // Water lights itself (see water/water.ts): the flash shows in what it mirrors.
    { kinds: ["water"], fragmentHead: HEAD, light: /* glsl */ `hwReflect += uHwFlash * 0.6;` },
    { kinds: ["sky"], fragmentHead: HEAD, colour: /* glsl */ `hwColour += uHwFlash * 0.18;` },
  ],
  frame: ({ weather }) => {
    uniforms.uHwFlash.value.copy(weatherColours().lightning).multiplyScalar(weather.flash * 0.9);
  },
};
