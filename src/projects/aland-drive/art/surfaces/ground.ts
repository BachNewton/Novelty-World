import { dot, float, max, min, mix, smoothstep, texture, vec2, vec3 } from "three/tsl";
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
/** How much of a place's relief is rock's where it's mapped as rock and the photo shows no grass: under trees, rock's relief through the litter. */
const MAPPED_ROCK = 0.7;
const STRENGTH = { grass: 0.72, soil: 0.62, gravel: 0.8, rock: 0.75, stones: 1.1 } as const;
/**
 * Bare granite is rapakivi red, but the spring photo bleaches it nearly white: where rock is mapped and no grass shows, the
 * ground takes the granite's own colour at the photo's brightness, kept from glaring.
 */
const ROCK_TONE = 0.7;
const ROCK_BRIGHTEST = 0.27;
/** A boulder field is stones and the dark gaps between them, wherever it lies, grass or forest: the photo's only for its light. */
const FIELD_TONE = 0.85;
const FIELD_BRIGHTNESS = 0.5;
/** The stones in the ground's relief, about half a metre across, with a finer run among them. */
const STONES_M = 2.3;
const LUMINANCE = vec3(0.2126, 0.7152, 0.0722);

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
  /** How much of the place is mapped rock, 0 to 1: rock's relief and colour there wherever the photo doesn't show grass. */
  rock: Node<"float">;
  /** How much of the place is boulder field, 0 to 1: stones, whatever the photo shows. */
  fields: Node<"float">;
  /** The granite's colour, and a field's stones', in linear light. */
  rockColour: Node<"vec3">;
  stonesColour: Node<"vec3">;
  detail: Texture;
}

/** What the photo's colour says a place is made of, as shares; `drift` moves the edges between kinds. */
export function groundKinds(photo: Node<"vec3">, drift: Node<"float"> = float(0)) {
  const [red, green, blue] = [photo.r, photo.g, photo.b];
  const brightest = max(max(red, green), blue).max(0.001);
  const greenLean = green.sub(max(red, blue).mul(0.92)).div(brightest).add(drift);
  const warmth = red.sub(blue).div(brightest).add(drift);
  const paleness = brightest.add(drift);

  // Measured on the 2025 photo: bare fields lean 0 and warm 0.15, rock 0 and 0.09, grass 0.3 and neither way. Below 0.05 is shade under trees.
  const grassShare = smoothstep(float(0.03), float(0.14), greenLean).mul(smoothstep(float(0.04), float(0.08), paleness));
  const greyShare = float(1).sub(smoothstep(float(0.09), float(0.15), warmth)).mul(smoothstep(float(0.14), float(0.22), paleness));
  const stoneShare = min(float(1).sub(grassShare), greyShare);
  return { warmth, paleness, grassShare, stoneShare };
}

/** The ground's colour with no relief on it, which is all there is of it from afar. */
export function groundFloor(photo: Node<"vec3">, litterColour: Node<"vec3">, { warmth, paleness, grassShare }: Pick<ReturnType<typeof groundKinds>, "warmth" | "paleness" | "grassShare">): Node<"vec3"> {
  // The photo's spring haze leaves grass a blue-green no tree here is, so it's warmed at every distance, not just close up.
  const grassColour = mix(vec3(1), GRASS_WARMTH, grassShare);
  // Blue is the sky lighting the photo's shadows, and under trees the photo is nearly black: neither is what's on the ground there.
  const skyShade = float(1).sub(smoothstep(float(-0.16), float(-0.02), warmth));
  const litter = float(1).sub(smoothstep(float(0.05), float(0.13), paleness));
  const relit = mix(photo.mul(grassColour), photo.mul(SHADE_WARMTH), skyShade);
  return mix(relit, mix(relit, litterColour, LITTER_SHARE), litter);
}

/** A colour turned to another's hue at its own brightness, at most `brightest`. */
function toned(colour: Node<"vec3">, to: Node<"vec3">, brightest: Node<"float"> | number): Node<"vec3"> {
  return to.mul(dot(colour, LUMINANCE).min(brightest).div(dot(to, LUMINANCE)));
}

