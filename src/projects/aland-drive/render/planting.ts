import { IndirectStorageBufferAttribute, Mesh, StorageBufferAttribute, Triangle, Vector2, Vector3 as Colour, type BufferGeometry, type Material, type Node, type PerspectiveCamera, type Scene, type Vector3, type WebGPURenderer } from "three/webgpu";
import { atomicAdd, atomicMin, atomicStore, dot, float, Fn, If, instanceIndex, mix, select, smoothstep, storage, uint, uniform, vec2, vec3 } from "three/tsl";
import { seedOf, unitOf } from "../art/hash";
import { CLEARING_SLACK_M } from "./tree-place";
import { spiralCell, spiralPlaces } from "./spiral";
import { viewSides } from "./view-sides";

/*
 * Plants with no list anywhere, as the forest has no list of trees: a plant is a place
 * on a lattice of the world, and what stands there comes from images a tile already
 * has. Each frame a compute pass goes through every lattice's places within its reach
 * and in view, and a planting's own rule writes the survivors into a list per shape,
 * which an indirect draw draws whatever its length. So nothing is stored or streamed,
 * no tile changes, and the cost follows what's in view.
 *
 * Each lattice ends by its plants dissolving one at a time, each at a distance of its
 * own (`left`), so nothing ever shrinks or grows in: the forest's rule for detail.
 *
 * A pass walks a lattice's places in a spiral from the camera's cell outwards (`spiral.ts`),
 * so a list comes out near to far and the depth test spares what stands behind what's drawn.
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
  /** The lattice this place is on, for a planting culled `byLattice`. */
  lattice?: Lattice;
  /** Whether something standing on this ground, out to the planting's widest, is inside the view. */
  seenOn: (ground: Node<"float">) => Node<"bool">;
  /** How much of the plant is left at this distance: 1 until its own end, then dissolving to 0. */
  left: () => Node<"float">;
  /** Writes a plant into a shape's list, as the rows its material reads. */
  write: (shape: number, rows: Node<"vec4">[]) => void;
}

