import { BufferAttribute, BufferGeometry } from "three/webgpu";
import type { RoadsideModel } from "../roadside/index";
import { Model, PARTS, type BoxOptions, type Part, type TubeOptions, type V3 } from "../roadside/mesh";

/*
 * The roadside kit's way of writing a model, with this folder's own paints. Each
 * primitive is drawn by the roadside `Model` in a stand-in part and its vertices then
 * take a rural part, so a model from here is a `RoadsideModel` that `placeModel`
 * places like any other, drawn with `ruralMaterials`.
 *
 * `tint` carries: r the part, g the shade (both as the roadside kit does), b the
 * surface pattern the part asks for, a whether the foot shade is left off.
 */

/** What the near material draws on a part, in the shader. A far version shows none of them. */
export const PATTERNS = ["plain", "rapakivi", "boards", "birch", "fleece", "leaf", "straw"] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Each part's paint: a token, or two mixed, then a brightness, and the pattern it wears. All colour comes from the game's tokens. */
export const PAINT = {
  rapakivi: { from: "wall-red", to: "wall-cream", share: 0.33, gain: 0.98, pattern: "rapakivi" },
  "field-stone": { from: "wall-grey", to: "wall-red", share: 0.16, gain: 0.95, pattern: "rapakivi" },
  "field-stone-pink": { from: "wall-red", to: "wall-cream", share: 0.38, gain: 0.9, pattern: "rapakivi" },
  "wall-core": { from: "wall-grey", to: "wall-plinth", share: 0.5, gain: 0.6 },
    "bush-lit": { from: "tree-birch", gain: 1.12, pattern: "leaf" },
  "sallow-lit": { from: "tree-birch", to: "wall-pale", share: 0.13, gain: 0.95, pattern: "leaf" },
    "juniper-lit": { from: "tree-spruce", to: "tree-birch", share: 0.28, gain: 1.05, pattern: "leaf" },
  "birch-leaf": { from: "tree-birch", gain: 1.18, pattern: "leaf" },
  "birch-bark": { from: "tree-birch-bark", gain: 1.1, pattern: "birch" },
  "birch-twig": { from: "tree-bark", gain: 0.9 },
  "reed-straw": { from: "wall-yellow", to: "wall-cream", share: 0.35, gain: 0.82 },
  "reed-green": { from: "tree-birch", to: "wall-yellow", share: 0.3, gain: 0.95 },
  "reed-plume": { from: "wall-door", to: "wall-grey", share: 0.3, gain: 0.85 },
  "red-boards": { from: "wall-red", pattern: "boards" },
  "grey-boards": { from: "wall-grey", to: "tree-bark", share: 0.18, gain: 0.9, pattern: "boards" },
  "tar-boards": { from: "wall-door", to: "wall-plinth", share: 0.5, gain: 0.72, pattern: "boards" },
  trim: { from: "wall-trim" },
  "roof-dark": { from: "wall-plinth", gain: 0.82 },
  "roof-under": { from: "wall-plinth", gain: 0.5 },
  door: { from: "wall-door", gain: 0.9, pattern: "boards" },
  glass: { from: "wall-glass" },
  stone: { from: "wall-grey", to: "wall-pale", share: 0.2, gain: 0.82 },
  "mill-timber": { from: "wall-grey", to: "tree-bark", share: 0.45, gain: 0.85 },
  "mill-timber-dark": { from: "tree-bark", to: "wall-grey", share: 0.2, gain: 0.72 },
  deck: { from: "wall-grey", to: "wall-door", share: 0.2, gain: 1.05 },
  "deck-pale": { from: "wall-grey", to: "wall-door", share: 0.08, gain: 1.14 },
  pile: { from: "wall-door", to: "wall-plinth", share: 0.5, gain: 0.8 },
  "hull-white": { from: "wall-trim" },
  "hull-blue": { from: "water", to: "wall-plinth", share: 0.35, gain: 0.85 },
  "hull-inside": { from: "wall-cream", to: "wall-door", share: 0.42 },
  thwart: { from: "wall-cream", to: "wall-door", share: 0.22, gain: 1.05 },
  antifoul: { from: "wall-red", to: "wall-plinth", share: 0.5, gain: 0.8 },
  spar: { from: "wall-cream", to: "wall-grey", share: 0.3 },
  cover: { from: "water", to: "wall-plinth", share: 0.2, gain: 0.8 },
  sail: { from: "wall-trim", to: "wall-cream", share: 0.3 },
  "bale-wrap": { from: "wall-trim", gain: 1.02 },
  "bale-seam": { from: "wall-pale", gain: 0.9 },
  hay: { from: "wall-yellow", to: "wall-grey", share: 0.15, gain: 0.95, pattern: "straw" },
  "hay-end": { from: "wall-yellow", to: "wall-door", share: 0.25, gain: 0.72, pattern: "straw" },
  "tractor-red": { from: "car-body", to: "wall-red", share: 0.25 },
  "tractor-dark": { from: "wall-plinth", gain: 0.55 },
  "tractor-steel": { from: "wall-pale", to: "wall-grey", share: 0.5, gain: 0.8 },
  "tractor-hub": { from: "wall-yellow", gain: 0.95 },
  "tractor-glass": { from: "car-glass", to: "sky", share: 0.3 },
  lamp: { from: "car-lamp" },
  tyre: { from: "car-tyre", gain: 1.2 },
  wool: { from: "wall-cream", to: "wall-trim", share: 0.5, gain: 0.92, pattern: "fleece" },
  "wool-dark": { from: "wall-grey", to: "wall-plinth", share: 0.6, gain: 0.85, pattern: "fleece" },
  "sheep-face": { from: "wall-plinth", to: "wall-door", share: 0.4, gain: 0.7 },
  log: { from: "wall-cream", to: "wall-door", share: 0.3, gain: 1.05 },
  "log-end": { from: "wall-cream", to: "wall-yellow", share: 0.3, gain: 1.05 },
} as const satisfies Record<string, { from: string; to?: string; share?: number; gain?: number; pattern?: Pattern }>;

