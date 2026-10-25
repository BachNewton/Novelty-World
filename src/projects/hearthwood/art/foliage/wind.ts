import { Vector2 } from "three";
import { atan, dot, length, max, positionGeometry, sin, uniform, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { valueNoise, type AtmosphereUniforms } from "../atmosphere";
import type { FeatureArt } from "../feature-art";
import { weatherInput } from "../shadows/weather-input";
import { typed } from "../tsl";
import { plantRoot, plantTall } from "./placing";

/*
 * The plants in the wind: every tree, bush and flower leans downwind and
 * rocks in its own time, more the higher up the plant, while its branches
 * and leaves flutter on top. Gusts roll across the land with the wind as
 * broad patches of stronger air, so a meadow ripples and a wood sways in
 * waves. How hard and which way it blows comes from the weather
 * (`shadows/weather-input.ts`). It is a position stage, so the shadow pass,
 * drawing through the same position, casts each plant where it sways.
 */

const wind = {
  /** How hard the wind blows, 0 still to 1 a gale. */
  strength: uniform(0.35),
  /** Which way it blows towards, across the land (x, z). */
  toward: uniform(new Vector2(1, 0)),
};

/** A vertex moved by the wind: `position` in the world, the design's own vertex (one unit tall) saying how far up the plant it is. */
function sway(position: Node<"vec3">, air: AtmosphereUniforms): Node<"vec3"> {
  const root = plantRoot();
  const tall = plantTall();
  const own = positionGeometry;
  const time = air.uHwTime;
  const up = max(own.y, 0);
  // A plant's shape stands one unit tall, so its height squared bends the top and leaves the root.
  const bend = up.mul(up);
  const drift = wind.toward.mul(time.mul(wind.strength.mul(6).add(1.5)));
  const gust = typed<"float">(valueNoise(root.xz.sub(drift).mul(0.035))).mul(0.7).add(typed<"float">(valueNoise(root.xz.sub(drift.mul(1.3)).mul(0.11))).mul(0.3));
  const blow = wind.strength.mul(gust.mul(gust).mul(1.3).add(0.45));
  const phase = time.mul(wind.strength.mul(0.8).add(1.2)).add(root.x.mul(0.21)).add(root.z.mul(0.17));
  const rock = sin(phase).mul(0.6).add(sin(phase.mul(2.3).add(1.7)).mul(0.25));
  // A tree's crown moves a hand or two; a flower's head nearly its own width.
  const reach = tall.mul(0.12).div(tall.mul(0.08).add(1)).add(0.06);
  const side = vec2(wind.toward.y.negate(), wind.toward.x);
  const lean = wind.toward
    .mul(blow.mul(rock.mul(0.35).add(0.55)))
    .add(side.mul(blow.mul(0.15).mul(sin(phase.mul(0.7).add(2)))))
    .mul(reach.mul(bend));
  // Each branch round the trunk sways in its own time, and each leaf flutters faster.
  const branch = sin(time.mul(2.3).add(atan(own.z, own.x.add(1e-4)).mul(2)).add(phase)).mul(length(own.xz)).mul(up);
  const leaf = sin(time.mul(9).add(dot(own, vec3(23.1, 17.3, 19.7))).add(phase));
  return position
    .add(vec3(lean.x, 0, lean.y))
    .add(vec3(side.x, 0.35, side.y).mul(branch.mul(blow).mul(reach).mul(0.2)))
    .add(vec3(0.6, 0.5, -0.6).mul(leaf.mul(blow).mul(tall).mul(up).mul(0.012).div(tall.mul(0.05).add(1))));
}

export const SWAY_ART: FeatureArt = {
  feature: "sway",
  stages: [{ kinds: ["foliage"], position: (position, { air }) => sway(position, air) }],
  frame: ({ weather }) => {
    const { wind: strength, windToward } = weatherInput(weather.weather);
    wind.strength.value = strength;
    wind.toward.value.set(Math.cos(windToward), Math.sin(windToward));
  },
};
