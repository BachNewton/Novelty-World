import { BufferAttribute, BufferGeometry } from "three/webgpu";
import { Model, type BoxOptions, type Part, type TubeOptions, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";
import { MOTION_KINDS, MOTION_RANGE_M, type MotionKind } from "../street/paint";

/*
 * The street kit's `Painted` is fixed to the street's own paints, so this is the same idea over the town's: one
 * roadside `Model` a paint, joined at the end, with the part in the tint's first channel and motion in the two the
 * street material reads. A refactor target: `Painted` generic over its paint list would make this class go.
 */

export const TOWN_PARTS = [
  "lamp-iron",
  "lamp-roof",
  "lamp-glass",
  "galvanised",
  "signal-black",
  "signal-red",
  "signal-amber",
  "signal-green",
  "signal-walk",
  "signal-stop",
  "plate-blue",
  "plate-white",
  "plate-black",
  "plate-yellow",
  "plate-back",
  "name-face",
  "stripe-black",
  "stripe-white",
  "post-wood",
  "board-white",
  "roof-red",
  "box-white",
  "soil",
  "leaf",
  "leaf-lit",
  "bloom-red",
  "bloom-white",
  "bike-red",
  "bike-blue",
  "bike-black",
  "bike-tyre",
  "bike-steel",
  "bike-saddle",
  "deck-boards",
  "float-dark",
  "boat-white",
  "boat-navy",
  "boat-under",
  "boat-deck",
  "boat-glass",
  "mast",
  "sail-cover",
  "clad-pale",
  "clad-grey",
  "clad-roof",
  "terminal-glass",
  "frame-dark",
  "steel-leg",
  "ramp-steel",
  "ramp-deck",
  "ramp-rail",
  "concrete",
  "ferry-white",
  "ferry-shade",
  "ferry-hull",
  "ferry-boot",
  "ferry-glass",
  "ferry-deck",
  "ferry-funnel",
  "ferry-funnel-top",
  "ferry-lifeboat",
  "ferry-steel",
] as const;

export type TownPart = (typeof TOWN_PARTS)[number];

export type TownMotion = (part: TownPart, at: V3) => { kind: MotionKind; metres?: number };

type Uv = readonly [number, number];

/** Any part: `TownPainted` replaces it, so which one doesn't matter. */
const UNREAD: Part = "galvanised";
const TINT_STRIDE = 4;

export class TownPainted {
  private readonly layers = new Map<TownPart, Model>();

  private layer(part: TownPart): Model {
    const known = this.layers.get(part);
    if (known !== undefined) return known;
    const model = new Model();
    this.layers.set(part, model);
    return model;
  }

  face(corners: readonly V3[], part: TownPart, shade = 1, uvs?: readonly Uv[]): this {
    this.layer(part).face(corners, UNREAD, shade, uvs);
    return this;
  }

  tube(from: V3, to: V3, radius: number, sides: number, options: TubeOptions, part: TownPart): this {
    this.layer(part).tube(from, to, radius, sides, options, UNREAD);
    return this;
  }

  spike(from: V3, to: V3, radius: number, part: TownPart, shade = 1): this {
    this.layer(part).spike(from, to, radius, UNREAD, shade);
    return this;
  }

  beam(from: V3, to: V3, wide: number, tall: number, part: TownPart, shade = 1, shadeTop = shade): this {
    this.layer(part).beam(from, to, wide, tall, UNREAD, shade, shadeTop);
    return this;
  }

  box(low: V3, high: V3, part: TownPart, options: BoxOptions = {}): this {
    this.layer(part).box(low, high, UNREAD, options);
    return this;
  }

  build(motion?: TownMotion): BufferGeometry {
    const parts = [...this.layers].map(([part, model]) => ({ part, geometry: model.build() }));
    const count = (name: string) => parts.reduce((sum, { geometry }) => sum + geometry.getAttribute(name).array.length, 0);
    const positions = new Float32Array(count("position"));
    const tints = new Uint8Array(count("tint"));
    const uvs = new Float32Array(count("uv"));
    const indices: number[] = [];
    let vertices = 0;
    for (const { part, geometry } of parts) {
      const position = geometry.getAttribute("position");
      positions.set(position.array, vertices * 3);
      tints.set(geometry.getAttribute("tint").array, vertices * TINT_STRIDE);
      uvs.set(geometry.getAttribute("uv").array, vertices * 2);
      for (let vertex = 0; vertex < position.count; vertex++) {
        const at = vertices + vertex;
        tints[at * TINT_STRIDE] = TOWN_PARTS.indexOf(part);
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

/** A town object's versions, ready for `placeModel`. */
export function townModel(near: TownPainted, far: TownPainted | null, swapM: number, reachM: number, motion?: TownMotion): RoadsideModel {
  return { near: near.build(motion), far: far?.build(motion) ?? null, swapM, reachM };
}

/** A ring of `sides` points upright in the x-y plane, for a lens or a sign's disc. */
export function uprightRing(centre: V3, radius: number, sides: number): V3[] {
  return Array.from({ length: sides }, (_, side) => {
    const angle = (side / sides) * 2 * Math.PI;
    return [centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius, centre[2]] as const;
  });
}
