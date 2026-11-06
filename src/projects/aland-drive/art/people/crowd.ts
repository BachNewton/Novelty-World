import { BufferAttribute, BufferGeometry } from "three/webgpu";
import { buildFar, buildNear, wearsSkirt } from "./body";
import { rollFigure, type FigureSpec } from "./figure";
import { CHILD_POSES, posed, type PoseName } from "./poses";
import { measure } from "./skeleton";
import type { Soup } from "./soup";

/*
 * Every person placed is baked once into one buffer: a pose, a place, a seed, and the
 * shader does the rest. No two people need share a shape, and a crowd is three draws
 * however many are in it, with nothing on the CPU per figure, frame or walk cycle.
 * Nothing here needs a GPU or a page, so a tile's worker can bake its own: the bake is
 * plain arrays (`bakeCrowdArrays`), which a worker hands over whole, and the meshes'
 * geometry is only those arrays wrapped (`crowdOf`).
 */

export interface PlacedFigure {
  x: number;
  /** The ground, the deck or the rock under them. */
  y: number;
  z: number;
  /** Turns the figure's +z towards (sin yaw, cos yaw). */
  yaw?: number;
  seed: number;
  pose: PoseName;
  /** Overrides what the seed rolled. */
  spec?: Partial<FigureSpec>;
  /** Where in its motions this person is, in radians; rolled from the seed if left out. */
  phase?: number;
}

/** What walking people do: a stride of about 1.5 m at 1.3 m/s, slower with age. `WALK_SPEED_M_S` is what a caller moves them at. */
const STRIDE_RATE = { adult: 5.6, older: 4.5, child: 7 } as const;
const STRIDE_SHARE = { adult: 1, older: 0.74, child: 0.9 } as const;
const SKIRT_STRIDE = 0.8;
export const WALK_SPEED_M_S = 1.3;

/** How long a person's stride is beside an adult's full one: shorter with age, and in a skirt. */
export const strideShare = (spec: FigureSpec) => STRIDE_SHARE[spec.age] * (wearsSkirt(spec.outfit) ? SKIRT_STRIDE : 1);

function gaitOf({ pose, seed, phase }: PlacedFigure, spec: FigureSpec): [number, number, number] {
  const roll = ((seed * 2654435761) >>> 0) / 4294967296;
  const at = phase ?? roll * 2 * Math.PI;
  if (pose !== "walk") return [at, 1, 0];
  return [at, STRIDE_RATE[spec.age] * (0.94 + roll * 0.12), strideShare(spec)];
}

/** A mesh's attributes by name, each with its item size, and its triangles. */
export interface CrowdPart {
  attributes: Record<string, { array: Float32Array | Uint8Array; itemSize: number; normalized?: boolean }>;
  index: Uint32Array;
}

/** The arrays every figure's vertices fill, whatever else a crowd keeps per vertex. */
export interface FigureArrays {
  position: Float32Array;
  inner: Float32Array;
  outer: Float32Array;
  rig: Uint8Array;
  tint: Uint8Array;
  index: Uint32Array;
}

export const figureArrays = (vertices: number, indices: number): FigureArrays => ({
  position: new Float32Array(vertices * 3),
  inner: new Float32Array(vertices * 3),
  outer: new Float32Array(vertices * 3),
  rig: new Uint8Array(vertices * 4),
  tint: new Uint8Array(vertices * 4),
  index: new Uint32Array(indices),
});

/** Writes one figure's shape into a body's arrays from a vertex and an index on, mirrored if its spec is. */
export function writeFigure(into: FigureArrays, soup: Soup, spec: FigureSpec, vertexAt: number, indexAt: number): void {
  const side = spec.mirrored ? -1 : 1;
  into.position.set(soup.positions, vertexAt * 3);
  into.inner.set(soup.inners, vertexAt * 3);
  into.outer.set(soup.outers, vertexAt * 3);
  into.rig.set(soup.rigs, vertexAt * 4);
  into.tint.set(soup.tints, vertexAt * 4);
  for (let vertex = vertexAt; vertex < vertexAt + soup.vertexCount; vertex++) {
    into.position[vertex * 3] *= side;
    into.inner[vertex * 3] *= side;
    into.outer[vertex * 3] *= side;
  }
  for (let at = 0; at < soup.indices.length; at++) into.index[indexAt + at] = soup.indices[at] + vertexAt;
}

export const figureAttributes = (body: FigureArrays): CrowdPart["attributes"] => ({
  position: { array: body.position, itemSize: 3 },
  inner: { array: body.inner, itemSize: 3 },
  outer: { array: body.outer, itemSize: 3 },
  rig: { array: body.rig, itemSize: 4, normalized: true },
  tint: { array: body.tint, itemSize: 4, normalized: true },
});

