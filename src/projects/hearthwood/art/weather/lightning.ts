import { diffuseColor } from "three/tsl";
import type { FeatureArt } from "../feature-art";
import { weatherColours } from "../atmosphere/colours";
import { colourUniform } from "../tsl";

/*
 * Lightning (`lightning`): in a storm, now and then a flash (the engine's
 * `makeLightning` says when), a bright stroke and a flicker or two after
 * it, lighting every surface from the whole sky at once, the sky with it,
 * and the clouds from inside (`clouds.ts` reads the same flash). The fire
 * and the fireflies, which make their own light, are left as they are; the
 * rain shows every drop in it (`falling.tsx`).
 */

/** The flash's light now: its colour times how bright it is. */
export const FLASH = colourUniform();

export const LIGHTNING_ART: FeatureArt = {
  feature: "lightning",
  stages: [
    { kinds: ["land", "ground", "foliage", "solid"], light: ({ direct, indirect }) => ({ direct, indirect: indirect.add(diffuseColor.rgb.mul(FLASH)) }) },
    { kinds: ["sky"], colour: (colour) => colour.add(FLASH.mul(0.18)) },
  ],
  frame: ({ weather }) => {
    FLASH.value.copy(weatherColours().lightning).multiplyScalar(weather.flash * 0.9);
  },
};
