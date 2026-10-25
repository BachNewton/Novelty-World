import { exp, float, max, mix, select, uniform, vec3, vec4 } from "three/tsl";
import type { Node } from "three/webgpu";
import type { PostStep } from "../feature-art";

/*
 * The tone curve (`toneMapping`): how the scene's light, which runs far
 * brighter than a screen, is fitted to it, as a step of the frame's post
 * pipeline at order 0 (the line between scene-referred and display-referred
 * steps). Hearthwood's storybook curve keeps every hue true (a colour is
 * scaled as a whole, never bent channel by channel, so firelight stays
 * orange and the sky stays blue), begins rolling the highlights off early
 * and softly, and bleaches them towards white only a little: a sunset, the
 * fire and a lit cloud keep their colour as they brighten, pastel rather
 * than blown out. Its shadows are left as they are. Off, the frame is only
 * exposed and clipped, which shows what the curve does.
 *
 * The exposure is set each frame by the day's light (`daylight.tsx`).
 */

export const exposure = uniform(1);

const START = 0.62;
const SPAN = 1 - START;

/** The storybook curve on one colour, exposed. */
export function storybookCurve(colour: Node<"vec3">): Node<"vec3"> {
  const c = max(colour.mul(exposure), vec3(0));
  const peak = max(c.r, max(c.g, c.b)).max(1e-6);
  const rolled = float(START).add(float(SPAN).mul(float(1).sub(exp(peak.sub(START).div(SPAN).negate()))));
  const scaled = c.mul(rolled.div(peak));
  const squeezed = float(1).sub(rolled.div(peak));
  const curved = mix(scaled, vec3(rolled), squeezed.mul(squeezed).mul(0.35));
  return select(peak.greaterThan(START), curved, c);
}

/** The step itself, read by `frame.ts` whether or not the feature is on: off, it only exposes. */
export function toneStep(storybook: boolean): PostStep {
  return {
    id: "tone",
    order: 0,
    build: ({ colour }) => ({ colour: vec4(storybook ? storybookCurve(colour.rgb) : colour.rgb.mul(exposure).clamp(0, 1), colour.a) }),
  };
}
