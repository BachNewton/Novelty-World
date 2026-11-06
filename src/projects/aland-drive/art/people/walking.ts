import { BufferAttribute, BufferGeometry, Mesh, StorageBufferAttribute } from "three/webgpu";
import { buildFar, buildNear } from "./body";
import { figureArrays, figureAttributes, specOf, strideShare, writeFigure } from "./crowd";
import { strideM } from "./gait";
import { PEOPLE_REACH_M, walkingMaterials, type PeopleInputs } from "./material";
import { posed } from "./poses";
import { measure } from "./skeleton";

/*
 * People walking: a crowd whose figures move every frame, as the bike crowd's
 * riders do. Each walker takes a slot while it's within reach of the eye, and its
 * shape is written into that slot's room in the near, far and shadow meshes once,
 * when it takes it; after that a frame writes only two short rows a walker, where
 * it stands and how far through its stride it is. So the crowd is three draws
 * however many walk, and a walker costs the CPU its own few numbers a frame.
 *
 * The stride runs with the ground covered, never with the clock: a figure goes
 * one whole stride, both feet, for every stride length it walks, so its feet hold
 * still on the ground. Slowing, it shortens its steps, and standing it stands.
 */

/** Room a slot keeps for a figure, near and far: more than any walking figure takes, which a test holds, in whole triangles. */
export const NEAR_SLOT = { vertices: 400, indices: 1440 } as const;
export const FAR_SLOT = { vertices: 80, indices: 192 } as const;
/** A walker's steps are full length from this pace up, and shorten in step with it below. */
const FULL_STEPS_MS = 1;
/** Its shortest steps, as a share of its full ones, for working out how fast it steps when slow. */
const SHORTEST_STEPS = 0.25;
/** A slot past the reach is out of everyone's sight. */
const NOWHERE = 1e7;

export interface Walker {
  /** Stable while the walker lives: its stride is kept per id and its slot freed when the id stops appearing. */
  id: string;
  /** Who it is: the same seed is the same person. */
  seed: number;
  /** Its feet on the ground, in scene metres. */
  x: number;
  y: number;
  z: number;
  /** Turns the figure's front, its +z, towards (sin yaw, cos yaw). */
  yaw: number;
  speedMS: number;
}

interface Taken {
  slot: number;
  seed: number;
  share: number;
  strideM: number;
  phase: number;
  x: number;
  z: number;
}

/** One version of the crowd's figures: a slot's room for each, its vertices tagged with their slot. */
function slotted(room: number, size: { vertices: number; indices: number }) {
  // A slot's room is read as triangles across the whole list: a third left over would join one slot to the next.
  if (size.indices % 3 !== 0) throw new Error(`a slot of ${size.indices} indices isn't whole triangles`);
  const arrays = figureArrays(room * size.vertices, room * size.indices);
  const slots = new Float32Array(room * size.vertices);
  for (let slot = 0; slot < room; slot++) slots.fill(slot, slot * size.vertices, (slot + 1) * size.vertices);
  const geometry = new BufferGeometry();
  const attributes = Object.entries(figureAttributes(arrays)).map(([name, { array, itemSize, normalized = false }]) => {
    const attribute = new BufferAttribute(array, itemSize, normalized);
    geometry.setAttribute(name, attribute);
    return attribute;
  });
  geometry.setAttribute("slot", new BufferAttribute(slots, 1));
  const index = new BufferAttribute(arrays.index, 1);
  geometry.setIndex(index);
  return {
    geometry,
    /** Writes a figure's shape into its slot, every index past it folded on to its first vertex. */
    write(slot: number, soup: ReturnType<typeof buildNear>, spec: ReturnType<typeof specOf>) {
      if (soup.vertexCount > size.vertices || soup.indices.length > size.indices) throw new Error(`a figure of ${soup.vertexCount} vertices and ${soup.indices.length} indices, in a slot for ${size.vertices} and ${size.indices}`);
      const [vertexAt, indexAt] = [slot * size.vertices, slot * size.indices];
      writeFigure(arrays, soup, spec, vertexAt, indexAt);
      arrays.index.fill(vertexAt, indexAt + soup.indices.length, indexAt + size.indices);
      for (const attribute of attributes) {
        attribute.addUpdateRange(vertexAt * attribute.itemSize, size.vertices * attribute.itemSize);
        attribute.needsUpdate = true;
      }
      index.addUpdateRange(indexAt, size.indices);
      index.needsUpdate = true;
    },
  };
}

