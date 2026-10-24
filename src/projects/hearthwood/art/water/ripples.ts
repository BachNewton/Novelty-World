import { abs, cos, exp, float, mix, normalize, sign, sin, smoothstep, uniform, vec2, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { valueNoise } from "../atmosphere";
import type { FeatureArt } from "../feature-art";
import { typed } from "../tsl";
import { waterFalling, waterFlowDir, waterFootprint, waterMoving, waterP, waterView, type WaterStep } from "./surface";

/*
 * Ripples: a few layered waves of a Gerstner-like shape (sharp crests,
 * broad troughs), each smaller and quicker than the last and turned by the
 * golden angle, so no two ever line up into a grid. Their phase is warped by
 * slow noise and their choppiness swells and calms over tens of metres, so
 * the surface never repeats. Where a river runs they turn downstream and run
 * faster; rain roughens them. A wave finer than a pixel fades away, so the
 * surface never shimmers from a hand's breadth to the horizon, and the
 * ripples ease flat at grazing angles, where they would only alias. Each
 * wave's slope is worked out exactly with it, so the normal costs no more
 * than the waves.
 */

const GRAVITY = 9.81;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface RippleWave {
  /** Which way it runs, x and z, unit length. */
  dir: readonly [number, number];
  /** Its wavelength in metres, its wavenumber and its angular frequency (deep water's: the smaller, the quicker). */
  length: number;
  k: number;
  omega: number;
  /** Its height in metres. */
  amplitude: number;
}

/** The waves, longest first: each `shrink` times the length of the one before, turned by the golden angle, each with the same steepness times `soften`. */
export function rippleWaves(count = 5, longest = 7, shrink = 0.6, steepness = 0.075, soften = 0.85): RippleWave[] {
  return Array.from({ length: count }, (_, i) => {
    const length = longest * shrink ** i;
    const k = (2 * Math.PI) / length;
    const angle = 0.5 + i * GOLDEN_ANGLE;
    return { dir: [Math.cos(angle), Math.sin(angle)], length, k, omega: Math.sqrt(GRAVITY * k), amplitude: (steepness * soften ** i) / k };
  });
}

const WAVES = rippleWaves();

/** How hard it rains, rain only (see engine/weather.ts): rain roughens the water. */
const rain = uniform(0);

/** The ripples' slope at this point of the surface, x and z: each wave's, faded out where it is finer than the pixel. */
function rippleSlope(time: Node<"float">): Node<"vec2"> {
  const moving = waterMoving;
  const pace = moving.mul(1.4).add(1);
  const q = waterP.sub(waterFlowDir.mul(moving).mul(time).mul(1.3));
  const warp = typed<"float">(valueNoise(waterP.mul(0.09).add(time.mul(0.03)))).sub(0.5).mul(5);
  const chop = mix(0.35, 1.3, smoothstep(0.2, 0.8, typed<"float">(valueNoise(waterP.mul(0.016).add(vec2(time.mul(0.006), 0))))))
    .mul(moving.mul(0.6).add(1))
    .mul(rain.mul(0.9).add(1));
  let slope: Node<"vec2"> = vec2(0, 0);
  WAVES.forEach((w, i) => {
    const d = normalize(mix(vec2(w.dir[0], w.dir[1]), waterFlowDir, moving.mul(0.8)));
    const fade = float(1).sub(smoothstep(0.12, 0.4, waterFootprint.div(w.length)));
    const phase = d.dot(q).mul(w.k).sub(pace.mul(time).mul(w.omega)).add(warp.mul(1 + i * 0.35));
    // The height a·e^(sin θ − 1): sharp crests, broad troughs. Its slope along d is a·k·cos θ·e^(sin θ − 1).
    const along = exp(sin(phase).sub(1)).mul(cos(phase)).mul(w.amplitude * w.k).mul(fade);
    slope = slope.add(d.mul(along));
  });
  return slope.mul(chop);
}

export const RIPPLES_STEP: WaterStep = {
  feature: "ripples",
  normal: (normal, { air }) => {
    const slope = rippleSlope(air.uHwTime);
    // Seen from below the normal faces down, and the ripples bend it on that side.
    const rippled = normalize(vec3(slope.x.negate(), 1, slope.y.negate())).mul(sign(normal.y));
    // At a grazing look a ripple is finer than the pixel across it: ease them flat. A fall's sheet keeps its own.
    const graze = smoothstep(0.015, 0.25, abs(waterView.y));
    return normalize(mix(normal, rippled, graze.mul(float(1).sub(waterFalling))));
  },
};

export const RIPPLES_ART: FeatureArt = {
  feature: "ripples",
  frame: ({ weather }) => {
    rain.value = weather.weather.precipitation * (1 - weather.weather.snow);
  },
};
