import { BufferAttribute, BufferGeometry, type Node } from "three/webgpu";
import { float, fract, mix, step } from "three/tsl";
import { clumpSizeOf } from "./leaves";

/*
 * A bare plant made of wood and leaf clumps, for the lindens' and the bushes' leaf fall (`art/leaves.ts`): tapered
 * prisms from point to point for stems, limbs and twigs, and small squashed octahedra for the clumps of leaves at the
 * twigs' ends. Each vertex carries a `bare` vec4 beside its position: a clump's middle and its own share of the
 * plant's leaves (0 to 1) at which it falls, or for wood the way its face looks out and, below zero, how thin it is
 * (−1 a trunk, −2 a twig's tip). Its shader reads that through `bareVertex`, the same for every kit.
 */

type V3 = readonly [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const length = Math.hypot(...a);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** A roll from whole numbers, for a clump's own size and shape: the same every build. */
export const rolled = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Each clump's corners pushed in or out this much its own way. */
const CLUMP_UNEVEN = 0.3;
const CLUMP_SIDES = 4;

export class BareWood {
  readonly positions: number[] = [];
  readonly bare: number[] = [];
  readonly indices: number[] = [];
  private clumps = 0;

  private vertex(at: V3, bare: readonly [number, number, number, number]): number {
    this.positions.push(...at);
    this.bare.push(...bare);
    return this.positions.length / 3 - 1;
  }

  private join(lower: number[], upper: number[]) {
    for (let side = 0; side < lower.length; side++) {
      const next = (side + 1) % lower.length;
      if (upper.length === 1) this.indices.push(lower[side], lower[next], upper[0]);
      else this.indices.push(lower[side], lower[next], upper[side], upper[side], lower[next], upper[next]);
    }
  }

  /** A run of `sides` sides through points, each with its radius: a radius of 0 ends it in a point. `thin` runs from its first point to its last, 0 a trunk and 1 a twig's tip. */
  branch(points: readonly V3[], radii: readonly number[], sides: number, thin: readonly [number, number]): this {
    const way = unit(sub(points[points.length - 1], points[0]));
    const across = unit(Math.abs(way[1]) > 0.9 ? cross(way, [1, 0, 0]) : cross(way, [0, 1, 0]));
    const over = cross(way, across);
    let lower: number[] = [];
    points.forEach((point, at) => {
      const thinness = -1 - (thin[0] + ((thin[1] - thin[0]) * at) / (points.length - 1));
      const ring =
        radii[at] === 0
          ? [this.vertex(point, [way[0], way[1], way[2], thinness])]
          : Array.from({ length: sides }, (_, side) => {
              const angle = (side / sides) * 2 * Math.PI + at * 0.5;
              const out: V3 = [0, 1, 2].map((axis) => across[axis] * Math.cos(angle) + over[axis] * Math.sin(angle)) as unknown as V3;
              return this.vertex([point[0] + out[0] * radii[at], point[1] + out[1] * radii[at], point[2] + out[2] * radii[at]], [out[0], out[1], out[2], thinness]);
            });
      if (at > 0) this.join(lower, ring);
      lower = ring;
    });
    return this;
  }

  /** A clump of leaves: a squashed octahedron `wide` across its middle and `high` from it, uneven its own way, falling at its own share `own`. */
  clump(middle: V3, wide: number, high: number, own: number): this {
    const index = this.clumps++;
    const uneven = (salt: number) => 1 + CLUMP_UNEVEN * (rolled(index, salt) * 2 - 1);
    const at = (point: V3) => this.vertex(point, [middle[0], middle[1], middle[2], own]);
    const top = at([middle[0], middle[1] + high * uneven(2), middle[2]]);
    const turn = rolled(index, 3) * Math.PI;
    const ring = Array.from({ length: CLUMP_SIDES }, (_, side) => {
      const angle = turn + (side / CLUMP_SIDES) * 2 * Math.PI;
      const reach = wide * uneven(4 + side);
      return at([middle[0] + Math.sin(angle) * reach, middle[1] + high * 0.25 * (rolled(index, 9 + side) * 2 - 1), middle[2] + Math.cos(angle) * reach]);
    });
    const bottom = at([middle[0], middle[1] - high * 0.6 * uneven(8), middle[2]]);
    for (let side = 0; side < CLUMP_SIDES; side++) {
      const next = (side + 1) % CLUMP_SIDES;
      this.indices.push(top, ring[side], ring[next], ring[side], bottom, ring[next]);
    }
    return this;
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(Float32Array.from(this.positions), 3));
    geometry.setAttribute("bare", new BufferAttribute(Float32Array.from(this.bare), 4));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/** How far a clump may reach past its middle, as a share of its `wide`: what keeps a clump inside a crown. */
export const CLUMP_REACH_SHARE = 1 + CLUMP_UNEVEN;

/**
 * A vertex of a bare plant as its share of leaves has it: a clump's corners drawn in to its middle as it falls (each
 * clump's share varied by the plant's own roll), wood as it is. Weights, never a choice between branches, so the
 * shader builds each once.
 */
export function bareVertex(position: Node<"vec3">, bare: Node<"vec4">, share: Node<"float">, roll: Node<"float">) {
  const isClump = step(float(0), bare.w);
  const size = clumpSizeOf(share, fract(bare.w.add(roll.mul(0.37))));
  return {
    position: mix(position, mix(bare.xyz, position, size), isClump),
    isClump,
    /** For wood: 0 a trunk, 1 a twig's tip. */
    thin: bare.w.negate().sub(1).clamp(0, 1),
  };
}