/** Each slot's shadow: four corners tagged with the slot, and the patch's offset and size, written when a walker takes it. */
function slottedShadows(room: number) {
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  const corner = new Float32Array(room * 8);
  const slots = new Float32Array(room * 4);
  const indices = new Uint32Array(room * 6);
  for (let slot = 0; slot < room; slot++) {
    CORNERS.forEach(([a, b], at) => corner.set([a, b], (slot * 4 + at) * 2));
    slots.fill(slot, slot * 4, slot * 4 + 4);
    indices.set([0, 1, 2, 0, 2, 3].map((at) => slot * 4 + at), slot * 6);
  }
  const shape = new BufferAttribute(new Float32Array(room * 16), 4);
  const geometry = new BufferGeometry();
  // Where a corner is comes from its slot's place in the shader; the position only gives the draw its count.
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(room * 12), 3));
  geometry.setAttribute("corner", new BufferAttribute(corner, 2));
  geometry.setAttribute("slot", new BufferAttribute(slots, 1));
  geometry.setAttribute("shape", shape);
  geometry.setIndex(new BufferAttribute(indices, 1));
  return {
    geometry,
    write(slot: number, spec: ReturnType<typeof specOf>) {
      const { shadow } = posed("walk", measure(spec));
      const scale = spec.heightM / 1.72;
      for (let at = 0; at < 4; at++) shape.set([shadow.x * scale, shadow.z * scale, shadow.radiusM * scale, shadow.lengthM * scale], (slot * 4 + at) * 4);
      shape.addUpdateRange(slot * 16, 16);
      shape.needsUpdate = true;
    },
  };
}

/** Walkers by the crowd, `room` at most within reach at once. `draw` each frame with every walker as it stands; the meshes go in the scene once. */
export function createWalkingCrowd(inputs: PeopleInputs, room: number) {
  const places = new StorageBufferAttribute(new Float32Array(room * 4).fill(NOWHERE), 4);
  const gaits = new StorageBufferAttribute(new Float32Array(room * 4), 4);
  const materials = walkingMaterials(inputs, places, gaits);
  const near = slotted(room, NEAR_SLOT);
  const far = slotted(room, FAR_SLOT);
  const shadows = slottedShadows(room);
  const meshes = [new Mesh(shadows.geometry, materials.shadow), new Mesh(near.geometry, materials.near), new Mesh(far.geometry, materials.far)];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.visible = false;
  }
  const taken = new Map<string, Taken>();
  const free = Array.from({ length: room }, (_, slot) => room - 1 - slot);
  let drawn = 0;

  const take = (walker: Walker): Taken | null => {
    const slot = free.pop();
    if (slot === undefined) return null;
    const spec = specOf({ seed: walker.seed, pose: "walk" });
    near.write(slot, buildNear(spec, "walk"), spec);
    far.write(slot, buildFar(spec, "walk"), spec);
    shadows.write(slot, spec);
    const share = strideShare(spec);
    const made = { slot, seed: walker.seed, share, strideM: strideM(spec, share), phase: 0, x: walker.x, z: walker.z };
    taken.set(walker.id, made);
    return made;
  };
  const release = (id: string, { slot }: Taken) => {
    places.array.set([NOWHERE, 0, NOWHERE, 0], slot * 4);
    free.push(slot);
    taken.delete(id);
  };

  return {
    meshes,
    /** Each frame: every walker as it stands now, each within reach of `eye` in a slot of its own. */
    draw(walkers: readonly Walker[], eye: { x: number; z: number }) {
      const near = new Map(walkers.filter((walker) => Math.hypot(walker.x - eye.x, walker.z - eye.z) < PEOPLE_REACH_M).map((walker) => [walker.id, walker]));
      for (const [id, known] of taken) if (near.get(id)?.seed !== known.seed) release(id, known);
      drawn = 0;
      for (const walker of near.values()) {
        const known = taken.get(walker.id) ?? take(walker);
        if (!known) continue;
        const steps = known.share * Math.min(1, walker.speedMS / FULL_STEPS_MS);
        const covered = Math.hypot(walker.x - known.x, walker.z - known.z);
        known.phase = (known.phase + (2 * Math.PI * covered) / (known.strideM * Math.max(SHORTEST_STEPS, steps / known.share))) % (2 * Math.PI);
        [known.x, known.z] = [walker.x, walker.z];
        places.array.set([walker.x, walker.y, walker.z, walker.yaw], known.slot * 4);
        gaits.array.set([known.phase, 0, steps, 0], known.slot * 4);
        drawn++;
      }
      places.needsUpdate = true;
      gaits.needsUpdate = true;
      for (const mesh of meshes) mesh.visible = drawn > 0;
    },
    /** What the last `draw` drew: walkers within reach, draws, and the triangles their slots run. */
    counts() {
      return { walkers: drawn, draws: drawn > 0 ? meshes.length : 0, triangles: drawn > 0 ? (room * (NEAR_SLOT.indices + FAR_SLOT.indices)) / 3 + room * 2 : 0 };
    },
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
