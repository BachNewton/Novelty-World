import { dot, float, floor, fract, Fn, max, mix, smoothstep, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { salted, seedOf, unitOfSalted } from "../hash";
import { changeOf, seasonNodes, type SeasonLook } from "../season";
import { groundKinds } from "./ground";

/*
 * Snow lying on the land and on what stands on it, by the season's `snowCover` and `snowDepthCm`: a change to a
 * surface's colour before the hour's light. It never comes as a sheet. Each patch of ground whitens on its own
 * threshold, rolled from its place on two sizes of patch and leaned by what the place is: thin cover lies first on
 * north-facing slopes, open fields and the ploughed banks beside a road, and last on south slopes, under the trees and on
 * the warm bare rock, and melts back the other way. Far off, where a patch is a few pixels, the patches settle on the
 * share of the ground they cover, so nothing crawls.
 *
 * Under it the ground still shows a little of itself: thin snow lets the photo's darker structure through, the forest
 * floor stays greyer and patchier under its canopy, and a town's hard ground is trodden grey. A roof, a shed's or a
 * rock's top takes the same snow on its own threshold, by how much it faces up.
 */

/** The sizes of patch, metres, and how much of the threshold each one moves: the finest only ragging the edges, and gone by the time it's a few pixels. */
const PATCH_M = [53, 14, 3.7] as const;
const PATCH_SHARES = [0.55, 0.3, 0.15] as const;
const RAGGED_GONE_M = [250, 700] as const;
const SALT = 7121;
/** How far the patches spread a place's threshold either side of its lean. */
const SPREAD = 0.5;
/** Where a place's own threshold starts, before its lean. */
const BASE = 0.42;
/** How a patch's edge softens, as a share of the cover. */
const SOFTNESS = 0.03;
/** Past this, a patch is a few pixels and settles on its share. */
const PATCHES_SETTLE_M = [1500, 4000] as const;

/** The leans on a place's threshold: below nothing comes sooner. */
const NORTH_SLOPE = 1.2;
const OPEN_FIELD = -0.08;
const UNDER_TREES = 0.2;
const ON_ROCK = 0.15;
const ON_BANK = -0.35;

/** Thin snow is see-through: the share drawn at no depth, reaching full by this many centimetres. */
const THIN_SHOWN = 0.72;
const DEEP_CM = 12;
/** How much of the photo's structure shows through, thin and deep. */
const THROUGH = [0.5, 0.28] as const;
/** How much of the ground's own hue tints the snow over it, thin and deep: a field's stubble, a lawn, the needles. */
const HUE_THROUGH = [0.16, 0.1] as const;
/** Close up, the snow's own soft drifts, a metre or so across, and how far they show. */
const DRIFT_M = 1.3;
const DRIFT = 0.14;
const DRIFT_GONE_M = [40, 120] as const;
/** The photo's brightness its structure is measured against, linear. */
const MEAN_PHOTO = 0.09;
/** Under the trees the floor is greyer, and at most this patchy. */
const FLOOR_GREY = 0.5;
const FLOOR_PATCHY = 0.6;
/** What the floor's patches average to, which they settle on as they get too small to draw. */
const FLOOR_BARE_MEAN = 0.55;
/** Canopy this tall, metres, is forest over the floor. */
const TREES_M = [2, 8] as const;
/** Open snow, and the ploughed bank's, brighter and freshly heaped. */
const OPEN_BRIGHTNESS = 0.86;
const BANK_BRIGHTNESS = 1;
/** The bank's foot, a faint shadow where it stands out of the field. */
const BANK_FOOT = 0.8;
/** The road mask's coverage over the ploughed bank, from where it starts to its crest at the carriageway. */
const BANK = [0.03, 0.15] as const;
const BANK_FOOT_AT = [0.003, 0.015, 0.05] as const;
/** A town's hard ground is cleared, trodden and gritted: a share of the snow, greyed. */
const PAVED_SHARE = 0.55;
const PAVED_GREY = 0.5;

/** A face that sheds its snow, and one that holds it all, by the up of its normal. */
const SHEDS = [0.5, 0.78] as const;

const LUMINANCE = vec3(0.2126, 0.7152, 0.0722);

export interface Snowfall {
  cover: Node<"float">;
  depthCm: Node<"float">;
  /** Snow in the open, and in shade or trodden, linear. */
  snow: Node<"vec3">;
  shade: Node<"vec3">;
}

/** The season's snow for a material: its dials and its two colours, the `snow` and `snow-shade` tokens. */
export function snowfall(season: SeasonLook | undefined, colour: (name: string) => Node<"vec3">): Snowfall {
  const { snowCover, snowDepthCm } = seasonNodes(season);
  return { cover: snowCover, depthCm: snowDepthCm, snow: colour("snow"), shade: colour("snow-shade") };
}

/**
 * Smooth noise from 0 to 1 on a lattice of whole cells, the same on every GPU (`art/hash.ts`). A shader function called
 * where it's used, not pasted in: the ground reads it half a dozen times, in a shader every terrain ring compiles.
 */
const patchesAt = Fn(([at, salt]: [Node<"vec2">, Node<"uint">]) => {
  const cell = floor(at);
  const inCell = fract(at);
  const eased = inCell.mul(inCell).mul(inCell.mul(-2).add(3));
  const corner = (east: number, south: number) => unitOfSalted(seedOf(cell.x.add(east), cell.y.add(south)), salt);
  return mix(mix(corner(0, 0), corner(1, 0), eased.x), mix(corner(0, 1), corner(1, 1), eased.x), eased.y);
}).setLayout({ name: "snowPatches", type: "float", inputs: [{ name: "at", type: "vec2" }, { name: "salt", type: "uint" }] });

const patches = (at: Node<"vec2">, salt: number): Node<"float"> => patchesAt(at, salted(salt));

/** How much of the snow a place's thin depth lets show. */
const shownAt = (fall: Snowfall) => mix(float(THIN_SHOWN), float(1), smoothstep(float(0), float(DEEP_CM), fall.depthCm));

export interface SnowGround {
  /** The place on the ground, metres in the scene. */
  place: Node<"vec2">;
  /** The ground's normal there. */
  up: Node<"vec3">;
  /** The photo's colour, linear: what the place is, and the structure that shows through thin snow. */
  photo: Node<"vec3">;
  /** Mapped rock, 0 to 1. */
  rock: Node<"float">;
  /** The road mask's coverage there, main and lesser roads together: the ploughed bank beside a road. */
  roads: Node<"float">;
  /** A town's hard ground, 0 to 1. */
  paved: Node<"float">;
  /** The canopy's height there, metres, where it's known; else the photo's shade under trees says where they are. */
  canopy?: Node<"float">;
  toCamera: Node<"float">;
  /** Only ever seen from kilometres off, past the tiles: the patches' share alone, with none of the noise that settles on it. */
  far?: boolean;
}

/** The ground's colour under the season's snow: exactly the ground where none lies. */
export function snowOnGround(ground: Node<"vec3">, fall: Snowfall, { place, up, photo, rock, roads, paved, canopy, toCamera, far = false }: SnowGround): Node<"vec3"> {
  const { grassShare, paleness } = groundKinds(photo);
  const shaded = float(1).sub(smoothstep(float(0.05), float(0.13), paleness));
  const underTrees = canopy === undefined ? shaded : max(shaded, smoothstep(float(TREES_M[0]), float(TREES_M[1]), canopy));
  const bank = smoothstep(float(BANK[0]), float(BANK[1]), roads);
  // North is -z: a slope facing it has its normal leaning that way, and keeps the snow.
  const lean = float(BASE)
    .add(up.z.mul(NORTH_SLOPE))
    .add(grassShare.mul(OPEN_FIELD))
    .add(underTrees.mul(UNDER_TREES))
    .add(rock.mul(float(1).sub(grassShare)).mul(ON_ROCK))
    .add(bank.mul(ON_BANK));
  // What the patches average to, a share of the threshold's spread below the cover.
  const settled = fall.cover.mul(1 + SOFTNESS).sub(lean.clamp(0.02, 1)).add(SPREAD / 2).div(SPREAD).clamp(0, 1);
  const closeUp = (gone: readonly [number, number]) => float(1).sub(smoothstep(float(gone[0]), float(gone[1]), toCamera));
  const ragged = far ? float(0.5) : mix(float(0.5), patches(place.div(PATCH_M[2]), SALT + 3), closeUp(RAGGED_GONE_M));
  const patch = patches(place.div(PATCH_M[0]), SALT)
    .mul(PATCH_SHARES[0])
    .add(patches(place.div(PATCH_M[1]), SALT + 1).mul(PATCH_SHARES[1]))
    .add(ragged.mul(PATCH_SHARES[2]));
  const lying = far ? settled : mix(settled, changeOf(fall.cover, lean.add(patch.sub(0.5).mul(SPREAD)).clamp(0.02, 1), SOFTNESS), closeUp(PATCHES_SETTLE_M));

  const floorBare = far ? float(FLOOR_BARE_MEAN) : mix(float(FLOOR_BARE_MEAN), smoothstep(float(0.3), float(0.62), patches(place.div(PATCH_M[1] / 3), SALT + 2)), closeUp(RAGGED_GONE_M));
  const floorPatches = mix(float(1), floorBare, underTrees.mul(FLOOR_PATCHY));
  const share = lying.mul(shownAt(fall)).mul(floorPatches).mul(mix(float(1), float(PAVED_SHARE), paved));

  const deep = smoothstep(float(0), float(DEEP_CM), fall.depthCm);
  const through = mix(float(THROUGH[0]), float(THROUGH[1]), deep);
  const brightness = dot(ground, LUMINANCE).max(0.001);
  const hue = mix(vec3(1), ground.div(brightness).clamp(0, 2), mix(float(HUE_THROUGH[0]), float(HUE_THROUGH[1]), deep));
  // Read off the ground as drawn, so close up its own relief shows through as the snow's, and far off the photo's.
  const structure = brightness.div(MEAN_PHOTO).sqrt().clamp(0.55, 1.2);
  const open = fall.snow.mul(mix(float(OPEN_BRIGHTNESS), float(BANK_BRIGHTNESS), bank));
  const foot = smoothstep(float(BANK_FOOT_AT[0]), float(BANK_FOOT_AT[1]), roads).mul(float(1).sub(smoothstep(float(BANK_FOOT_AT[1]), float(BANK_FOOT_AT[2]), roads)));
  const greyed = mix(open, fall.shade, max(underTrees.mul(FLOOR_GREY), paved.mul(PAVED_GREY)));
  const drifts = far ? float(0) : patches(place.div(DRIFT_M), SALT + 4).add(ragged).sub(1).mul(DRIFT).mul(closeUp(DRIFT_GONE_M));
  const snow = greyed.mul(hue).mul(drifts.add(1)).mul(mix(float(1), structure, through)).mul(mix(float(1), float(BANK_FOOT), foot));
  return mix(ground, snow, share);
}

/** How much of the snow a face keeps, by the up of its normal: a steep one sheds it. */
export const snowHeld = (upward: Node<"float">) => smoothstep(float(SHEDS[0]), float(SHEDS[1]), upward);

/**
 * A surface that stands on the land under the season's snow, as much as it faces up: a roof, a deck, a rock's top.
 * `threshold` is the thing's own, rolled from its place, so a village whitens roof by roof.
 */
export function snowOnTop(colour: Node<"vec3">, fall: Snowfall, upward: Node<"float">, threshold: Node<"float">): Node<"vec3"> {
  const share = changeOf(fall.cover, threshold.clamp(0.02, 1)).mul(snowHeld(upward)).mul(shownAt(fall));
  return mix(colour, fall.snow, share);
}
