// Checks every piece's collision stand-ins against the piece as drawn, for every kit, by the rule they are fitted to:
// a stand-in is right only where the player touches it. For each piece it reports the furthest the stand-ins'
// top lies from the drawn surface where a player stands, how many columns the player walks through in the drawn
// piece the stand-ins block, whether a piece that is climbed (stairs, steps, ramps, bridges) can be, and how many
// shapes it takes, and lists the pieces that break the rule or take more shapes than a player could feel.
// Run it whenever a pack is added, or the fitting changes:
//
//   npx tsx src/projects/adventure/tools/stand-ins.ts [piece ...]

/* eslint-disable security/detect-non-literal-fs-filename -- a tool reading the kits' own folders */
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { judge } from "@/shared/lib/physics/stand-ins";
import { colliderOf, COLUMN, fittingOf, shapesOf, WALKER } from "../colliders";
import { FANTASY_TOWN_PIECES } from "../fantasy-town";
import type { KitPiece } from "../kit";
import { NATURE_KIT_PIECES } from "../nature-kit";

/** More shapes than this for one piece is more than a player can feel: a staircase of boxes where a few would do. */
const MANY = 8;

const KITS: [string, readonly KitPiece[]][] = [
  ["public/adventure/fantasy-town", FANTASY_TOWN_PIECES],
  ["public/adventure/nature-kit", NATURE_KIT_PIECES],
];

/** A piece's meshes from its file, each placed in the piece's frame: its positions and triangles, nothing drawn. */
function meshesOf(path: string): THREE.Mesh[] {
  const file = readFileSync(path);
  const jsonLength = file.readUInt32LE(12);
  const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8")) as Gltf;
  const bin = file.subarray(20 + jsonLength + 8);
  const meshes: THREE.Mesh[] = [];
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue;
    const at = node.translation ?? [0, 0, 0];
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      const view = gltf.bufferViews[accessor.bufferView];
      const stride = (view.byteStride ?? 12) / 4;
      const floats = new Float32Array(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), (accessor.count - 1) * stride + 3);
      const positions = new Float32Array(accessor.count * 3);
      for (let i = 0; i < accessor.count; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = floats[i * stride + k] + at[k];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const ia = gltf.accessors[primitive.indices];
      const iv = gltf.bufferViews[ia.bufferView];
      const start = bin.byteOffset + (iv.byteOffset ?? 0) + (ia.byteOffset ?? 0);
      const bytes = ia.componentType === 5121 ? 1 : ia.componentType === 5123 ? 2 : 4;
      const raw = bin.buffer.slice(start, start + ia.count * bytes);
      const index = bytes === 1 ? new Uint8Array(raw) : bytes === 2 ? new Uint16Array(raw) : new Uint32Array(raw);
      geometry.setIndex(Array.from(index));
      const mesh = new THREE.Mesh(geometry);
      mesh.updateMatrixWorld(true);
      meshes.push(mesh);
    }
  }
  return meshes;
}

interface Gltf {
  nodes: { mesh?: number; translation?: [number, number, number] }[];
  meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; componentType: number }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
}

const only = new Set(process.argv.slice(2));
const rows: { piece: string; surface: number; blocked: number; climbed: boolean | null; shapes: number; flags: string[] }[] = [];
for (const [folder, pieces] of KITS) {
  for (const piece of pieces) {
    if (only.size > 0 && !only.has(piece)) continue;
    if (colliderOf(piece) === "none") continue;
    const meshes = meshesOf(`${folder}/${piece}.glb`);
    const shapes = shapesOf(piece, meshes);
    const fitting = fittingOf(piece);
    let judged;
    try {
      judged = judge(meshes, shapes, WALKER, fitting, COLUMN);
    } catch (error) {
      console.log(piece, JSON.stringify(shapes.filter((s) => s.kind === "hull")).slice(0, 600));
      throw error;
    }
    const { surface, excess, blocked, climbed } = judged;
    const flags: string[] = [];
    // A closed doorway is meant to block its opening; every other piece keeps its gaps.
    if (blocked > 0 && colliderOf(piece) !== "closed") flags.push("gap blocked");
    if (excess > COLUMN) flags.push("surface off");
    if (climbed === false) flags.push("not climbable");
    if (shapes.length > MANY) flags.push("many shapes");
    rows.push({ piece, surface, blocked, climbed, shapes: shapes.length, flags });
  }
}

const total = rows.reduce((sum, row) => sum + row.shapes, 0);
console.log(`${rows.length} pieces, ${total} shapes; worst surface ${Math.max(...rows.map((r) => r.surface)).toFixed(3)}, most shapes ${Math.max(...rows.map((r) => r.shapes))}`);
const flagged = rows.filter((row) => row.flags.length > 0).sort((a, b) => b.flags.length - a.flags.length || b.surface - a.surface);
for (const row of only.size > 0 ? rows : flagged) {
  if (only.size > 0) console.log(JSON.stringify(shapesOf(row.piece as KitPiece, meshesOf(`${row.piece.includes("_") ? KITS[1][0] : KITS[0][0]}/${row.piece}.glb`)).map((s) => s.kind === "box" ? [s.min, s.max].map((v) => v.map((n) => +n.toFixed(2))) : s.kind === "hull" ? `hull y ${Math.min(...s.points.filter((_, j) => j % 3 === 1)).toFixed(2)}..${Math.max(...s.points.filter((_, j) => j % 3 === 1)).toFixed(2)} x ${Math.min(...s.points.filter((_, j) => j % 3 === 0)).toFixed(2)}..${Math.max(...s.points.filter((_, j) => j % 3 === 0)).toFixed(2)} z ${Math.min(...s.points.filter((_, j) => j % 3 === 2)).toFixed(2)}..${Math.max(...s.points.filter((_, j) => j % 3 === 2)).toFixed(2)}` : s)));
  console.log(`${row.piece.padEnd(34)} surface ${row.surface.toFixed(3)}  blocked ${String(row.blocked).padStart(3)}  climbed ${String(row.climbed).padEnd(5)}  shapes ${String(row.shapes).padStart(3)}  ${row.flags.join(", ")}`);
}
if (only.size === 0) console.log(`${flagged.length} flagged`);
