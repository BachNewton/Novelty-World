import { cameraViewMatrix, float, floor, Fn, instanceIndex, mat4, mod, normalGeometry, positionLocal, storage, transformNormal, userData, varying, vec3, vec4, vertexColor } from "three/tsl";
import type { Node, NodeBuilder, StorageBufferAttribute } from "three/webgpu";
import { instancePlacing, OWN_PLACING } from "../instance-placing";
import { TINT_RANGE } from "../plant-instances";
import { typed } from "../tsl";

/*
 * Where a plant stands, as the foliage's and the seasons' stages read it.
 *
 * A plant is one copy of its design, placed by a matrix (where it stands,
 * how it is turned, leaned and scaled). The world's plants keep their
 * placings on the GPU (`components/valley/world-plants.tsx`): each draw of a
 * design reads, for each of its copies, which plant it is from the list the
 * culling made this frame, and the plant's placing from the store; its
 * material places the design's vertex in the world in its own position node
 * (`placedNodes`), so the features' position stages move a vertex that is
 * already in the world, and the shadow pass, which draws through the same
 * position node, casts whatever they moved. Anything else drawn as foliage
 * (the gallery's plants, the forage's bushes) is an ordinary instanced mesh,
 * which three places before the stages in the same way, and whose instance
 * matrix is read as three reads it (`instance-placing.ts`).
 *
 * The stages ask about the plant through the accessors below. A mesh that is
 * no plant at all (something solid, reached by a stage for every solid
 * thing) stands where its own mesh stands, a unit tall, with the bands where
 * they usually are.
 */

/** The GPU's list of placings and which copy is which, shared by every plant drawn. */
export interface PlacingBuffers {
  /** Four vec4s a plant: its matrix's columns, with its design, its bands and its colour in their fourth places (see `plant-instances.ts`). */
  placings: StorageBufferAttribute;
  /** For each drawn copy, which plant it is; each draw's copies start at its mesh's `userData.hwFirst`. */
  drawn: StorageBufferAttribute;
}

interface Placing {
  matrix: Node<"mat4">;
  root: Node<"vec3">;
  tall: Node<"float">;
  bands: Node<"float">;
  tint: Node<"vec3">;
}

const PLACING = Symbol("hearthwood placing");

interface PlacedObject {
  [PLACING]?: PlacingBuffers;
}

/** Marks a mesh as one of the world's plants, drawing the copies `buffers` lists from its `userData.hwFirst` on. */
export function drawPlacings(mesh: object, buffers: PlacingBuffers): void {
  const placed = mesh as PlacedObject & { [OWN_PLACING]?: () => Node<"mat4"> };
  placed[PLACING] = buffers;
  // Stages that read an instance's placing the shared way (the seasons') read this plant's.
  placed[OWN_PLACING] = () => storedPlacing(buffers).matrix;
}

const stored = new WeakMap<PlacingBuffers, Placing>();
const instanced = new WeakMap<Node<"mat4">, Placing>();

function storedPlacing(buffers: PlacingBuffers): Placing {
  const known = stored.get(buffers);
  if (known) return known;
  const placings = storage(buffers.placings, "vec4", buffers.placings.count).toReadOnly();
  const drawn = storage(buffers.drawn, "uint", buffers.drawn.count).toReadOnly();
  const first = typed<"uint">(userData("hwFirst", "uint"));
  const which = typed<"uint">(drawn.element(first.add(instanceIndex))).mul(4);
  const column = (i: number) => typed<"vec4">(placings.element(which.add(i)));
  const [c0, c1, c2, c3] = [column(0), column(1), column(2), column(3)];
  const packed = c2.w;
  const placing: Placing = {
    matrix: mat4(vec4(c0.xyz, 0), vec4(c1.xyz, 0), vec4(c2.xyz, 0), vec4(c3.xyz, 1)),
    root: c3.xyz,
    tall: c1.xyz.length(),
    bands: c1.w,
    tint: vec3(floor(packed.div(65536)), mod(floor(packed.div(256)), 256), mod(packed, 256)).mul(TINT_RANGE / 255),
  };
  stored.set(buffers, placing);
  return placing;
}

/** An instanced mesh's own matrix, as three reads it for placing the copy. */
function fromMatrix(matrix: Node<"mat4">): Placing {
  const known = instanced.get(matrix);
  if (known) return known;
  const placing: Placing = { matrix, root: matrix.mul(vec4(0, 0, 0, 1)).xyz, tall: matrix.mul(vec4(0, 1, 0, 0)).xyz.length(), bands: float(0), tint: vec3(1) };
  instanced.set(matrix, placing);
  return placing;
}

const UNPLACED: Placing = { matrix: mat4(vec4(1, 0, 0, 0), vec4(0, 1, 0, 0), vec4(0, 0, 1, 0), vec4(0, 0, 0, 1)), root: vec3(0), tall: float(1), bands: float(0), tint: vec3(1) };

function placingOf(builder: NodeBuilder): Placing {
  const object = builder.object as unknown as PlacedObject;
  const buffers = object[PLACING];
  if (buffers) return storedPlacing(buffers);
  const matrix = instancePlacing(builder);
  return matrix ? fromMatrix(matrix) : UNPLACED;
}

const part = <T extends keyof Placing>(key: T) => Fn((builder: NodeBuilder) => placingOf(builder)[key]) as unknown as () => Placing[T];

/** The plant's matrix, from its design's own space to the world. */
export const plantMatrix = part("matrix");
/** Where the plant stands, in the world. */
export const plantRoot = part("root");
/** How tall the plant stands, in metres (its scale up its own axis). */
export const plantTall = part("tall");
/**
 * How far the altitude bands sit from their usual heights where the plant
 * grows, in metres: the land's own shift of them, for snow lying against
 * the bands (the seasons' foliage). 0 off the world's plants.
 */
export const plantBands = part("bands");
const plantTint = part("tint");

/** The world's plants' own nodes for their material: the design placed by its plant, its normal turned with it, its colour shifted by its plant's. */
export function placedNodes(): { position: Node<"vec3">; normal: Node<"vec3">; surface: Node<"vec3"> } {
  const matrix = plantMatrix();
  const position = matrix.mul(vec4(positionLocal, 1)).xyz;
  const world = typed<"vec3">(transformNormal(normalGeometry, matrix));
  const normal = varying(cameraViewMatrix.mul(vec4(world, 0)).xyz, "vHwPlantNormal");
  const surface = varying(typed<"vec4">(vertexColor()).rgb.mul(plantTint()), "vHwPlantColour");
  return { position, normal, surface };
}
