// Measures a kit's pieces from their GLB files, without a browser: each piece's
// extent on x, y and z in its own frame, and where its highest points lie, which
// tells which end of a sloped piece is up. Pass the kit's folder, and optionally
// the pieces to measure (all of them when none are named):
//
//   node src/projects/adventure/tools/kit-bounds.mjs public/adventure/fantasy-town roof-high wall-slope

/* eslint-disable security/detect-non-literal-fs-filename -- a tool reading the kit folder named on its command line */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [folder, ...named] = process.argv.slice(2);
if (folder === undefined) throw new Error("kit-bounds: pass the kit's folder");
const pieces = named.length > 0 ? named : readdirSync(folder).filter((f) => f.endsWith(".glb")).map((f) => f.slice(0, -4));

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const round = (v) => Math.round(v * 1000) / 1000;

for (const piece of pieces) {
  const file = readFileSync(join(folder, `${piece}.glb`));
  const jsonLength = file.readUInt32LE(12);
  const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = file.subarray(20 + jsonLength + 8);
  const points = [];
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue;
    const at = node.translation ?? [0, 0, 0];
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      const view = gltf.bufferViews[accessor.bufferView];
      const stride = (view.byteStride ?? 12) / 4;
      const floats = new Float32Array(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), (accessor.count - 1) * stride + COMPONENTS[accessor.type]);
      for (let i = 0; i < accessor.count; i++) points.push([0, 1, 2].map((k) => floats[i * stride + k] + at[k]));
    }
  }
  const min = [0, 1, 2].map((k) => round(Math.min(...points.map((p) => p[k]))));
  const max = [0, 1, 2].map((k) => round(Math.max(...points.map((p) => p[k]))));
  const tops = points.filter((p) => p[1] >= max[1] - 0.02);
  const span = (k) => `${round(Math.min(...tops.map((p) => p[k])))}..${round(Math.max(...tops.map((p) => p[k])))}`;
  console.log(`${piece.padEnd(34)} x ${min[0]}..${max[0]}  y ${min[1]}..${max[1]}  z ${min[2]}..${max[2]}  top at x ${span(0)} z ${span(2)}`);
}
