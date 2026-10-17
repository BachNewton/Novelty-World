import type { FeatureArt } from "../feature-art";
import { shadowLight } from "./shadow-map";
import { smooth } from "./sun-shadows";

/*
 * The moon's shadows: at night the shadows are cast by the moon, softer than
 * the sun's (and dimmer by themselves, as its light is, by its phase). The
 * engine hands the key light from the sun to the moon only when both have
 * faded to nothing at the horizon, so the shadows change light in the dark,
 * with no flip; they fade over the moon's last degrees above the horizon as
 * the sun's do. Off, the night has no shadows and no shadow maps are drawn.
 */

/** The moon's apparent radius, as the tangent of its angle: wider than the sun's, for a soft night. */
const MOON_ANGLE = 0.026;
const MOON_BLUR = 0.04;
/** Moonlight is faint beside the sky's glow, so its shadows are a little lighter than full. */
const MOON_STRENGTH = 0.85;

export const MOON_SHADOWS_ART: FeatureArt = {
  feature: "moonShadows",
  frame: ({ day }) => {
    const { key } = day.sky;
    if (key.body !== "moon") return;
    shadowLight.casting = true;
    shadowLight.angle = MOON_ANGLE;
    shadowLight.blur = MOON_BLUR;
    shadowLight.strength = MOON_STRENGTH * smooth(0.02, 0.08, key.direction.y);
  },
};
