import { BufferAttribute, BufferGeometry } from "three/webgpu";
import { Model, PARTS, seeded, type BoxOptions, type Part, type TubeOptions, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { MOTION_KINDS, MOTION_RANGE_M, type MotionKind } from "../street/paint";

/*
 * The roadside kit's `Model` writes the shapes, as it does for the rural and street
 * kits; this adds the identity kit's paints, and packs what those two keep apart:
 * `tint` is r the part, g the shade, b how far a vertex moves, and a the street's
 * motion kind, the surface pattern and whether the thing floats, as bits.
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
} as const satisfies Record<string, { from: string; to?: string; share?: number; gain?: number; pattern?: Pattern }>;

export type IdentityPart = keyof typeof PAINT;
export const IDENTITY_PARTS = Object.keys(PAINT) as IdentityPart[];

/** Bits of `tint.a` over the three of the motion kind. */
const PATTERN_UNIT = 8;
export const AFLOAT_UNIT = 64;
const STAND_IN: Part = "lens";
const LUMP_TOP: Part = "needles-lit";
const LUMP_UNDER: Part = "needles";

/** What moves, and how far, for a vertex of a part at a place in the model. */
export type Motion = (part: IdentityPart, at: V3) => { kind: MotionKind; metres?: number };

export function codeOf(part: IdentityPart, kind: MotionKind, afloat: boolean): number {
  const paint = PAINT[part];
  const pattern = PATTERNS.indexOf("pattern" in paint ? paint.pattern : "plain");
  return MOTION_KINDS.indexOf(kind) + pattern * PATTERN_UNIT + (afloat ? AFLOAT_UNIT : 0);
}

export class IdentityMesh {
  private readonly positions: number[] = [];
  private readonly shades: number[] = [];
  private readonly parts: IdentityPart[] = [];
  private readonly indices: number[] = [];
  private readonly afloat: boolean;

  /** `afloat` leaves off the foot shade: the last metre above water isn't dark the way it is above grass. */
  constructor({ afloat = false }: { afloat?: boolean } = {}) {
    this.afloat = afloat;
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
      tints.set([IDENTITY_PARTS.indexOf(part), Math.min(255, this.shades[index]), Math.round(Math.min(1, metres / MOTION_RANGE_M) * 255), codeOf(part, kind, this.afloat)], index * 4);
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(this.positions), 3));
    geometry.setAttribute("tint", new BufferAttribute(tints, 4, true));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/** A model's versions, ready for `placeModel`. */
export function identityModel(near: IdentityMesh, far: IdentityMesh | null, swapM: number, reachM: number, motion?: Motion): RoadsideModel {
  return { near: near.build(motion), far: far?.build(motion) ?? null, swapM, reachM };
}
