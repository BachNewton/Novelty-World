import { Frustum, Matrix4, Vector3, Vector4, type Camera } from "three";
import { atomicAdd, atomicStore, dot, float, fract, Fn, If, instanceIndex, length, max, min, Return, select, sin, storage, uint, uniform, uniformArray, vec3 } from "three/tsl";
import { IndirectStorageBufferAttribute, StorageBufferAttribute, type ComputeNode, type Node, type WebGPURenderer } from "three/webgpu";
import type { PlacingBuffers } from "../../art/foliage/placing";
import { PLACING_FLOATS } from "../../art/plant-instances";
import { typed } from "../../art/tsl";

/*
 * The world's plants on the GPU. Every chunk's plants are written once, as
 * it streams in, into a slot of one store of placings (`plant-instances.ts`
 * says what a placing holds). Each frame one compute pass goes over every
 * plant in the store and keeps those to draw: within its kind's reach from
 * the camera, kept by the thinning, and in view, its bounds swept along the
 * key light's way within the shadows' reach, so a plant behind the camera
 * whose shadow falls into view is kept to cast it. Each kept plant picks its
 * detail by its distance and is appended to its design and detail's list by
 * an atomic count, which is also the instance count of that design and
 * detail's indirect draw. So the CPU never copies a matrix after a chunk
 * streams in, and each design and detail is one draw.
 *
 * The shadow maps draw the same lists: a plant kept for the view or for its
 * shadow casts, and a plant culled from both casts no shadow anyone sees.
 */

/** The most plants a chunk can hold: the scatter tries one spot every 3.2 m across its 64 m. */
export const PLANTS_PER_CHUNK = 400;

/** Floats in one draw's indirect arguments: vertex count, instance count, first vertex, first instance. */
const ARGS = 4;

/** How far below a plant its shadow may still fall, in metres, for a plant whose ground drops away behind it. */
const SHADOW_FALL = 60;

/** How each design is drawn: in its near shape within `near`, its far shape out to `far`, past `thinFrom` only `keep` of its plants. */
export interface DesignReach {
  near: number;
  far: number;
  thinFrom: number;
  keep: number;
}

export class PlantCulling {
  readonly buffers: PlacingBuffers;
  /** The placings, written by the CPU per chunk. */
  readonly placings: Float32Array;
  /** Each slot's plant count (0 for a slot not in use). */
  private readonly counts: StorageBufferAttribute;
  /** Each design and detail's list: its first place in the drawn list and its room. */
  private readonly regions: StorageBufferAttribute;
  /** The indirect draws' arguments, one set per design and detail. */
  readonly args: IndirectStorageBufferAttribute;
  private readonly reset: ComputeNode;
  private readonly cull: ComputeNode;
  private readonly planes = Array.from({ length: 6 }, () => new Vector4());
  private readonly frustum = new Frustum();
  private readonly matrix = new Matrix4();
  private readonly eye = uniform(new Vector3());
  /** The way the key light shines (from it into the world), and whether it casts. */
  private readonly away = uniform(new Vector3(0, -1, 0));
  private readonly shadowReach = uniform(0);
  private readonly lightUp = uniform(1);
  private slotsInUse = 0;