export type RuralPart = keyof typeof PAINT;
export const RURAL_PARTS = Object.keys(PAINT) as RuralPart[];

const STAND_IN: Part = "lens";
const LUMP_TOP: Part = "needles-lit";
const LUMP_UNDER: Part = "needles";
const SHADE_UNIT = 128;

function patternOf(part: RuralPart): number {
  const paint = PAINT[part];
  return PATTERNS.indexOf("pattern" in paint ? paint.pattern : "plain");
}

export class RuralMesh {
  private readonly positions: number[] = [];
  private readonly tints: number[] = [];
  private readonly indices: number[] = [];
  /** Off for what floats: the last metre above water isn't dark the way it is above grass. */
  private readonly footShade: number;

  constructor({ grounded = true }: { grounded?: boolean } = {}) {
    this.footShade = grounded ? 0 : 255;
  }

  /** Takes a primitive from the roadside `Model`; `partOf` names the paint from the part it was drawn in. */
  private take(draw: (model: Model) => Model, partOf: (drawnIn: number) => RuralPart): this {
    const geometry = draw(new Model()).build();
    const positions = geometry.getAttribute("position");
    const tints = geometry.getAttribute("tint");
    const first = this.positions.length / 3;
    for (let index = 0; index < positions.count; index++) {
      const part = partOf(tints.array[index * 4]);
      this.positions.push(positions.getX(index), positions.getY(index), positions.getZ(index));
      this.tints.push(RURAL_PARTS.indexOf(part), tints.array[index * 4 + 1], patternOf(part), this.footShade);
    }
    for (const index of geometry.index?.array ?? []) this.indices.push(first + index);
    return this;
  }

  face(corners: readonly V3[], part: RuralPart, shade = 1): this {
    return this.take((model) => model.face(corners, STAND_IN, shade), () => part);
  }

  tube(from: V3, to: V3, radius: number, sides: number, options: TubeOptions, part: RuralPart): this {
    return this.take((model) => model.tube(from, to, radius, sides, options, STAND_IN), () => part);
  }

  spike(from: V3, to: V3, radius: number, part: RuralPart, shade = 1): this {
    return this.take((model) => model.spike(from, to, radius, STAND_IN, shade), () => part);
  }

  beam(from: V3, to: V3, wide: number, tall: number, part: RuralPart, shade = 1, shadeTop = shade): this {
    return this.take((model) => model.beam(from, to, wide, tall, STAND_IN, shade, shadeTop), () => part);
  }

  box(low: V3, high: V3, part: RuralPart, options: BoxOptions = {}): this {
    return this.take((model) => model.box(low, high, STAND_IN, options), () => part);
  }

  lump(base: V3, wide: number, tall: number, sides: number, random: () => number, parts: { top: RuralPart; under: RuralPart }): this {
    return this.take((model) => model.lump(base, wide, tall, sides, random, { top: LUMP_TOP, under: LUMP_UNDER }), (drawnIn) => (drawnIn === PARTS.indexOf(LUMP_TOP) ? parts.top : parts.under));
  }

  /** Any shape from its own corners and triangles, with a shade worked out per corner. */
  solid(corners: readonly V3[], triangles: readonly (readonly [number, number, number])[], part: RuralPart, shadeAt: (corner: V3) => number): this {
    const first = this.positions.length / 3;
    for (const corner of corners) {
      this.positions.push(...corner);
      this.tints.push(RURAL_PARTS.indexOf(part), Math.min(255, Math.round(shadeAt(corner) * SHADE_UNIT)), patternOf(part), this.footShade);
    }
    for (const [a, b, c] of triangles) this.indices.push(first + a, first + b, first + c);
    return this;
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(this.positions), 3));
    geometry.setAttribute("tint", new BufferAttribute(Uint8Array.from(this.tints), 4, true));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

export const finished = (near: RuralMesh, far: RuralMesh | null, swapM: number, reachM: number): RoadsideModel => ({ near: near.build(), far: far?.build() ?? null, swapM, reachM });

/** Rings of corners, lowest first, closed at the top by a point. */
export function ringed(stations: readonly (readonly V3[])[], tip: V3): { corners: V3[]; triangles: [number, number, number][] } {
  const sides = stations[0].length;
  const corners = [...stations.flat(), tip];
  const triangles: [number, number, number][] = [];
  for (let ring = 0; ring < stations.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const [a, b] = [ring * sides + side, ring * sides + ((side + 1) % sides)];
      triangles.push([a, b, a + sides], [a + sides, b, b + sides]);
    }
  }
  const last = (stations.length - 1) * sides;
  for (let side = 0; side < sides; side++) triangles.push([last + side, last + ((side + 1) % sides), corners.length - 1]);
  return { corners, triangles };
}
