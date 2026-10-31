import { float, max, min, mix, smoothstep, texture, vec2, vec3 } from "three/tsl";
import type { Node, Texture } from "three/webgpu";

/*
 * Close-up ground, over the soft 2 m aerial colour. The tiles say nothing about
 * what a place is made of, but the photo does: green is grass, warm and dark is
 * bare earth, pale and grey is rock, or by a road, gravel and paving. So the
 * shader reads the kind from the colour it already has, and multiplies that
 * kind's lit relief over it. The relief averages to one, so with distance the
 * ground is the photo and nothing else.
 *
 * Two sizes of the same square, at scales with no common period, hide its tiling;
 * a third, far larger, moves the edges between kinds so they don't follow the
 * photo's pixels.
 */

/** The square's size on the ground. */
export const COARSE_M = 5.3;
export const FINE_M = 1.37;
const DRIFT_M = 37;
const MOTTLE_M = 13.7;
const FADE = [45, 150] as const;
const GRASS_WARMTH = vec3(1.04, 1.02, 0.66);
const SHADE_WARMTH = vec3(1.1, 1.02, 0.62);
const LITTER_SHARE = 0.75;
const STRENGTH = { grass: 0.72, soil: 0.62, gravel: 0.8, rock: 0.75 } as const;

export interface GroundInput {
  /** World x and z of the pixel. */
  place: Node<"vec2">;
  toCamera: Node<"float">;
  /** The photo's colour, in linear light. */
  photo: Node<"vec3">;
  /** How much road lies round here, a wide blur of the mask's road coverage, 0 to 1. */
  roadNearby: Node<"float">;
  /** Needles and leaf litter, where the photo is lost in shade. */
  litterColour: Node<"vec3">;
  detail: Texture;
}

export function groundDetail({ place, toCamera, photo, roadNearby, litterColour, detail }: GroundInput): Node<"vec3"> {
  const shown = float(1).sub(smoothstep(float(FADE[0]), float(FADE[1]), toCamera));
  const coarse = texture(detail, place.div(COARSE_M));
  const fine = texture(detail, place.div(FINE_M).add(vec2(0.37, 0.11)));
  const drift = texture(detail, place.div(DRIFT_M)).a.sub(0.5).mul(0.05);
  const mottled = texture(detail, place.div(MOTTLE_M));

  const [red, green, blue] = [photo.r, photo.g, photo.b];
  const brightest = max(max(red, green), blue).max(0.001);
  const greenLean = green.sub(max(red, blue).mul(0.92)).div(brightest).add(drift);
  const warmth = red.sub(blue).div(brightest).add(drift);
  const paleness = brightest.add(drift);

  // Measured on the 2025 photo: bare fields lean 0 and warm 0.15, rock 0 and 0.09, grass 0.3 and neither way. Below 0.05 is shade under trees.
  const grassShare = smoothstep(float(0.03), float(0.14), greenLean).mul(smoothstep(float(0.04), float(0.08), paleness));
  const greyShare = float(1).sub(smoothstep(float(0.09), float(0.15), warmth)).mul(smoothstep(float(0.14), float(0.22), paleness));
  const stoneShare = min(float(1).sub(grassShare), greyShare);
  const earthShare = float(1).sub(grassShare).sub(stoneShare).max(0);
  const gravelShare = smoothstep(float(0.04), float(0.2), roadNearby);

  // Rock's cracks are clipped off here: only its broad folds are wanted, as light and dark patches of grass.
  const tufts = mottled.a.sub(0.5).mul(0.5).add(mottled.b.max(0.32).sub(0.5).mul(0.7));
  const grassRelief = coarse.r.mul(0.5).add(fine.r.mul(0.5)).mul(2).sub(1).mul(STRENGTH.grass).add(tufts);
  const earthRelief = coarse.a.mul(0.45).add(fine.a.mul(0.55)).mul(2).sub(1).mul(STRENGTH.soil);
  const rockRelief = coarse.b.max(0.2).mul(0.7).add(fine.b.max(0.2).mul(0.3)).mul(2).sub(1).mul(STRENGTH.rock);
  const gravelRelief = coarse.g.mul(0.35).add(fine.g.mul(0.65)).mul(2).sub(1).mul(STRENGTH.gravel);
  const stoneRelief = mix(rockRelief, gravelRelief, gravelShare);

  const relief = grassRelief.mul(grassShare).add(earthRelief.mul(earthShare)).add(stoneRelief.mul(stoneShare)).mul(shown);
  // The photo's spring haze leaves grass a blue-green no tree here is, so it's warmed at every distance, not just close up.
  // Close up, tips take yellow and roots blue-green from the same relief, so the colour isn't one flat wash.
  const grassColour = mix(vec3(1), GRASS_WARMTH, grassShare);
  // Blue is the sky lighting the photo's shadows, and under trees the photo is nearly black: neither is what's on the ground there.
  const skyShade = float(1).sub(smoothstep(float(-0.16), float(-0.02), warmth));
  const litter = float(1).sub(smoothstep(float(0.05), float(0.13), paleness));
  const bladeTint = mix(vec3(1), vec3(1).add(vec3(0.2, 0.12, -0.3).mul(relief)), grassShare);
  const relit = mix(photo.mul(grassColour), photo.mul(SHADE_WARMTH), skyShade);
  const onFloor = mix(relit, mix(relit, litterColour, LITTER_SHARE), litter);
  return onFloor.mul(relief.add(1).max(0.05)).mul(bladeTint);
}
