import { BufferAttribute, BufferGeometry } from "three/webgpu";

/*
 * A small kit for writing low-poly models by hand. A model is indexed triangles
 * with a part (which paint) and a shade (baked light) per vertex, and no normals:
 * the material works out each face's own normal, so it's flat-shaded for free.
 * Nothing here needs a GPU or a page, so counts can be tested in Node.
 */

export const PARTS = [
  "galvanised",
  "lens",
  "pole-wood",
  "steel-band",
  "porcelain",
  "fence-wood",
  "fence-white",
  "post-wood",
  "mailbox-red",
  "shelter-red",
  "shelter-trim",
  "shelter-roof",
  "shelter-inside",
  "concrete",
  "concrete-dark",
  "rail-steel",
  "pier-wood",
  "pier-wood-pale",
  "pile-wood",
  "pontoon-hull",
  "bark",
  "bark-upper",
  "needles",
  "needles-lit",
  "sign-back",
  "sign-face",
] as const;

export type Part = (typeof PARTS)[number];

export type V3 = readonly [x: number, y: number, z: number];

/** 128 in the shade channel is 1, so the channel reaches a little under 2. */
const SHADE_UNIT = 128;

const add = (a: V3, b: V3, scale = 1): V3 => [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Two directions square to a line, the first as level as it can be. */
function across(from: V3, to: V3): [V3, V3] {
  const along = unit(sub(to, from));
  const side = unit(cross(along, Math.abs(along[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]));
  return [side, cross(side, along)];
}

/** A small repeatable random, so a model comes out the same every time. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export interface TubeOptions {
  /** Radius at the far end; the same as the near end if left out. */
  radiusTo?: number;
  cap?: boolean;
  shadeFrom?: number;
  shadeTo?: number;
}

export interface BoxOptions {
  /** Leave off the bottom, the one face of a thing standing on the ground nothing ever sees. */
  open?: boolean;
  shade?: number;
  /** The top's shade, when it differs from the sides'. */
  shadeTop?: number;
}

export class Model {
  private readonly positions: number[] = [];
  private readonly tints: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  private vertex(at: V3, part: Part, shade: number, uv: readonly [number, number] = [0, 0]): number {
    this.positions.push(...at);
    this.tints.push(PARTS.indexOf(part), Math.min(255, Math.round(shade * SHADE_UNIT)), 0, 0);
    this.uvs.push(...uv);
    return this.positions.length / 3 - 1;
  }

  /** A flat outline, as a fan from its first corner. The material is double-sided, so which way it winds doesn't matter. */
  face(corners: readonly V3[], part: Part, shade = 1, uvs?: readonly (readonly [number, number])[]): this {
    const first = this.positions.length / 3;
    corners.forEach((corner, index) => this.vertex(corner, part, shade, uvs?.[index]));
    for (let next = 2; next < corners.length; next++) this.indices.push(first, first + next - 1, first + next);
    return this;
  }

  /** A round section from one point to another. Three to six sides is the whole range this art needs. */
  tube(from: V3, to: V3, radius: number, sides: number, { radiusTo = radius, cap = false, shadeFrom = 1, shadeTo = shadeFrom }: TubeOptions, part: Part): this {
    const [side, up] = across(from, to);
    const first = this.positions.length / 3;
    for (let around = 0; around < sides; around++) {
      const angle = (around / sides) * 2 * Math.PI;
      const way = add(add([0, 0, 0], side, Math.cos(angle)), up, Math.sin(angle));
      this.vertex(add(from, way, radius), part, shadeFrom);
      this.vertex(add(to, way, radiusTo), part, shadeTo);
    }
    for (let around = 0; around < sides; around++) {
      const next = (around + 1) % sides;
      const [a, b, c, d] = [first + around * 2, first + around * 2 + 1, first + next * 2, first + next * 2 + 1];
      this.indices.push(a, c, b, b, c, d);
    }
    if (cap) for (let around = 1; around < sides - 1; around++) this.indices.push(first + 1, first + around * 2 + 1, first + around * 2 + 3);
    return this;
  }

  /** A thin thing narrowing to a point: three triangles, for limbs and stubs. */
  spike(from: V3, to: V3, radius: number, part: Part, shade = 1): this {
    const [side, up] = across(from, to);
    const tip = this.vertex(to, part, shade);
    const base = [0, 1, 2].map((around) => {
      const angle = (around / 3) * 2 * Math.PI;
      return this.vertex(add(add(from, side, Math.cos(angle) * radius), up, Math.sin(angle) * radius), part, shade);
    });
    for (let around = 0; around < 3; around++) this.indices.push(base[around], base[(around + 1) % 3], tip);
    return this;
  }

  /** A square-cut beam, any way round, with no ends. */
  beam(from: V3, to: V3, wide: number, tall: number, part: Part, shade = 1, shadeTop = shade): this {
    const [side, up] = across(from, to);
    const corner = (end: V3, a: number, b: number) => add(add(end, side, (a * wide) / 2), up, (b * tall) / 2);
    const ring: [number, number, number][] = [[1, 1, shadeTop], [-1, 1, shadeTop], [-1, -1, shade * 0.8], [1, -1, shade * 0.8]];
    const first = this.positions.length / 3;
    for (const [a, b, light] of ring) {
      this.vertex(corner(from, a, b), part, light);
      this.vertex(corner(to, a, b), part, light);
    }
    for (let around = 0; around < 4; around++) {
      const next = (around + 1) % 4;
      const [p, q, r, s] = [first + around * 2, first + around * 2 + 1, first + next * 2, first + next * 2 + 1];
      this.indices.push(p, r, q, q, r, s);
    }
    return this;
  }

  /** An upright box between two corners. */
  box(low: V3, high: V3, part: Part, { open = false, shade = 1, shadeTop = shade }: BoxOptions = {}): this {
    const [x0, y0, z0] = low;
    const [x1, y1, z1] = high;
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], part, shade);
    this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], part, shade);
    this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], part, shade);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], part, shade);
    this.face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], part, shadeTop);
    if (!open) this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], part, shade * 0.7);
    return this;
  }

  /** A lump of foliage: an uneven skirt, a smaller ring above it and a blunt top, with a flat underside, light above and dark below. */
  lump(base: V3, wide: number, tall: number, sides: number, random: () => number, parts: { top: Part; under: Part }): this {
    const first = this.positions.length / 3;
    const turn = random() * 6.283;
    const skirt: V3[] = [];
    const crown: V3[] = [];
    for (let around = 0; around < sides; around++) {
      const angle = turn + (around / sides) * 2 * Math.PI;
      const reach = wide * (0.8 + random() * 0.4);
      skirt.push(add(base, [Math.cos(angle) * reach, (random() - 0.5) * tall * 0.25, Math.sin(angle) * reach]));
      crown.push(add(base, [Math.cos(angle + 0.4) * reach * 0.6, tall * (0.85 + random() * 0.15), Math.sin(angle + 0.4) * reach * 0.6]));
    }
    skirt.forEach((point) => this.vertex(point, parts.top, 0.86));
    crown.forEach((point) => this.vertex(point, parts.top, 1.15));
    skirt.forEach((point) => this.vertex(point, parts.under, 0.72));
    for (let around = 0; around < sides; around++) {
      const next = (around + 1) % sides;
      this.indices.push(first + around, first + next, first + sides + around, first + sides + around, first + next, first + sides + next);
    }
    for (let around = 1; around < sides - 1; around++) {
      this.indices.push(first + sides, first + sides + around, first + sides + around + 1);
      this.indices.push(first + 2 * sides, first + 2 * sides + around, first + 2 * sides + around + 1);
    }
    return this;
  }

  /** The finished geometry: `position`, `tint` (part, shade), `uv` and an index. */
  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(this.positions), 3));
    geometry.setAttribute("tint", new BufferAttribute(Uint8Array.from(this.tints), 4, true));
    geometry.setAttribute("uv", new BufferAttribute(Float32Array.from(this.uvs), 2));
    geometry.setIndex(this.indices);
    return geometry;
  }
}
