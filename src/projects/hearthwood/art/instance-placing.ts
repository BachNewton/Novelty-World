import { InstancedInterleavedBuffer, type BufferAttribute, type InstancedBufferAttribute, type InstancedMesh } from "three";
import { buffer, instancedBufferAttribute, instanceIndex, mat4, storage } from "three/tsl";
import type { Node, NodeBuilder } from "three/webgpu";
import { typed } from "./tsl";

/*
 * An instance's placing, as a node, for a stage that works in the plant's
 * own space. Three places an instance before a material's position node
 * (and does the same in the shadows' passes), so a position stage sees the
 * vertex already placed and needs the instance's matrix to move it by its
 * own axes: read here the way three itself reads it (a storage buffer, a
 * uniform buffer while it fits, else per-instance attributes over the
 * matrices' own array).
 */

/** Per-instance attributes over the matrices' own array, which follow its version and update ranges, so whatever writes the matrices updates them too. */
function attributesOver(matrices: InstancedBufferAttribute): Node<"mat4"> {
  const copy = new InstancedInterleavedBuffer(matrices.array as Float32Array, 16, 1);
  Object.defineProperties(copy, {
    version: { get: () => matrices.version },
    updateRanges: { get: () => matrices.updateRanges },
  });
  const column = (offset: number) => instancedBufferAttribute<"vec4">(copy, "vec4", 16, offset);
  return mat4(column(0), column(4), column(8), column(12));
}

/** What three's node builder offers that its typings leave out: the most a uniform buffer may hold, in bytes. */
interface Limits {
  getUniformBufferLimit(): number;
}

const placings = new WeakMap<BufferAttribute, Node<"mat4">>();

/** A mesh that places its copies itself, in its material's own position node (the world's plants, `foliage/placing.ts`), names its copy's matrix here. */
export const OWN_PLACING = Symbol("hearthwood own placing");

/** The instance's matrix where the mesh drawn is instanced, else null: one node per mesh's matrices, so every stage that asks shares one binding. */
export function instancePlacing(builder: NodeBuilder): Node<"mat4"> | null {
  const own = (builder.object as { [OWN_PLACING]?: () => Node<"mat4"> })[OWN_PLACING];
  if (own) return own();
  const object = builder.object as Partial<InstancedMesh>;
  if (object.isInstancedMesh !== true || !object.instanceMatrix) return null;
  const matrices = object.instanceMatrix;
  const known = placings.get(matrices);
  if (known) return known;
  const placing = placingOf(builder, matrices);
  placings.set(matrices, placing);
  return placing;
}

function placingOf(builder: NodeBuilder, matrices: InstancedBufferAttribute): Node<"mat4"> {
  const count = Math.max(matrices.count, 1);
  if ((matrices as { isStorageInstancedBufferAttribute?: boolean }).isStorageInstancedBufferAttribute === true) return typed<"mat4">(storage(matrices, "mat4", count).element(instanceIndex));
  if (count * 64 <= (builder as unknown as Limits).getUniformBufferLimit()) return typed<"mat4">((buffer(matrices.array, "mat4", count) as unknown as { element: (i: Node) => Node }).element(instanceIndex));
  return attributesOver(matrices);
}
