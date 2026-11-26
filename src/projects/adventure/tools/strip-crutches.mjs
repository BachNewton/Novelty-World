// Takes the crutches off Mini Characters' Female A, in place. Kenney models her
// crutches into her arms but makes no clip for them: every clip swings her arms
// out, so the crutches splay with them and never meet the ground as crutches
// do, and with them she can't stand among the others. Without them she is
// whole, her arms Female B's but for the cut of her sleeves. So the crutches
// are the pieces of her arms with no point in common with Female B's arms,
// four on each, and those are dropped from her mesh. Run it again whenever the
// pack is copied in afresh:
//
//   node src/projects/adventure/tools/strip-crutches.mjs public/adventure/mini-characters

/* eslint-disable security/detect-non-literal-fs-filename -- a tool reading and writing the character files in the folder named on its command line */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [folder] = process.argv.slice(2);
if (folder === undefined) throw new Error("strip-crutches: pass the characters' folder");

function readGlb(file) {
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = bytes.subarray(20 + jsonLength + 8);
  return { gltf, bin };
}

function writeGlb(file, gltf, bin) {
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonChunk = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  writeFileSync(file, Buffer.concat([header, chunk(0x4e4f534a, jsonChunk), chunk(0x004e4942, bin)]));
}

const COMPONENTS = { SCALAR: 1, VEC3: 3, VEC4: 4 };
const TYPES = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

function view(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const Type = TYPES[accessor.componentType];
  return new Type(bin.buffer, bin.byteOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0), accessor.count * COMPONENTS[accessor.type]);
}

/** The body mesh's pieces: sets of the vertices its triangles use, joined by triangles or by sharing a position, each with the joint it moves with. */
function pieces({ gltf, bin }) {
  const node = gltf.nodes.find((n) => n.name === "body-mesh");
  const primitive = gltf.meshes[node.mesh].primitives[0];
  const positions = view(gltf, bin, primitive.attributes.POSITION);
  const indices = view(gltf, bin, primitive.indices);
  const joints = view(gltf, bin, primitive.attributes.JOINTS_0);
  const names = gltf.skins[node.skin].joints.map((j) => gltf.nodes[j].name);
  const count = positions.length / 3;
  const parent = [...Array(count).keys()];
  const root = (v) => (parent[v] === v ? v : (parent[v] = root(parent[v])));
  const at = (v) => [0, 1, 2].map((k) => positions[v * 3 + k].toFixed(4)).join(",");
  const first = new Map();
  for (let v = 0; v < count; v++) {
    if (first.has(at(v))) parent[root(v)] = root(first.get(at(v)));
    else first.set(at(v), v);
  }
  for (let t = 0; t < indices.length; t += 3) {
    parent[root(indices[t + 1])] = root(indices[t]);
    parent[root(indices[t + 2])] = root(indices[t]);
  }
  const used = new Set(indices);
  const byRoot = new Map();
  for (const v of used) {
    const piece = byRoot.get(root(v)) ?? { vertices: [], joint: names[joints[v * 4]] };
    piece.vertices.push(v);
    byRoot.set(root(v), piece);
  }
  return { primitive, indices, root, pieces: [...byRoot.values()].map((piece) => ({ ...piece, points: piece.vertices.map(at) })) };
}

const file = join(folder, "character-female-a.glb");
const her = readGlb(file);
const mesh = pieces(her);
const armsOfB = new Set(pieces(readGlb(join(folder, "character-female-b.glb"))).pieces.filter((p) => p.joint.startsWith("arm")).flatMap((p) => p.points));
const crutches = mesh.pieces.filter((p) => p.joint.startsWith("arm") && !p.points.some((point) => armsOfB.has(point)));
if (crutches.length === 0) throw new Error("strip-crutches: Female A has no crutches to take off; were they taken off already?");
for (const arm of ["arm-left", "arm-right"]) {
  const found = crutches.filter((p) => p.joint === arm).length;
  if (found !== 4) throw new Error(`strip-crutches: found ${found} crutch pieces on ${arm}, not the 4 the pack's crutch is made of; look again before taking anything off`);
}
const dropped = new Set(crutches.flatMap((p) => p.vertices.map(mesh.root)));

const kept = [];
for (let t = 0; t < mesh.indices.length; t += 3) {
  if (!dropped.has(mesh.root(mesh.indices[t]))) kept.push(mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]);
}
// The kept triangles go first in the index buffer, and the accessor reads only them.
mesh.indices.set(kept);
her.gltf.accessors[mesh.primitive.indices].count = kept.length;
writeGlb(file, her.gltf, her.bin);
console.log(`strip-crutches: took ${crutches.length} pieces, ${(mesh.indices.length - kept.length) / 3} triangles, off Female A`);
