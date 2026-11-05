import { IndirectStorageBufferAttribute, Mesh, StorageBufferAttribute, Triangle, Vector2, Vector3 as Colour, type BufferGeometry, type Material, type Node, type PerspectiveCamera, type Scene, type Vector3, type WebGPURenderer } from "three/webgpu";
import { atomicAdd, atomicMin, atomicStore, dot, float, Fn, If, instanceIndex, mix, smoothstep, storage, uint, uniform, vec2, vec3 } from "three/tsl";
import { seedOf, unitOf } from "../art/hash";
import { CLEARING_SLACK_M } from "./tree-place";
import { viewSides } from "./view-sides";

/*
 * Plants with no list anywhere, as the forest has no list of trees: a plant is a place
 * on a lattice of the world, and what stands there comes from images a tile already
 * has. Each frame a compute pass per lattice goes through the places within its reach
 * and in view, and a planting's own rule writes the survivors into a list per shape,
 * which an indirect draw draws whatever its length. So nothing is stored or streamed,
 * no tile changes, and the cost follows what's in view.
 *
 * Each lattice ends by its plants dissolving one at a time, each at a distance of its
 * own (`left`), so nothing ever shrinks or grows in: the forest's rule for detail.
 *
 * A list holds what a planting says it can, not every place in reach, so a planting
 * that's rare on the ground reserves memory for what it can really draw. A list that
 * fills keeps its first plants and draws no more.
 */

/** The world's tallest and lowest ground. */
const WORLD_HEIGHTS_M = [-10, 225] as const;
const JITTER = 0.9;
const PLACES_A_GROUP = 64;
const COUNT_AT = 1;
const DRAW_WORDS = 5;

export type Band = [from: number, to: number, run: number];

export interface Lattice {
  stepM: number;
  /** Each plant dissolves from a distance between the first two, by a roll for each, over the run. */
  ends: Band;
  /** Moves the lattice's rolls, so its plants aren't another's. */
  salt: number;
}

/**
 * A shape's area-weighted mean paint in each height band, in the paint's own light,
 * by its tint's part and shade: what a far version is painted, band by band, so its
 * swap with the near is of shape and never of colour. A band the shape doesn't reach
 * takes the highest one it does.
 */
export function bandColours(shape: BufferGeometry, colours: Colour[], tops: readonly number[]): Colour[] {
  const position = shape.getAttribute("position");
  const tint = shape.getAttribute("tint");
  const order = shape.getIndex();
  const corner = (at: number) => order?.getX(at) ?? at;
  const triangle = new Triangle();
  const middle = new Colour();
  const sums = tops.map(() => ({ sum: new Colour(), area: 0 }));
  for (let at = 0; at < (order?.count ?? position.count); at += 3) {
    const first = corner(at);
    triangle.setFromAttributeAndIndices(position, first, corner(at + 1), corner(at + 2));
    triangle.getMidpoint(middle);
    const band = sums[Math.max(0, tops.findIndex((top) => middle.y < top))];
    const area = triangle.getArea();
    band.sum.addScaledVector(colours[Math.round(tint.getX(first) * 255)], area * ((tint.getY(first) * 255) / 128));
    band.area += area;
  }
  const filled = sums.filter(({ area }) => area > 0);
  const top = filled[filled.length - 1];
  return sums.map(({ sum, area }) => (area > 0 ? sum.divideScalar(area) : top.sum.clone().divideScalar(top.area)));
}

export const reachOf = ({ ends }: Lattice) => ends[1] + ends[2];
export const placesWithin = (metres: number, stepM: number) => Math.ceil(Math.PI * (metres / stepM + 2) ** 2);
/** A lattice place's roll, the same bits on every GPU (`art/hash.ts`): its seed is its cell, offset by its lattice's salt. */
export const roll = (seed: Node<"vec2">, salt: number) => unitOf(seedOf(seed.x, seed.y), salt);