function merged(soups: readonly Soup[], figures: readonly PlacedFigure[], specs: readonly FigureSpec[]): CrowdPart {
  const vertices = soups.reduce((sum, soup) => sum + soup.vertexCount, 0);
  const body = figureArrays(vertices, soups.reduce((sum, soup) => sum + soup.indices.length, 0));
  const place = new Float32Array(vertices * 4);
  const gait = new Float32Array(vertices * 3);
  let [vertexAt, indexAt] = [0, 0];
  soups.forEach((soup, which) => {
    const figure = figures[which];
    writeFigure(body, soup, specs[which], vertexAt, indexAt);
    const [phase, rate, stride] = gaitOf(figure, specs[which]);
    for (let vertex = vertexAt; vertex < vertexAt + soup.vertexCount; vertex++) {
      place.set([figure.x, figure.y, figure.z, figure.yaw ?? 0], vertex * 4);
      gait.set([phase, rate, stride], vertex * 3);
    }
    vertexAt += soup.vertexCount;
    indexAt += soup.indices.length;
  });
  return { attributes: { ...figureAttributes(body), place: { array: place, itemSize: 4 }, gait: { array: gait, itemSize: 3 } }, index: body.index };
}

/** A soft patch of shade on the ground under each person: two triangles, stretched along the body when they lie down. */
function shadows(figures: readonly PlacedFigure[], specs: readonly FigureSpec[]): CrowdPart {
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  const position = new Float32Array(figures.length * 12);
  const corner = new Float32Array(figures.length * 8);
  const spread = new Float32Array(figures.length * 16);
  const place = new Float32Array(figures.length * 16);
  const index = new Uint32Array(figures.length * 6);
  figures.forEach((figure, which) => {
    const { shadow } = posed(figure.pose, measure(specs[which]));
    const [yaw, scale] = [figure.yaw ?? 0, specs[which].heightM / 1.72];
    const [cos, sin] = [Math.cos(yaw), Math.sin(yaw)];
    const [x, z] = [figure.x + (shadow.x * cos + shadow.z * sin), figure.z + (shadow.z * cos - shadow.x * sin)];
    const [radius, length] = [shadow.radiusM * scale, shadow.lengthM * scale];
    CORNERS.forEach(([a, b], at) => {
      const vertex = which * 4 + at;
      position.set([x, figure.y, z], vertex * 3);
      corner.set([a, b], vertex * 2);
      spread.set([cos * radius, -sin * radius, sin * length, cos * length], vertex * 4);
      place.set([figure.x, figure.y, figure.z, 0], vertex * 4);
    });
    const first = which * 4;
    index.set([first, first + 1, first + 2, first, first + 2, first + 3], which * 6);
  });
  return {
    attributes: {
      position: { array: position, itemSize: 3 },
      corner: { array: corner, itemSize: 2 },
      spread: { array: spread, itemSize: 4 },
      place: { array: place, itemSize: 4 },
    },
    index,
  };
}

export interface Crowd {
  near: BufferGeometry;
  far: BufferGeometry;
  shadow: BufferGeometry;
}

export interface CrowdArrays {
  near: CrowdPart;
  far: CrowdPart;
  shadow: CrowdPart;
}

export function specOf(figure: Pick<PlacedFigure, "seed" | "spec" | "pose">): FigureSpec {
  const spec = rollFigure(figure.seed, figure.spec);
  if (spec.age === "child" && !CHILD_POSES.includes(figure.pose)) throw new Error(`a child is never placed in ${figure.pose}`);
  return spec;
}

/** Everyone in a crowd as one mesh's worth of plain arrays. A crowd lives as long as its tile; nothing in it changes. */
export function bakeCrowdArrays(figures: readonly PlacedFigure[]): CrowdArrays {
  const specs = figures.map(specOf);
  return {
    near: merged(figures.map((figure, which) => buildNear(specs[which], figure.pose)), figures, specs),
    far: merged(figures.map((figure, which) => buildFar(specs[which], figure.pose)), figures, specs),
    shadow: shadows(figures, specs),
  };
}

export function geometryOf({ attributes, index }: CrowdPart): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, { array, itemSize, normalized = false }] of Object.entries(attributes)) geometry.setAttribute(name, new BufferAttribute(array, itemSize, normalized));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/** A baked crowd's arrays as the geometry its meshes draw, sharing the arrays rather than copying them. */
export function crowdOf({ near, far, shadow }: CrowdArrays): Crowd {
  return { near: geometryOf(near), far: geometryOf(far), shadow: geometryOf(shadow) };
}

/** Every array a crowd holds, for handing it from a worker without a copy. */
export function crowdBuffers({ near, far, shadow }: CrowdArrays): ArrayBuffer[] {
  return [near, far, shadow].flatMap(({ attributes, index }) => [...Object.values(attributes).map(({ array }) => array.buffer as ArrayBuffer), index.buffer as ArrayBuffer]);
}

export const bakeCrowd = (figures: readonly PlacedFigure[]): Crowd => crowdOf(bakeCrowdArrays(figures));
