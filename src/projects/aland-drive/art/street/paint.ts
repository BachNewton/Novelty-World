import { BufferAttribute, BufferGeometry } from "three/webgpu";
import { Model, type BoxOptions, type Part, type TubeOptions, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";

/*
 * The roadside kit's `Model` writes the shapes; this adds the street's own paints
 * and how a vertex moves, in the `tint` channels the roadside kit leaves empty, so
 * a street model is a `RoadsideModel` and `placeModel` places it. Each paint is one
 * `Model`, and `build` joins them: the part a roadside `Model` was told is never read.
 */

export const STREET_PARTS = [
  "rail",
  "rail-post",
  "rail-spacer",
  "post-white",
  "post-band",
  "reflector",
  "camera-grey",
  "camera-dark",
  "camera-glass",
  "camera-lens",
  "concrete",
  "paving-stone",
  "grass",
  "grass-pale",
  "grass-seed",
  "stem",
  "petal-white",
  "petal-yellow",
  "petal-lupine",
  "petal-fireweed",
  "flower-eye",
  "leaf",
  "leaf-lit",
  "leaf-under",
  "bark",
  "bark-limb",
  "bench-wood",
  "iron",
  "park-green",
  "steel",
  "cafe-top",
  "cafe-frame",
  "canvas",
  "canvas-trim",
  "planter-wood",
  "soil",
  "flag-white",
  "flag-fi-blue",
  "flag-ax-blue",
  "flag-ax-yellow",
  "flag-ax-red",
  "pole-white",
  "pole-gold",
  "mast-wood",
  "midsummer-leaf",
  "midsummer-leaf-lit",
  "ribbon-red",
  "ribbon-blue",
  "bollard",
  "bollard-cap",
  "crane-yellow",
  "crane-dark",
  "crane-glass",
  "hull-white",
  "hull-stripe",
  "hull-under",
  "deck",
  "cabin",
  "spar",
  "sail-cover",
  "rigging",
] as const;

export type StreetPart = (typeof STREET_PARTS)[number];

/** How a vertex moves. A `run` part doesn't move, but is a run's: it rises from the ground at its reach rather than shrinking to a point, which would open gaps along it. */
export type MotionKind = "still" | "leaf" | "cloth" | "hull" | "run";

export const MOTION_KINDS: readonly MotionKind[] = ["still", "leaf", "cloth", "hull", "run"];
/** The furthest a vertex can be told to move, in metres: the whole range of the channel it's kept in. */
export const MOTION_RANGE_M = 0.6;

/** What moves, and how far, for a vertex of a part at a place in the model. */
export type Motion = (part: StreetPart, at: V3) => { kind: MotionKind; metres?: number };

/** Any part: `Painted` replaces it, so which one doesn't matter. */
const UNREAD: Part = "galvanised";
const TINT_STRIDE = 4;

/** A model with the same methods as the roadside `Model`, over the street's paints. */
export class Painted {
  private readonly layers = new Map<StreetPart, Model>();

  private layer(part: StreetPart): Model {
    const known = this.layers.get(part);
    if (known !== undefined) return known;
    const model = new Model();
    this.layers.set(part, model);
    return model;
  }

  face(corners: readonly V3[], part: StreetPart, shade = 1): this {
    this.layer(part).face(corners, UNREAD, shade);
    return this;
  }

  tube(from: V3, to: V3, radius: number, sides: number, options: TubeOptions, part: StreetPart): this {
    this.layer(part).tube(from, to, radius, sides, options, UNREAD);
    return this;
  }

  spike(from: V3, to: V3, radius: number, part: StreetPart, shade = 1): this {
    this.layer(part).spike(from, to, radius, UNREAD, shade);
    return this;
  }

  beam(from: V3, to: V3, wide: number, tall: number, part: StreetPart, shade = 1, shadeTop = shade): this {
    this.layer(part).beam(from, to, wide, tall, UNREAD, shade, shadeTop);
    return this;
  }

  box(low: V3, high: V3, part: StreetPart, options: BoxOptions = {}): this {
    this.layer(part).box(low, high, UNREAD, options);
    return this;
  }

  build(motion?: Motion): BufferGeometry {
    const parts = [...this.layers].map(([part, model]) => ({ part, geometry: model.build() }));
    const count = (name: string) => parts.reduce((sum, { geometry }) => sum + geometry.getAttribute(name).array.length, 0);
    const positions = new Float32Array(count("position"));
    const tints = new Uint8Array(count("tint"));
    const uvs = new Float32Array(count("uv"));
    const indices: number[] = [];
    let vertices = 0;
    for (const { part, geometry } of parts) {
      const position = geometry.getAttribute("position");
      const tint = geometry.getAttribute("tint");
      positions.set(position.array, vertices * 3);
      tints.set(tint.array, vertices * TINT_STRIDE);
      uvs.set(geometry.getAttribute("uv").array, vertices * 2);
      for (let vertex = 0; vertex < position.count; vertex++) {
        const at = vertices + vertex;
        tints[at * TINT_STRIDE] = STREET_PARTS.indexOf(part);
        if (motion === undefined) continue;
        const { kind, metres = 0 } = motion(part, [position.getX(vertex), position.getY(vertex), position.getZ(vertex)]);
        tints[at * TINT_STRIDE + 2] = Math.round(Math.min(1, metres / MOTION_RANGE_M) * 255);
        tints[at * TINT_STRIDE + 3] = MOTION_KINDS.indexOf(kind);
      }
      for (const index of geometry.getIndex()?.array ?? []) indices.push(index + vertices);
      vertices += position.count;
    }
    const joined = new BufferGeometry();
    joined.setAttribute("position", new BufferAttribute(positions, 3));
    joined.setAttribute("tint", new BufferAttribute(tints, TINT_STRIDE, true));
    joined.setAttribute("uv", new BufferAttribute(uvs, 2));
    joined.setIndex(indices);
    return joined;
  }
}

/** A street object's versions, ready for `placeModel`. */
export function streetModel(near: Painted, far: Painted | null, swapM: number, reachM: number, motion?: Motion): RoadsideModel {
  return { near: near.build(motion), far: far?.build(motion) ?? null, swapM, reachM };
}

/** Every part of a run rises rather than shrinks. */
export const runMotion: Motion = () => ({ kind: "run" });

/** A ring of `sides` points round a centre on a level plane: for discs, lids and table tops. */
export function levelRing(centre: V3, radius: number, sides: number, turn = 0): V3[] {
  return Array.from({ length: sides }, (_, side) => {
    const angle = turn + (side / sides) * 2 * Math.PI;
    return [centre[0] + Math.cos(angle) * radius, centre[1], centre[2] + Math.sin(angle) * radius] as const;
  });
}