/** How far a shape spreads from its foot, across the ground. */
/** Whether a plant spreading this far from its foot stands clear of every building, by the clearing round them less what a read of it may be off by. */
export function clearOfBuildings(clearanceAt: (place: Node<"vec2">) => Node<"float">, place: Node<"vec2">, spread: Node<"float">): Node<"bool"> {
  return clearanceAt(place).sub(CLEARING_SLACK_M).greaterThan(spread);
}

export function spreadOf(shape: BufferGeometry): number {
  const position = shape.getAttribute("position");
  let widest = 0;
  for (let at = 0; at < position.count; at++) widest = Math.max(widest, Math.hypot(position.getX(at), position.getZ(at)));
  return widest;
}

/** A place within a lattice's reach that may be in view. */
export interface PlaceAt {
  seed: Node<"vec2">;
  place: Node<"vec2">;
  distance: Node<"float">;
  lattice: Lattice;
  /** Whether something standing on this ground, out to the planting's widest, is inside the view. */
  seenOn: (ground: Node<"float">) => Node<"bool">;
  /** How much of the plant is left at this distance: 1 until its own end, then dissolving to 0. */
  left: () => Node<"float">;
  /** Writes a plant into a shape's list, as the rows its material reads. */
  write: (shape: number, rows: Node<"vec4">[]) => void;
}

export interface PlantingSpec {
  lattices: Lattice[];
  /** The most a plant stands out from its place. */
  widestM: number;
  shapes: BufferGeometry[];
  /** The most plants each shape's list holds; past that a frame draws no more of it. */
  capacities: number[];
  /** How many rows of four floats a plant carries. */
  rows: number;
  visit: (at: PlaceAt) => void;
  /** A shape's material, reading the rows of the plant each instance draws, and where the camera is over the ground. */
  materialOf: (shape: number, rows: Node<"vec4">[], camera: Node<"vec2">) => Material;
}

export interface Planting {
  update: (spot: Vector3, camera: PerspectiveCamera) => void;
  /** Builds the compute pipelines, which would otherwise stall the first frame that uses them. */
  compile: () => Promise<void>;
  show: (shown: boolean) => void;
  /** How many plants each shape drew, read back from the GPU without holding a frame up. */
  counts: () => number[];
  triangles: (counts: number[]) => number;
  dispose: () => void;
}

