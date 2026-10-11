import * as THREE from "three";
import type { Solid } from "./forms";
import type { ExplorerBuilder } from "./stage";

/*
 * A figure's parts, meshed once a session and shared by every copy of it.
 * None of a part's shape depends on the seed or the pose, so the meshing,
 * the slow step, can run anywhere: on this thread when a builder first needs
 * them (the bench, the tests), or ahead of time in a worker
 * (`figure-mesh.ts`), whose meshes are handed over here with `prime`.
 *
 * A worker's meshes come as typed arrays, moved rather than copied, by
 * `packParts` and `unpackParts`. A solid can't cross (its distance is a
 * function), so a part meshed in a worker keeps only its solid's bounds, and
 * asking how deep a point lies inside it throws: only the figures' clipping
 * check asks, and it meshes its figures on its own thread.
 */

export interface FigureParts<P> {
  /** Names the parts to a worker, which meshes them from its own copy of this module. */
  readonly id: string;
  /** Meshes every part afresh. */
  readonly mesh: () => P;
  /** The parts, meshed now if no one has yet. */
  readonly get: () => P;
  /** Whether they are meshed. */
  readonly ready: () => boolean;
  /** Takes parts meshed elsewhere, unless they already are. */
  readonly prime: (parts: unknown) => void;
}

export function figureParts<P>(id: string, mesh: () => P): FigureParts<P> {
  let meshed: P | undefined;
  return {
    id,
    mesh,
    get: () => (meshed ??= mesh()),
    ready: () => meshed !== undefined,
    prime: (parts) => {
      meshed ??= parts as P;
    },
  };
}

/** The parts each builder needs meshed before it can build without meshing. */
const needs = new WeakMap<ExplorerBuilder, readonly FigureParts<unknown>[]>();

/** Says which parts a builder builds from, so they can be meshed before it is called. */
export function declareParts<B extends ExplorerBuilder>(build: B, parts: readonly FigureParts<unknown>[]): B {
  needs.set(build, parts);
  return build;
}

/** The parts a builder builds from: none for one that meshes nothing (the pawn). */
export function partsOf(build: ExplorerBuilder): readonly FigureParts<unknown>[] {
  return needs.get(build) ?? [];
}

/** Whether a builder can build now without meshing anything. */
export function isMeshed(build: ExplorerBuilder): boolean {
  return partsOf(build).every((parts) => parts.ready());
}

type Typed = Float32Array | Uint32Array | Uint16Array | Uint8Array | Int8Array | Int16Array | Int32Array;

interface PackedAttribute {
  array: Typed;
  itemSize: number;
  normalized: boolean;
}

/** Parts as they cross to and from a worker: plain data and typed arrays. */
export type Packed =
  | null
  | boolean
  | number
  | string
  | readonly Packed[]
  | { $: "object"; entries: Record<string, Packed> }
  | { $: "vector3"; x: number; y: number; z: number }
  | { $: "solid"; min: readonly number[]; max: readonly number[] }
  | {
      $: "geometry";
      name: string;
      attributes: Record<string, PackedAttribute>;
      index: PackedAttribute | null;
      groups: { start: number; count: number; materialIndex?: number }[];
      userData: Packed;
    };

function packAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, buffers: Set<ArrayBufferLike>): PackedAttribute {
  if (attribute instanceof THREE.InterleavedBufferAttribute) throw new Error("A figure's part has an interleaved attribute, which can't be packed");
  const array = attribute.array as Typed;
  buffers.add(array.buffer);
  return { array, itemSize: attribute.itemSize, normalized: attribute.normalized };
}

function packValue(value: unknown, buffers: Set<ArrayBufferLike>): Packed {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((each) => packValue(each, buffers));
  if (value instanceof THREE.Vector3) return { $: "vector3", x: value.x, y: value.y, z: value.z };
  if (value instanceof THREE.BufferGeometry) {
    const geometry: THREE.BufferGeometry = value;
    if (Object.keys(value.morphAttributes).length > 0) throw new Error("A figure's part has morph attributes, which can't be packed");
    const userData = Object.fromEntries(
      Object.entries(value.userData as Record<string, unknown>).map(([key, data]) => {
        if (key !== "solid") return [key, packValue(data, buffers)];
        const { min, max } = data as Solid;
        return [key, { $: "solid", min: [...min], max: [...max] } satisfies Packed];
      }),
    );
    return {
      $: "geometry",
      name: value.name,
      attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, attribute]) => [name, packAttribute(attribute, buffers)])),
      index: value.index ? packAttribute(value.index, buffers) : null,
      groups: value.groups.map((group) => ({ ...group })),
      userData: { $: "object", entries: userData },
    };
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return { $: "object", entries: Object.fromEntries(Object.entries(value).map(([key, each]) => [key, packValue(each, buffers)])) };
  }
  throw new Error(`A figure's part holds something that can't be packed: ${Object.prototype.toString.call(value)}`);
}

/** Parts as plain data, and the buffers to move with them rather than copy. */
export function packParts(parts: unknown): { packed: Packed; transfer: ArrayBuffer[] } {
  const buffers = new Set<ArrayBufferLike>();
  const packed = packValue(parts, buffers);
  return { packed, transfer: [...buffers].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer) };
}

/** A solid that kept only its bounds on the way from a worker. */
function boundsOnly(id: string, min: readonly number[], max: readonly number[]): Solid {
  return {
    distance: () => {
      throw new Error(`${id} was meshed in a worker, which keeps only its solid's bounds; the clipping check meshes its figures on its own thread`);
    },
    min: [min[0], min[1], min[2]],
    max: [max[0], max[1], max[2]],
  };
}

function unpackAttribute({ array, itemSize, normalized }: PackedAttribute): THREE.BufferAttribute {
  return new THREE.BufferAttribute(array, itemSize, normalized);
}

function unpackValue(packed: Packed, id: string): unknown {
  if (packed === null || typeof packed !== "object") return packed;
  if (Array.isArray(packed)) return (packed as readonly Packed[]).map((each) => unpackValue(each, id));
  const tagged = packed as Exclude<Packed, readonly Packed[] | null | boolean | number | string>;
  switch (tagged.$) {
    case "object":
      return Object.fromEntries(Object.entries(tagged.entries).map(([key, each]) => [key, unpackValue(each, id)]));
    case "vector3":
      return new THREE.Vector3(tagged.x, tagged.y, tagged.z);
    case "solid":
      return boundsOnly(id, tagged.min, tagged.max);
    case "geometry": {
      const geometry = new THREE.BufferGeometry();
      geometry.name = tagged.name;
      for (const [name, attribute] of Object.entries(tagged.attributes)) geometry.setAttribute(name, unpackAttribute(attribute));
      if (tagged.index) geometry.setIndex(unpackAttribute(tagged.index));
      for (const { start, count, materialIndex } of tagged.groups) geometry.addGroup(start, count, materialIndex);
      geometry.userData = unpackValue(tagged.userData, id) as Record<string, unknown>;
      return geometry;
    }
  }
}

/** Parts packed by `packParts`, as they were, but for their solids (see above). */
export function unpackParts(packed: Packed, id: string): unknown {
  return unpackValue(packed, id);
}
