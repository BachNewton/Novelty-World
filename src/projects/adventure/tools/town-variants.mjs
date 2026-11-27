// Finds which of the Fantasy Town Kit's pieces another of its colour maps
// actually changes, and writes them into `town-variants.ts` for the map
// editor's palette. The maps are small colour swatches laid out alike, so a
// piece changes only if a texel its triangles sample differs between them: each
// triangle is laid over the map in UV space, and every texel it covers, or that
// a corner of it falls in, is compared. Rerun it when the kit or a map changes:
//
//   node src/projects/adventure/tools/town-variants.mjs

/* eslint-disable security/detect-non-literal-fs-filename -- a tool reading the kit's own folder */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, "../../../../public/adventure/fantasy-town");
const OUT = join(HERE, "../town-variants.ts");
/** The kit's other colour maps, as `fantasy-town.ts` names them. */
const TEXTURES = ["variation-a"];

async function pixelsOf(name) {
  const { data, info } = await sharp(join(KIT, "Textures", `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const READ = {
  5121: { size: 1, read: (b, at) => b.readUInt8(at), max: 255 },
  5123: { size: 2, read: (b, at) => b.readUInt16LE(at), max: 65535 },
  5125: { size: 4, read: (b, at) => b.readUInt32LE(at), max: 1 },
  5126: { size: 4, read: (b, at) => b.readFloatLE(at), max: 1 },
};

/** An accessor's values, as arrays of its components, normalised where the accessor says so. */
function accessorOf(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const { size, read, max } = READ[accessor.componentType];
  const components = COMPONENTS[accessor.type];
  const stride = view.byteStride ?? size * components;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let i = 0; i < accessor.count; i++) {
    const item = [];
    for (let k = 0; k < components; k++) {
      const value = read(bin, start + i * stride + k * size);
      item.push(accessor.normalized === true ? value / max : value);
    }
    values.push(item);
  }
  return values;
}

/** Every texel a triangle in UV space covers, or a corner of it falls in, by index into the map. */
function texelsOf(uvs, width, height) {
  const points = uvs.map(([u, v]) => [u * width, v * height]);
  const texels = new Set();
  const add = (x, y) => texels.add((((y % height) + height) % height) * width + (((x % width) + width) % width));
  for (const [x, y] of points) add(Math.floor(x), Math.floor(y));
  const [a, b, c] = points;
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(area) < 1e-9) return texels;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      const p = [x + 0.5, y + 0.5];
      const w = [
        (b[0] - p[0]) * (c[1] - p[1]) - (c[0] - p[0]) * (b[1] - p[1]),
        (c[0] - p[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (c[1] - p[1]),
        (a[0] - p[0]) * (b[1] - p[1]) - (b[0] - p[0]) * (a[1] - p[1]),
      ].map((s) => s / area);
      if (w.every((s) => s >= 0)) add(x, y);
    }
  }
  return texels;
}

/** Every texel of the kit's map a piece's textured triangles sample. */
function sampledBy(piece, width, height) {
  const file = readFileSync(join(KIT, `${piece}.glb`));
  const jsonLength = file.readUInt32LE(12);
  const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString("utf8"));
  const bin = file.subarray(20 + jsonLength + 8);
  const texels = new Set();
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const material = gltf.materials[primitive.material];
      if (material?.pbrMetallicRoughness?.baseColorTexture === undefined) continue;
      const uv = accessorOf(gltf, bin, primitive.attributes.TEXCOORD_0);
      const indices = primitive.indices === undefined ? uv.map((_, i) => i) : accessorOf(gltf, bin, primitive.indices).map(([i]) => i);
      for (let i = 0; i < indices.length; i += 3) {
        for (const texel of texelsOf([uv[indices[i]], uv[indices[i + 1]], uv[indices[i + 2]]], width, height)) texels.add(texel);
      }
    }
  }
  return texels;
}

const own = await pixelsOf("colormap");
const pieces = readdirSync(KIT).filter((f) => f.endsWith(".glb")).map((f) => f.slice(0, -4)).sort();
const sampled = new Map(pieces.map((piece) => [piece, sampledBy(piece, own.width, own.height)]));
const changed = {};
for (const texture of TEXTURES) {
  const other = await pixelsOf(texture);
  if (other.width !== own.width || other.height !== own.height) throw new Error(`town-variants: ${texture} isn't laid out as colormap.png`);
  const differs = (texel) => [0, 1, 2, 3].some((c) => own.data[texel * 4 + c] !== other.data[texel * 4 + c]);
  changed[texture] = pieces.filter((piece) => [...sampled.get(piece)].some(differs));
  console.log(`${texture}: ${changed[texture].length} of ${pieces.length} pieces change\n  ${changed[texture].join("\n  ")}`);
}

const lists = TEXTURES.map((texture) => `  "${texture}": [\n${changed[texture].map((piece) => `    "${piece}",`).join("\n")}\n  ],`).join("\n");
writeFileSync(
  OUT,
  `import type { TownPiece, TownTexture } from "./fantasy-town";

/**
 * The town kit's pieces each of its other colour maps changes: those whose
 * triangles sample a texel that differs from the kit's own map. Every other
 * piece looks the same in either. Written by \`tools/town-variants.mjs\` from the
 * kit's files; rerun it when the kit or a map changes.
 */
export const TOWN_VARIANTS: Record<TownTexture, readonly TownPiece[]> = {
${lists}
};
`,
);
console.log(`wrote ${OUT}`);