export function createPlanting(scene: Scene, renderer: WebGPURenderer, { lattices, widestM, shapes, capacities, rows, visit, materialOf }: PlantingSpec): Planting {
  const camera2d = uniform(new Vector2());
  const view = viewSides(WORLD_HEIGHTS_M, widestM);

  const indicesOf = (shape: BufferGeometry) => shape.getIndex()?.count ?? 0;
  const draws = new IndirectStorageBufferAttribute(Uint32Array.from(shapes.flatMap((shape) => [indicesOf(shape), 0, 0, 0, 0])), DRAW_WORDS);
  const counters = storage(draws, "uint", draws.array.length).toAtomic();
  const countOf = (shape: number) => shape * DRAW_WORDS + COUNT_AT;

  const firsts = capacities.map((_, shape) => capacities.slice(0, shape).reduce((sum, items) => sum + items * rows, 0));
  const totalRows = capacities.reduce((sum, items) => sum + items * rows, 0);
  const list = new StorageBufferAttribute(totalRows, 4);
  const listed = storage(list, "vec4", totalRows);

  const reset = Fn(() => {
    shapes.forEach((_, shape) => {
      atomicStore(counters.element(countOf(shape)), uint(0));
    });
  })().compute(1);

  const passes = lattices.map((lattice) => {
    const { stepM, ends, salt } = lattice;
    const reachM = reachOf(lattice);
    const anchor = uniform(new Vector2());
    const placesAcross = uniform(1, "uint");

    const cull = Fn(() => {
      const cell = vec2(instanceIndex.mod(placesAcross), instanceIndex.div(placesAcross)).add(anchor).toVar();
      const seed = cell.add(salt).toVar();
      const jitter = vec2(roll(seed, 1), roll(seed, 2)).sub(0.5).mul(JITTER * stepM);
      const place = cell.mul(stepM).add(jitter).toVar();
      const distance = place.sub(camera2d).length().toVar();
      const perhapsSeen = view.sides.map(({ plane, rough }) => dot(plane.xz, place).add(rough).greaterThanEqual(0)).reduce((all, side) => all.and(side));

      If(distance.lessThan(reachM).and(perhapsSeen), () => {
        visit({
          seed,
          place,
          distance,
          lattice,
          seenOn: (ground) => view.sides.map(({ plane }) => dot(plane.xyz, vec3(place.x, ground, place.y)).add(plane.w).add(widestM).greaterThanEqual(0)).reduce((all, side) => all.and(side)),
          left: () => {
            const dissolves = mix(float(ends[0]), float(ends[1]), roll(seed, 3)).toVar();
            return float(1).sub(smoothstep(dissolves, dissolves.add(ends[2]), distance));
          },
          write: (shape, carried) => {
            const index = atomicAdd(counters.element(countOf(shape)), uint(1)).toVar();
            If(index.lessThan(capacities[shape]), () => {
              const row = index.mul(rows).add(firsts[shape]).toVar();
              carried.forEach((value, at) => listed.element(row.add(at)).assign(value));
            });
          },
        });
      });
    })().computeKernel([PLACES_A_GROUP]);

    const aim = (spot: Vector3) => {
      const across = Math.ceil((2 * reachM) / stepM) + 2;
      placesAcross.value = across;
      anchor.value.set(Math.floor(spot.x / stepM) - across / 2, Math.floor(spot.z / stepM) - across / 2);
      cull.dispatchSize = [Math.ceil((across * across) / PLACES_A_GROUP), 1, 1];
    };
    return { cull, aim };
  });
  const cap = Fn(() => {
    capacities.forEach((items, shape) => {
      atomicMin(counters.element(countOf(shape)), uint(items));
    });
  })().compute(1);
  const computes = [reset, ...passes.map(({ cull }) => cull), cap];

  const meshes = shapes.map((shape, index) => {
    const geometry = shape.clone();
    geometry.setIndirect(draws, index * DRAW_WORDS * Uint32Array.BYTES_PER_ELEMENT);
    const read = storage(list, "vec4", totalRows).toReadOnly();
    const carried = Array.from({ length: rows }, (_, at) => read.element(instanceIndex.mul(rows).add(firsts[index] + at)).toVar());
    const mesh = new Mesh(geometry, materialOf(index, carried, camera2d));
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });

  const aim = (spot: Vector3) => {
    camera2d.value.set(spot.x, spot.z);
    for (const pass of passes) pass.aim(spot);
  };
  aim({ x: 0, z: 0 } as Vector3);

  let counts = shapes.map(() => 0);
  let reading = false;
  let shownNow = true;
  return {
    update(spot, camera) {
      if (!shownNow) return;
      aim(spot);
      view.update(camera);
      void renderer.compute(computes);
    },
    async compile() {
      await renderer.computeAsync(computes);
    },
    show(shown) {
      shownNow = shown;
      for (const mesh of meshes) mesh.visible = shown;
    },
    counts() {
      if (!reading) {
        reading = true;
        void renderer.getArrayBufferAsync(draws).then((bytes) => {
          const read = new Uint32Array(bytes as ArrayBuffer);
          counts = shapes.map((_, shape) => (shownNow ? read[countOf(shape)] : 0));
          reading = false;
        });
      }
      return counts;
    },
    triangles: (drawn) => drawn.reduce((sum, count, shape) => sum + (count * indicesOf(shapes[shape])) / 3, 0),
    dispose() {
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      for (const shape of shapes) shape.dispose();
      reset.dispose();
      for (const { cull } of passes) cull.dispose();
      cap.dispose();
      draws.dispose();
      list.dispose();
    },
  };
}