export interface PlantingSpec {
  lattices: Lattice[];
  /**
   * Whether `visit` writes other code for each lattice, telling them apart by `lattice`: each is then culled by a kernel
   * of its own. Otherwise one kernel culls every lattice, so the planting compiles one pipeline.
   */
  byLattice?: boolean;
  /** The most a plant stands out from its place. */
  widestM: number;
  shapes: BufferGeometry[];
  /** The most plants each shape's list holds; past that a frame draws no more of it. */
  capacities: number[];
  /** How many rows of four floats a plant carries. */
  rows: number;
  visit: (at: PlaceAt) => void;
  /** Which material each shape draws through: shapes of a family share one, and so one shader pipeline. None if the planting has one. */
  familyOf?: (shape: number) => number;
  /**
   * A family's material, reading the rows of the plant each instance draws, and where the camera is over the ground.
   * Whatever differs between its shapes is read from the plant's rows or from tables by its kind, never a constant of
   * one shape, or each shape would compile its own pipeline.
   */
  materialOf: (family: number, rows: Node<"vec4">[], camera: Node<"vec2">) => Material;
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

export function createPlanting(scene: Scene, renderer: WebGPURenderer, { lattices, byLattice = false, widestM, shapes, capacities, rows, visit, familyOf = () => 0, materialOf }: PlantingSpec): Planting {
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

  // One kernel goes through the places of every lattice it's given, each lattice's places after the last's, with that
  // lattice's numbers picked per place: a kernel is a pipeline, and two lattices' kernels with only their numbers apart
  // would compile the planting's whole rule twice.
  const pass = (given: Lattice[], lattice?: Lattice) => {
    const centres = given.map(() => uniform(new Vector2()));
    const starts = given.map(() => uniform(0, "uint"));
    const cull = Fn(() => {
      const which = starts.slice(1).reduce<Node<"uint">>((sum, start) => sum.add(select(instanceIndex.greaterThanEqual(start), uint(1), uint(0))), uint(0)).toVar();
      const pick = <Type extends "float" | "uint" | "vec2">(nodes: Node<Type>[]) => nodes.slice(1).reduce((chosen, node, at) => select(which.equal(at + 1), node, chosen), nodes[0]);
      const number = (of: (lattice: Lattice) => number) => pick(given.map((each) => float(of(each))));
      const stepM = number((each) => each.stepM).toVar();
      const index = instanceIndex.sub(pick(starts)).toVar();
      const cell = spiralCell(index).add(pick(centres)).toVar();
      const seed = cell.add(number((each) => each.salt)).toVar();
      const jitter = vec2(roll(seed, 1), roll(seed, 2)).sub(0.5).mul(stepM.mul(JITTER));
      const place = cell.mul(stepM).add(jitter).toVar();
      const distance = place.sub(camera2d).length().toVar();
      const perhapsSeen = view.sides.map(({ plane, rough }) => dot(plane.xz, place).add(rough).greaterThanEqual(0)).reduce((all, side) => all.and(side));

      If(distance.lessThan(number(reachOf)).and(perhapsSeen), () => {
        visit({
          seed,
          place,
          distance,
          lattice,
          seenOn: (ground) => view.sides.map(({ plane }) => dot(plane.xyz, vec3(place.x, ground, place.y)).add(plane.w).add(widestM).greaterThanEqual(0)).reduce((all, side) => all.and(side)),
          left: () => {
            const dissolves = mix(number(({ ends }) => ends[0]), number(({ ends }) => ends[1]), roll(seed, 3)).toVar();
            return float(1).sub(smoothstep(dissolves, dissolves.add(number(({ ends }) => ends[2])), distance));
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
      let places = 0;
      given.forEach((each, at) => {
        const rings = Math.ceil(reachOf(each) / each.stepM) + 1;
        centres[at].value.set(Math.floor(spot.x / each.stepM), Math.floor(spot.z / each.stepM));
        starts[at].value = places;
        places += spiralPlaces(rings);
      });
      cull.dispatchSize = [Math.ceil(places / PLACES_A_GROUP), 1, 1];
    };
    return { cull, aim };
  };
  const passes = byLattice ? lattices.map((lattice) => pass([lattice], lattice)) : [pass(lattices)];
  const cap = Fn(() => {
    capacities.forEach((items, shape) => {
      atomicMin(counters.element(countOf(shape)), uint(items));
    });
  })().compute(1);
  const computes = [reset, ...passes.map(({ cull }) => cull), cap];

  // Where a shape's plants start in the shared list is read per mesh, so a family's shapes share one shader.
  const materials = new Map<number, Material>();
  const materialFor = (family: number) => {
    const made = materials.get(family);
    if (made !== undefined) return made;
    const first = uniform(0, "uint").onObjectUpdate(({ object }) => (object?.userData.firstRow as number | undefined) ?? 0);
    const read = storage(list, "vec4", totalRows).toReadOnly();
    const carried = Array.from({ length: rows }, (_, at) => read.element(instanceIndex.mul(rows).add(first).add(at)).toVar());
    const material = materialOf(family, carried, camera2d);
    materials.set(family, material);
    return material;
  };
  const meshes = shapes.map((shape, index) => {
    const geometry = shape.clone();
    geometry.setIndirect(draws, index * DRAW_WORDS * Uint32Array.BYTES_PER_ELEMENT);
    const mesh = new Mesh(geometry, materialFor(familyOf(index)));
    mesh.userData.firstRow = firsts[index];
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
      }
      for (const material of materials.values()) material.dispose();
      for (const shape of shapes) shape.dispose();
      reset.dispose();
      for (const { cull } of passes) cull.dispose();
      cap.dispose();
      draws.dispose();
      list.dispose();
    },
  };
}