/** The ground's colour on mapped rock: the granite's red over the photo's bleached pale, as far as no grass shows. */
export function rockFloor(floor: Node<"vec3">, rockColour: Node<"vec3">, rock: Node<"float">, grassShare: Node<"float">): Node<"vec3"> {
  return mix(floor, toned(floor, rockColour, ROCK_BRIGHTEST), rock.mul(float(1).sub(grassShare)).mul(ROCK_TONE));
}

/**
 * The ground's colour with no relief, rock and boulder fields included: what the terrain is wherever its relief has gone,
 * and what anything standing on it turns to before it goes, so it leaves nothing behind that changes.
 */
export function groundTone({ photo, litterColour, rock, fields, rockColour, stonesColour }: Omit<GroundInput, "place" | "toCamera" | "roadNearby" | "detail">, kinds: ReturnType<typeof groundKinds>): Node<"vec3"> {
  const floor = rockFloor(groundFloor(photo, litterColour, kinds), rockColour, rock, kinds.grassShare);
  return mix(floor, toned(floor, stonesColour, ROCK_BRIGHTEST).mul(FIELD_BRIGHTNESS), fieldShare(fields).mul(FIELD_TONE));
}

const fieldShare = (fields: Node<"float">) => smoothstep(float(0.2), float(0.6), fields);

export function groundDetail(input: GroundInput): Node<"vec3"> {
  const { place, toCamera, photo, roadNearby, rock, fields, detail } = input;
  const shown = float(1).sub(smoothstep(float(FADE[0]), float(FADE[1]), toCamera));
  const coarse = texture(detail, place.div(COARSE_M));
  const fine = texture(detail, place.div(FINE_M).add(vec2(0.37, 0.11)));
  const drift = texture(detail, place.div(DRIFT_M)).a.sub(0.5).mul(0.05);
  const mottled = texture(detail, place.div(MOTTLE_M));

  const kinds = groundKinds(photo, drift);
  const { grassShare } = kinds;
  const stoneShare = max(kinds.stoneShare, rock.mul(float(1).sub(grassShare)).mul(MAPPED_ROCK));
  const earthShare = float(1).sub(grassShare).sub(stoneShare).max(0);
  const gravelShare = smoothstep(float(0.04), float(0.2), roadNearby);

  // Rock's cracks are clipped off here: only its broad folds are wanted, as light and dark patches of grass.
  const tufts = mottled.a.sub(0.5).mul(0.5).add(mottled.b.max(0.32).sub(0.5).mul(0.7));
  const grassRelief = coarse.r.mul(0.5).add(fine.r.mul(0.5)).mul(2).sub(1).mul(STRENGTH.grass).add(tufts);
  const earthRelief = coarse.a.mul(0.45).add(fine.a.mul(0.55)).mul(2).sub(1).mul(STRENGTH.soil);
  const rockRelief = coarse.b.max(0.2).mul(0.7).add(fine.b.max(0.2).mul(0.3)).mul(2).sub(1).mul(STRENGTH.rock);
  const gravelRelief = coarse.g.mul(0.35).add(fine.g.mul(0.65)).mul(2).sub(1).mul(STRENGTH.gravel);
  const stoneRelief = mix(rockRelief, gravelRelief, gravelShare);

  const field = fieldShare(fields);
  const stones = texture(detail, place.div(STONES_M)).g.mul(0.65).add(texture(detail, place.div(STONES_M * 0.41).add(vec2(0.23, 0.71))).g.mul(0.35)).mul(2).sub(1).mul(STRENGTH.stones);
  const relief = mix(grassRelief.mul(grassShare).add(earthRelief.mul(earthShare)).add(stoneRelief.mul(stoneShare)), stones, field).mul(shown);
  // Close up, tips take yellow and roots blue-green from the same relief, so the colour isn't one flat wash.
  const bladeTint = mix(vec3(1), vec3(1).add(vec3(0.2, 0.12, -0.3).mul(relief)), grassShare.mul(float(1).sub(field)));
  return groundTone(input, kinds).mul(relief.add(1).max(0.05)).mul(bladeTint);
}
