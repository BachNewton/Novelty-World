import { BufferAttribute, BufferGeometry } from "three/webgpu";
import { Model, PARTS, seeded, type BoxOptions, type Part, type TubeOptions, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { MOTION_KINDS, MOTION_RANGE_M, type MotionKind } from "../street/paint";
import { measuredSwap } from "../lod-swaps";

/*
 * The roadside kit's `Model` writes the shapes, as it does for the rural and street
 * kits; this adds the identity kit's paints, and packs what those two keep apart:
 * `tint` is r the part, g the shade, b how far a vertex moves, and a the street's
 * motion kind, the surface pattern and whether the thing floats, as bits. `thin` is,
 * for a rail, post or wire, each vertex's way out from its own axis in metres, which is
 * as long as the part's half width, and the part's own roll, so the material can hold it
 * to a pixel and let each go at a distance of its own; zero on the rest.
 */

export const PATTERNS = ["plain", "boards", "net"] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Each part's paint: a token or two mixed, a brightness, and the pattern it wears. All colour comes from tokens. */
export const PAINT = {
  "red-boards": { from: "wall-red", pattern: "boards" },
  "tar-boards": { from: "wall-door", to: "wall-plinth", share: 0.5, gain: 0.72, pattern: "boards" },
  "grey-boards": { from: "wall-grey", to: "tree-bark", share: 0.18, gain: 0.92, pattern: "boards" },
  "log-wall": { from: "tree-bark", to: "wall-door", share: 0.6, gain: 1.1, pattern: "boards" },
  "white-boards": { from: "wall-trim", to: "wall-pale", share: 0.25, pattern: "boards" },
  trim: { from: "wall-trim" },
  roof: { from: "wall-plinth", gain: 0.8 },
  "roof-under": { from: "wall-plinth", gain: 0.5 },
  door: { from: "wall-door", gain: 0.9, pattern: "boards" },
  glass: { from: "wall-glass" },
  timber: { from: "wall-cream", to: "wall-door", share: 0.32, gain: 1.05 },
  "timber-grey": { from: "wall-grey", to: "wall-door", share: 0.2, gain: 1.05 },
  "timber-pale": { from: "wall-grey", to: "wall-cream", share: 0.45, gain: 1.05 },
  pile: { from: "wall-door", to: "wall-plinth", share: 0.5, gain: 0.8 },
  pipe: { from: "wall-plinth", gain: 0.5 },
  steel: { from: "wall-pale", to: "wall-grey", share: 0.5, gain: 0.85 },
  "steel-dark": { from: "wall-plinth", gain: 0.72 },
  concrete: { from: "wall-pale", to: "wall-grey", share: 0.35 },
  rock: { from: "wall-grey", to: "wall-red", share: 0.16, gain: 0.92 },
  whitewash: { from: "wall-trim", to: "wall-pale", share: 0.35 },
  soil: { from: "tree-bark", gain: 0.6 },
  "hull-white": { from: "wall-trim" },
  "hull-tar": { from: "wall-plinth", gain: 0.42 },
  "hull-blue": { from: "water", to: "wall-plinth", share: 0.3, gain: 0.85 },
  "hull-green": { from: "tree-spruce", gain: 1.1 },
  leaf: { from: "tree-birch", to: "tree-pine", share: 0.15, gain: 1.05 },
  "leaf-lit": { from: "tree-birch", to: "wall-yellow", share: 0.08, gain: 1.2 },
  "leaf-under": { from: "tree-pine", to: "tree-birch", share: 0.3, gain: 0.95 },
  bark: { from: "tree-bark", to: "wall-grey", share: 0.25 },
  "birch-log": { from: "tree-birch-bark", gain: 0.95 },
  brush: { from: "tree-bark", to: "tree-pine", share: 0.4, gain: 0.9 },
  "log-end": { from: "wall-cream", to: "wall-yellow", share: 0.3 },
  "apple-red": { from: "apple-red" },
  "apple-green": { from: "apple-green" },
  pancake: { from: "pancake" },
  "pancake-crust": { from: "pancake-crust" },
  prune: { from: "prune", gain: 1.4 },
  cream: { from: "wall-trim", gain: 1.04 },
  "sign-white": { from: "wall-trim", to: "wall-cream", share: 0.4 },
  "sign-ink": { from: "wall-plinth", gain: 0.38 },
  "flag-yellow": { from: "flag-ax-yellow" },
  "flag-red": { from: "flag-ax-red" },
  "flag-blue": { from: "flag-ax-blue" },
  net: { from: "wall-grey", to: "wall-plinth", share: 0.55, gain: 0.9, pattern: "net" },
  float: { from: "float-orange" },
  "float-white": { from: "wall-trim", to: "wall-cream", share: 0.3 },
  rope: { from: "wall-cream", to: "wall-grey", share: 0.45, gain: 0.85 },
  "chair-blue": { from: "water", gain: 1.3 },
  "chair-white": { from: "wall-trim", gain: 0.98 },
  skin: { from: "skin" },
  hair: { from: "wall-door", gain: 0.8 },
  "shirt-red": { from: "apple-red", gain: 1.2 },
  "shirt-blue": { from: "water", gain: 1.2 },
  "shirt-yellow": { from: "flag-ax-yellow", gain: 0.92 },
  "trousers-dark": { from: "wall-plinth", gain: 0.6 },
  helmet: { from: "wall-trim", gain: 0.95 },
  tyre: { from: "car-tyre", gain: 1.2 },
  "frame-blue": { from: "flag-ax-blue", gain: 1.3 },
  "frame-red": { from: "apple-red" },
  pannier: { from: "wall-plinth", to: "flag-ax-yellow", share: 0.25, gain: 0.8 },
  "lantern-glass": { from: "car-glass", to: "sky", share: 0.45 },
  lamp: { from: "car-lamp" },
  "deck-paint": { from: "wall-grey", to: "water", share: 0.25, gain: 0.8 },
  "ramp-yellow": { from: "flag-ax-yellow", gain: 0.85 },
  // The lighthouses' own (`art/lighthouses`).
  "brick-red": { from: "wall-red", to: "wall-door", share: 0.25, gain: 0.9 },
  "band-black": { from: "wall-plinth", gain: 0.32 },
  "roof-red": { from: "flag-ax-red", to: "wall-red", share: 0.5, gain: 0.85 },
  copper: { from: "copper" },
  "limewash-red": { from: "limewash-red" },
  "solar-panel": { from: "car-glass", to: "wall-plinth", share: 0.5, gain: 0.6 },
  // A wind turbine's tower, white over Enercon's green rings, darkest at the foot.
  "turbine-white": { from: "wall-trim", to: "wall-pale", share: 0.3 },
  "turbine-green-1": { from: "tree-spruce", to: "tree-birch", share: 0.55, gain: 1.15 },
  "turbine-green-2": { from: "tree-birch", gain: 1.12 },
  "turbine-green-3": { from: "tree-birch", to: "wall-trim", share: 0.28, gain: 1.08 },
  "turbine-green-4": { from: "tree-birch", to: "wall-trim", share: 0.52, gain: 1.04 },
  "turbine-green-5": { from: "tree-birch", to: "wall-trim", share: 0.76 },
} as const satisfies Record<string, { from: string; to?: string; share?: number; gain?: number; pattern?: Pattern }>;

export type IdentityPart = keyof typeof PAINT;
export const IDENTITY_PARTS = Object.keys(PAINT) as IdentityPart[];

/** Bits of `tint.a` over the three of the motion kind. */
const PATTERN_UNIT = 8;
export const AFLOAT_UNIT = 64;
export const SPIN_UNIT = 128;
/** A held thin part's roll: under any share its cover falls to, so it is never let go. */
const HELD_ROLL = 0.001;
const STAND_IN: Part = "lens";
const LUMP_TOP: Part = "needles-lit";
const LUMP_UNDER: Part = "needles";

/** What moves, and how far, for a vertex of a part at a place in the model. */
export type Motion = (part: IdentityPart, at: V3) => { kind: MotionKind; metres?: number };

export function codeOf(part: IdentityPart, kind: MotionKind, afloat: boolean, spins = false): number {
  const paint = PAINT[part];
  const pattern = PATTERNS.indexOf("pattern" in paint ? paint.pattern : "plain");
  return MOTION_KINDS.indexOf(kind) + pattern * PATTERN_UNIT + (afloat ? AFLOAT_UNIT : 0) + (spins ? SPIN_UNIT : 0);
}

export class IdentityMesh {
  private readonly positions: number[] = [];
  private readonly shades: number[] = [];
  private readonly parts: IdentityPart[] = [];
  private readonly thins: number[] = [];
  private thinParts = 0;
  private readonly indices: number[] = [];
  private readonly afloat: boolean;
  private readonly spins: boolean;

  /**
   * `afloat` leaves off the foot shade: the last metre above water isn't dark the way it is above grass. A model that
   * `spins` turns on the material's clock about its own z axis through its origin, a rotor about its hub, from a start
   * rolled per place; it stands nowhere near the ground, so it has no foot shade either.
   */
  constructor({ afloat = false, spins = false }: { afloat?: boolean; spins?: boolean } = {}) {
    this.afloat = afloat;
    this.spins = spins;
  }

  private take(draw: (model: Model) => Model, partOf: (drawnIn: number) => IdentityPart): this {
    const geometry = draw(new Model()).build();
    const positions = geometry.getAttribute("position");
    const tints = geometry.getAttribute("tint");
    const first = this.positions.length / 3;
    for (let index = 0; index < positions.count; index++) {
      this.positions.push(positions.getX(index), positions.getY(index), positions.getZ(index));
      this.parts.push(partOf(tints.array[index * 4]));
      this.shades.push(tints.array[index * 4 + 1]);
      this.thins.push(0, 0, 0, 0);
    }
    for (const index of geometry.getIndex()?.array ?? []) this.indices.push(first + index);
    return this;
  }

  face(corners: readonly V3[], part: IdentityPart, shade = 1): this {
    return this.take((model) => model.face(corners, STAND_IN, shade), () => part);
  }

  tube(from: V3, to: V3, radius: number, sides: number, options: TubeOptions, part: IdentityPart): this {
    return this.take((model) => model.tube(from, to, radius, sides, options, STAND_IN), () => part);
  }

  spike(from: V3, to: V3, radius: number, part: IdentityPart, shade = 1): this {
    return this.take((model) => model.spike(from, to, radius, STAND_IN, shade), () => part);
  }

  beam(from: V3, to: V3, wide: number, tall: number, part: IdentityPart, shade = 1, shadeTop = shade): this {
    return this.take((model) => model.beam(from, to, wide, tall, STAND_IN, shade, shadeTop), () => part);
  }

  /**
   * A beam too thin to stay whole on screen far off: the material widens it to a pixel, and once that pixel is more than
   * the beam covers, lets it go at a distance of its own, so a model's thin parts thin out one at a time to their share.
   */
  thinBeam(from: V3, to: V3, wide: number, tall: number, part: IdentityPart): this {
    return this.thin(from, to, () => this.beam(from, to, wide, tall, part));
  }

  /** A tube held to a pixel, as `thinBeam` is. Its caps are fans of its rims, so every vertex lies off its axis. */
  thinTube(from: V3, to: V3, radius: number, sides: number, options: TubeOptions, part: IdentityPart): this {
    return this.thin(from, to, () => this.tube(from, to, radius, sides, options, part));
  }

  /**
   * Whatever `draw` adds, held to a pixel about the axis from `from` to `to` as `thinBeam` is. A `held` one is never let
   * go: a landmark's tower or blade that has to read on the horizon as a line, however far off.
   */
  thinShape(from: V3, to: V3, draw: (mesh: this) => void, { held = false }: { held?: boolean } = {}): this {
    return this.thin(from, to, () => {
      draw(this);
      return this;
    }, held);
  }

  private thin(from: V3, to: V3, draw: () => this, held = false): this {
    // Golden-ratio steps spread the parts' rolls evenly, so they go at evenly spread distances.
    const roll = held ? HELD_ROLL : 0.04 + 0.95 * ((this.thinParts++ * 0.618034 + 0.37) % 1);
    const first = this.parts.length;
    draw();
    const axis: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const length2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
    for (let index = first; index < this.parts.length; index++) {
      const at = [0, 1, 2].map((k) => this.positions[index * 3 + k] - from[k]);
      const along = Math.min(1, Math.max(0, (at[0] * axis[0] + at[1] * axis[1] + at[2] * axis[2]) / length2));
      this.thins.splice(index * 4, 4, ...at.map((value, k) => value - axis[k] * along), roll);
    }
    return this;
  }

  box(low: V3, high: V3, part: IdentityPart, options: BoxOptions = {}): this {
    return this.take((model) => model.box(low, high, STAND_IN, options), () => part);
  }

  lump(base: V3, wide: number, tall: number, sides: number, seed: number, parts: { top: IdentityPart; under: IdentityPart }): this {
    return this.take((model) => model.lump(base, wide, tall, sides, seeded(seed), { top: LUMP_TOP, under: LUMP_UNDER }), (drawnIn) => (drawnIn === PARTS.indexOf(LUMP_TOP) ? parts.top : parts.under));
  }

  build(motion?: Motion): BufferGeometry {
    const count = this.parts.length;
    const tints = new Uint8Array(count * 4);
    this.parts.forEach((part, index) => {
      const at: V3 = [this.positions[index * 3], this.positions[index * 3 + 1], this.positions[index * 3 + 2]];
      const { kind, metres = 0 } = motion?.(part, at) ?? { kind: "still" as const };
      tints.set([IDENTITY_PARTS.indexOf(part), Math.min(255, this.shades[index]), Math.round(Math.min(1, metres / MOTION_RANGE_M) * 255), codeOf(part, kind, this.afloat, this.spins)], index * 4);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(this.positions), 3));
    geometry.setAttribute("tint", new BufferAttribute(tints, 4, true));
    geometry.setAttribute("thin", new BufferAttribute(Float32Array.from(this.thins), 4));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/** A model's versions, ready for `placeModel`. */
export function identityModel(near: IdentityMesh, far: IdentityMesh | null, swapM: number, reachM: number, motion?: Motion): RoadsideModel {
  return measuredSwap({ near: near.build(motion), far: far?.build(motion) ?? null, swapM, reachM });
}