  constructor(
    readonly slots: number,
    readonly draws: number,
    reaches: readonly DesignReach[],
  ) {
    const plants = slots * PLANTS_PER_CHUNK;
    this.placings = new Float32Array(plants * PLACING_FLOATS);
    const placings = new StorageBufferAttribute(this.placings, 4);
    // Room for every resident plant twice over: in either detail of its design.
    const drawn = new StorageBufferAttribute(new Uint32Array(plants * 2), 1);
    this.counts = new StorageBufferAttribute(new Uint32Array(slots), 1);
    this.regions = new StorageBufferAttribute(new Uint32Array(draws * 2), 1);
    this.args = new IndirectStorageBufferAttribute(new Uint32Array(draws * ARGS), ARGS);
    this.buffers = { placings, drawn };

    const args = storage(this.args, "uint", draws * ARGS).toAtomic();
    this.reset = Fn(() => {
      atomicStore(args.element(instanceIndex.mul(ARGS).add(1)), uint(0));
    })().compute(draws);

    const placing = storage(placings, "vec4", plants * 4).toReadOnly();
    const counts = storage(this.counts, "uint", slots).toReadOnly();
    const regions = storage(this.regions, "uint", draws * 2).toReadOnly();
    const out = storage(drawn, "uint", plants * 2);
    const reach = uniformArray(
      reaches.map((r) => new Vector4(r.near, r.far, Math.min(r.thinFrom, 1e9), r.keep)),
      "vec4",
    );
    const planes = uniformArray(this.planes, "vec4");

    this.cull = Fn(() => {
      const index = instanceIndex;
      If(index.mod(uint(PLANTS_PER_CHUNK)).greaterThanEqual(typed<"uint">(counts.element(index.div(uint(PLANTS_PER_CHUNK))))), () => {
        Return();
      });
      const c0 = typed<"vec4">(placing.element(index.mul(4)));
      const c1 = typed<"vec4">(placing.element(index.mul(4).add(1)));
      const root = typed<"vec4">(placing.element(index.mul(4).add(3))).xyz;
      const design = uint(c0.w);
      const r = typed<"vec4">(reach.element(design));
      const distance = length(root.xz.sub(this.eye.xz));
      const thinned = distance.greaterThan(r.z).and(hash(index).greaterThan(r.w));
      If(distance.greaterThan(r.y).or(thinned), () => {
        Return();
      });
      // A design stands a unit tall and about a unit across, so its bounds are a sphere round its middle.
      const tall = length(c1.xyz);
      const radius = max(tall, length(c0.xyz)).mul(0.75);
      const middle = root.add(vec3(0, tall.mul(0.5), 0));
      // Within the shadows' reach, the bounds are swept along the light as far as the plant's shadow can fall.
      const sweep = select(distance.lessThan(this.shadowReach), min(tall.add(SHADOW_FALL).div(max(this.lightUp, 0.05)), this.shadowReach.mul(2)), float(0));
      const end = middle.add(this.away.mul(sweep));
      let inside: Node<"float"> = float(1e9);
      for (let i = 0; i < 6; i++) {
        const plane = typed<"vec4">(planes.element(i));
        const reachesIn = max(dot(plane.xyz, middle), dot(plane.xyz, end)).add(plane.w).add(radius);
        inside = min(inside, reachesIn);
      }
      If(inside.lessThan(0), () => {
        Return();
      });
      const which = design.mul(2).add(select(distance.lessThanEqual(r.x), uint(0), uint(1)));
      const room = typed<"uint">(regions.element(which.mul(2).add(1)));
      If(room.equal(0), () => {
        Return();
      });
      const at = atomicAdd(args.element(which.mul(ARGS).add(1)), uint(1));
      out.element(typed<"uint">(regions.element(which.mul(2))).add(at)).assign(index);
    })().compute(plants);
  }

  /** Writes a chunk's plants into a slot: `count` placings already in `placings` at the slot's place. */
  fillSlot(slot: number, count: number): void {
    if (count > PLANTS_PER_CHUNK) throw new Error(`A chunk holds ${String(count)} plants, more than a slot's ${String(PLANTS_PER_CHUNK)}`);
    const floats = PLANTS_PER_CHUNK * PLACING_FLOATS;
    this.buffers.placings.addUpdateRange(slot * floats, count * PLACING_FLOATS);
    this.buffers.placings.needsUpdate = true;
    this.setCount(slot, count);
  }

  /** Stops drawing a slot's plants. */
  emptySlot(slot: number): void {
    this.setCount(slot, 0);
  }

  private setCount(slot: number, count: number): void {
    const counts = this.counts.array as Uint32Array;
    counts[slot] = count;
    this.counts.addUpdateRange(slot, 1);
    this.counts.needsUpdate = true;
    if (count > 0) this.slotsInUse = Math.max(this.slotsInUse, slot + 1);
  }

  /** Lays the drawn lists out again: each design and detail's first place and room, as `layoutRegions` gives them. */
  setRegions(start: Uint32Array, capacity: Uint32Array): void {
    const regions = this.regions.array as Uint32Array;
    for (let i = 0; i < this.draws; i++) {
      regions[i * 2] = start[i];
      regions[i * 2 + 1] = capacity[i];
    }
    this.regions.needsUpdate = true;
  }

  /** Sets how many vertices each design and detail's shape has. */
  setVertexCounts(vertices: ArrayLike<number>): void {
    const args = this.args.array as Uint32Array;
    for (let i = 0; i < this.draws; i++) args[i * ARGS] = vertices[i];
    this.args.needsUpdate = true;
  }

  /** The byte offset of a design and detail's draw arguments. */
  argsOffset(draw: number): number {
    return draw * ARGS * 4;
  }

  /** The frame's culling: the camera's view and the key light's way, then the counts cleared and the plants kept. */
  run(renderer: WebGPURenderer, camera: Camera, toLight: Vector3, shadowReach: number): void {
    camera.updateMatrixWorld();
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem, camera.reversedDepth);
    this.frustum.planes.forEach((p, i) => this.planes[i].set(p.normal.x, p.normal.y, p.normal.z, p.constant));
    this.eye.value.copy(camera.position);
    const length = toLight.length();
    const casts = shadowReach > 0 && toLight.y > 0 && length > 0;
    this.away.value.set(-toLight.x, -toLight.y, -toLight.z).divideScalar(length || 1);
    this.lightUp.value = casts ? toLight.y / length : 1;
    this.shadowReach.value = casts ? shadowReach : 0;
    this.cull.count = Math.max(1, this.slotsInUse * PLANTS_PER_CHUNK);
    void renderer.compute([this.reset, this.cull]);
  }

  dispose(): void {
    this.reset.dispose();
    this.cull.dispose();
  }
}

/** A plant's own number from 0 to 1, for the thinning. */
function hash(index: Node<"uint">): Node<"float"> {
  return fract(sin(float(index).mul(12.9898)).mul(43758.5453));
}
